/*
 * Estrae, per ogni AREA di ogni continente, quali mostri ci sono dentro.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/enemies-map.cjs l90
 *   ... --all            tutti i continenti (lungo)
 *   ... --out=/app/tools/enemies.json   salva il risultato
 *
 * Nei file d'area gli spawn nemico sono oggetti con i campi
 *   mPos, mRot, Type, mEmClass, mSubType, mIsTarget
 * dove mEmClass e' l'id del mostro (lo stesso di mBossList.mEnemyID nelle quest)
 * e mIsTarget dice se e' il bersaglio della caccia e non fauna di contorno.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('node:zlib');
const { parseXfs } = require('./xfs-parse.cjs');

const RES = '/app/dist/public/res/download/android';
const ARC_KEY = 'kaseoa nkaeka;eawf3';

const argv = process.argv.slice(2);
const SOLO = argv.find((a) => /^l\d+$/.test(a));
const ALL = argv.includes('--all');
const OUT = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1];

function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') return [];
  const n = buf.readUInt16LE(14);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const pb = buf.subarray(off, off + 64);
    const nul = pb.indexOf(0);
    const filePath = pb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const size = buf.readUInt32LE(off + 68);
    const dataOff = buf.readUInt32LE(off + 76);
    if (dataOff + size > buf.length) continue;
    out.push({ filePath, data: buf.subarray(dataOff, dataOff + size) });
  }
  return out;
}

function swap4(d) {
  const r = Buffer.alloc(d.length);
  for (let i = 0; i + 3 < d.length; i += 4) { r[i] = d[i + 3]; r[i + 1] = d[i + 2]; r[i + 2] = d[i + 1]; r[i + 3] = d[i]; }
  const rem = d.length % 4;
  if (rem) d.copy(r, d.length - rem, d.length - rem);
  return r;
}

async function parseArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  const fileCount = buf.readUInt16LE(6);
  let body;
  if (magic === 'ARCC') {
    const { Blowfish } = await import('egoroof-blowfish');
    const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
    const sw = swap4(buf.subarray(8));
    let dec = Buffer.from(bf.decode(sw, Blowfish.TYPE.UINT8_ARRAY));
    if (dec.length < sw.length) dec = Buffer.concat([dec, Buffer.alloc(sw.length - dec.length)]);
    body = swap4(dec);
  } else body = buf.subarray(8);

  const out = [];
  for (let i = 0; i < fileCount; i++) {
    const off = i * 80;
    if (off + 80 > body.length) break;
    const nb = body.subarray(off, off + 64);
    const nul = nb.indexOf(0);
    const name = nb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const compSize = body.readUInt32LE(off + 68);
    const start = body.readUInt32LE(off + 76) - 8;
    if (start < 0 || start + compSize > body.length) continue;
    try { out.push({ name, data: Buffer.from(zlib.inflateSync(body.subarray(start, start + compSize))) }); } catch { }
  }
  return out;
}

// scorre l'albero e raccoglie ogni oggetto che ha mEmClass
function raccogliNemici(nodo, acc = []) {
  if (!nodo || typeof nodo !== 'object') return acc;
  if (Array.isArray(nodo)) { for (const n of nodo) raccogliNemici(n, acc); return acc; }
  if ('mEmClass' in nodo) acc.push({ emClass: nodo.mEmClass, subType: nodo.mSubType, isTarget: !!nodo.mIsTarget, type: nodo.Type });
  for (const v of Object.values(nodo)) if (v && typeof v === 'object') raccogliNemici(v, acc);
  return acc;
}

(async () => {
  const fpks = fs.readdirSync(RES, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.fpk') && path.basename(f).startsWith('quest.'))
    .map((f) => path.join(RES, f));

  const risultato = {};   // "l90_m12_a01" -> { nemici:[...], target:[...] }
  let arcLetti = 0, areeLette = 0, errori = 0;

  for (const a of fpks) {
    for (const e of parseFpk(fs.readFileSync(a))) {
      const m = e.filePath.match(/\/quest\/block\/(l\d+)\/(m\d+)\.arc$/);
      if (!m) continue;
      const [, land, map] = m;
      if (!ALL && SOLO && land !== SOLO) continue;
      if (!ALL && !SOLO && land !== 'l90') continue;

      arcLetti++;
      let files;
      try { files = await parseArc(e.data); } catch { errori++; continue; }

      for (const f of files) {
        const am = f.name.match(/m(\d+)a(\d+)$/);
        if (!am) continue;
        const chiave = `${land}_m${am[1]}_a${am[2]}`;
        try {
          const doc = parseXfs(f.data);
          const nemici = raccogliNemici(doc.root);
          areeLette++;
          risultato[chiave] = {
            tutti: [...new Set(nemici.map((n) => n.emClass))].sort((x, y) => x - y),
            bersagli: [...new Set(nemici.filter((n) => n.isTarget).map((n) => n.emClass))].sort((x, y) => x - y),
            conteggio: nemici.length,
          };
        } catch (err) {
          errori++;
          if (errori <= 3) console.log(`  errore su ${chiave}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\narchivi letti: ${arcLetti}   aree lette: ${areeLette}   errori: ${errori}`);

  const conBersaglio = Object.entries(risultato).filter(([, v]) => v.bersagli.length);
  console.log(`aree con almeno un mostro bersaglio: ${conBersaglio.length}/${Object.keys(risultato).length}`);

  console.log('\n=== prime 20 aree ===');
  for (const [k, v] of Object.entries(risultato).slice(0, 20)) {
    console.log(`  ${k.padEnd(14)} bersagli=[${v.bersagli.join(',')}]  tutti=[${v.tutti.join(',')}]  (${v.conteggio} spawn)`);
  }

  const tuttiBersagli = new Set();
  for (const v of Object.values(risultato)) for (const b of v.bersagli) tuttiBersagli.add(b);
  console.log(`\nmostri bersaglio distinti trovati: ${[...tuttiBersagli].sort((a, b) => a - b).join(', ')}`);

  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(risultato, null, 1)); console.log(`\nsalvato in ${OUT}`); }
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

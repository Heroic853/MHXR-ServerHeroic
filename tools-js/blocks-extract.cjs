/*
 * Estrae le definizioni dei blocchi mappa dagli archivi del gioco.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/blocks-extract.cjs l90 m12
 *   ... l90 m12 --dump=/tmp/blk     salva i file estratti per ispezionarli
 *
 * I blocchi si chiamano l90_m12_a01_0011 e nel gioco stanno in
 *   /arc_cmn/quest/block/l90/m12.arc   dentro uno degli archivi quest.*.fpk
 *
 * Formati (portati da src/tools/fpk/formats/*.ts, che sono TypeScript ed ESM:
 * qui servono in CommonJS perche' il container di produzione non ha tsx):
 *   FPK  : header 16 byte, voci da 80 (path 64 + size + offset)
 *   ARC  : header 8 byte; se la firma e' "ARCC" il corpo e' cifrato Blowfish
 *          con chiave fissa e byte invertiti a gruppi di 4; i file dentro sono
 *          compressi con zlib.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('node:zlib');

const RES = '/app/dist/public/res/download/android';
const ARC_KEY = 'kaseoa nkaeka;eawf3';

const argv = process.argv.slice(2);
const LAND = argv.find((a) => /^l\d+$/.test(a)) || 'l90';
const MAP = argv.find((a) => /^m\d+$/.test(a)) || 'm12';
const DUMP = (argv.find((a) => a.startsWith('--dump=')) || '').split('=')[1];

function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') return null;
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

function swap4(data) {
  const r = Buffer.alloc(data.length);
  for (let i = 0; i + 3 < data.length; i += 4) {
    r[i] = data[i + 3]; r[i + 1] = data[i + 2]; r[i + 2] = data[i + 1]; r[i + 3] = data[i];
  }
  const rem = data.length % 4;
  if (rem > 0) data.copy(r, data.length - rem, data.length - rem);
  return r;
}

async function parseArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'ARC\0' && magic !== 'ARCC') throw new Error(`firma ARC non valida: ${JSON.stringify(magic)}`);
  const fileCount = buf.readUInt16LE(6);

  let body;
  if (magic === 'ARCC') {
    const { Blowfish } = await import('egoroof-blowfish');
    const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
    const swapped = swap4(buf.subarray(8));
    let dec = Buffer.from(bf.decode(swapped, Blowfish.TYPE.UINT8_ARRAY));
    if (dec.length < swapped.length) dec = Buffer.concat([dec, Buffer.alloc(swapped.length - dec.length)]);
    body = swap4(dec);
  } else {
    body = buf.subarray(8);
  }

  const entries = [];
  for (let i = 0; i < fileCount; i++) {
    const off = i * 80;
    if (off + 80 > body.length) break;
    const nb = body.subarray(off, off + 64);
    const nul = nb.indexOf(0);
    const name = nb.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const compSize = body.readUInt32LE(off + 68);
    const offset = body.readUInt32LE(off + 76);
    const start = offset - 8;
    if (start < 0 || start + compSize > body.length) continue;
    let data;
    try { data = Buffer.from(zlib.inflateSync(body.subarray(start, start + compSize))); }
    catch { data = null; }
    entries.push({ name, compSize, data });
  }
  return { magic, fileCount, entries };
}

(async () => {
  const bersaglio = `/arc_cmn/quest/block/${LAND}/${MAP}.arc`;
  console.log(`cerco ${bersaglio}\n`);

  const fpks = fs.readdirSync(RES, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.fpk') && path.basename(f).startsWith('quest.'))
    .map((f) => path.join(RES, f));

  let trovato = null;
  for (const a of fpks) {
    const entries = parseFpk(fs.readFileSync(a));
    if (!entries) continue;
    const e = entries.find((x) => x.filePath === bersaglio);
    if (e) { trovato = { archivio: path.basename(a), data: e.data }; break; }
  }

  if (!trovato) { console.log('NON trovato in nessun quest.*.fpk'); return; }
  console.log(`trovato in ${trovato.archivio}, ${trovato.data.length} byte`);

  const arc = await parseArc(trovato.data);
  console.log(`ARC: firma=${JSON.stringify(arc.magic)} file=${arc.fileCount}\n`);

  console.log('contenuto:');
  for (const e of arc.entries.slice(0, 30)) {
    const stato = e.data ? `${e.data.length} byte` : 'DECOMPRESSIONE FALLITA';
    console.log(`  ${e.name.padEnd(30)} ${stato}`);
  }
  if (arc.entries.length > 30) console.log(`  ... altri ${arc.entries.length - 30}`);

  if (DUMP) {
    fs.mkdirSync(DUMP, { recursive: true });
    let n = 0;
    for (const e of arc.entries) {
      if (!e.data) continue;
      const dest = path.join(DUMP, e.name.replace(/[\\/]/g, '_'));
      fs.writeFileSync(dest, e.data);
      n++;
    }
    console.log(`\nsalvati ${n} file in ${DUMP}`);
  }
})().catch((e) => { console.error('ERRORE:', e.message); process.exit(1); });

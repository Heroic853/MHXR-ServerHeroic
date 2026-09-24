/*
 * Costruisce il catalogo COMPLETO di tutto cio' che un giocatore puo' ricevere,
 * scansionando tutti gli archivi resident dell'apk.
 *
 * Perche' serve: il modello utente ha nove famiglie di oggetti (augite,
 * equipment, growth_item, limited, matatabi, material, payment, point, power),
 * ma finora avevamo le tabelle verificate solo per due — materiali (4878) ed
 * equipaggiamenti (19956). Le ricompense delle quest contengono 218 id che non
 * cadono in nessuna delle due: finche' non si sa cosa sono, l'unica cosa
 * sicura e' scartarli, e il giocatore perde quelle ricompense.
 *
 * Ogni tabella "*_define" del gioco ha la stessa forma {mNo, mName, Hash}: il
 * nome in codice e l'id numerico. Scansionandole tutte si ottiene la mappa
 * completa id -> (nome, tabella di provenienza), e da quella si capisce a quale
 * famiglia appartiene ogni id.
 *
 *   node catalogo-completo.cjs
 *   node catalogo-completo.cjs --json    scrive catalogo-oggetti.json
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_VOCE = 80;
const DIM_HEADER = 8;
const SCRIVI = process.argv.includes('--json');

// Gli archivi stanno nell'apk scompattata, fuori dal progetto.
const DIR_ARC = path.join(
  'D:', '000 MHXR SERVER HACK', 'Monster Hunter XR', 'Resources Files Games',
  'MHXR_base', 'assets', 'nativeAndroid', 'arc_cmn', 'resident',
);

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3]; out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1]; out[i + 3] = buf[i];
  }
  const resto = buf.length % 4;
  if (resto > 0) buf.copy(out, buf.length - resto, buf.length - resto);
  return out;
}

function decifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  let chiaro = Buffer.from(bf.decode(girato, Blowfish.TYPE.UINT8_ARRAY));
  if (chiaro.length < girato.length) {
    chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  }
  return inverti(chiaro);
}

const senzaNulli = (b) => {
  const i = b.indexOf(0);
  return b.toString('utf-8', 0, i === -1 ? b.length : i);
};

function leggiArc(percorso) {
  const buf = fs.readFileSync(percorso);
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'ARC\0' && magic !== 'ARCC') return [];
  const numFile = buf.readUInt16LE(6);
  const corpo = magic === 'ARCC' ? decifra(buf.subarray(DIM_HEADER)) : buf.subarray(DIM_HEADER);

  const voci = [];
  for (let i = 0; i < numFile; i++) {
    const off = i * DIM_VOCE;
    const nome = senzaNulli(corpo.subarray(off, off + 64));
    const compSize = corpo.readUInt32LE(off + 68);
    const inizio = corpo.readUInt32LE(off + 76) - DIM_HEADER;
    if (inizio < 0 || inizio + compSize > corpo.length) continue;
    try {
      voci.push({ nome, dati: Buffer.from(zlib.inflateSync(corpo.subarray(inizio, inizio + compSize))) });
    } catch { /* non tutto e' zlib */ }
  }
  return voci;
}

function trovaRecord(nodo, prof = 0) {
  if (!nodo || typeof nodo !== 'object' || prof > 6) return null;
  if (Array.isArray(nodo.mpArray) && nodo.mpArray.length) return nodo.mpArray;
  if (Array.isArray(nodo.array) && nodo.array.length) return nodo.array;
  for (const v of Object.values(nodo)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    const t = trovaRecord(v, prof + 1);
    if (t) return t;
  }
  return null;
}

const catalogo = new Map(); // id -> {nome, tabella, archivio}
const perTabella = new Map();

const archivi = fs.readdirSync(DIR_ARC).filter((f) => f.endsWith('.arc'));
console.log(`archivi da scansionare: ${archivi.length}\n`);

for (const a of archivi) {
  for (const v of leggiArc(path.join(DIR_ARC, a))) {
    const nomeFile = v.nome.replace(/\\/g, '/');
    if (!/_define$/.test(nomeFile)) continue;

    let doc;
    try { doc = parseXfs(v.dati); } catch { continue; }
    const rec = trovaRecord(doc.root);
    if (!rec || !rec[0] || rec[0].mName === undefined || rec[0].Hash === undefined) continue;

    const tabella = path.basename(nomeFile);
    let n = 0;
    for (const r of rec) {
      const id = Number(r.Hash);
      if (!r.mName || !Number.isFinite(id) || id <= 0) continue;
      n++;
      // Il primo che vince: se un id comparisse in due tabelle lo si segnala.
      if (catalogo.has(id)) {
        const g = catalogo.get(id);
        if (g.tabella !== tabella) g.ancheIn = (g.ancheIn || []).concat(tabella);
        continue;
      }
      catalogo.set(id, { nome: String(r.mName), tabella, archivio: a });
    }
    if (n) perTabella.set(`${a} → ${tabella}`, n);
  }
}

console.log('=== tabelle "*_define" trovate in tutti gli archivi ===');
for (const [t, n] of [...perTabella.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${t}`);
}
console.log(`\nid totali nel catalogo: ${catalogo.size}`);

// --- confronto con gli id ignoti delle ricompense --------------------------
const materiali = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'json', 'materiali.json'), 'utf8'));
const equip = JSON.parse(fs.readFileSync(path.join(__dirname, 'equipaggiamenti.json'), 'utf8'));
const MAT = new Set(materiali.map((m) => m.id));
const EQ = new Set(equip.map((e) => e.id));

const dirQuest = path.join(__dirname, '..', 'src', 'json', 'questDB');
const comeArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v !== 'object') return [];
  const d = v.classref_ ?? v.array ?? v;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.mpArray)) return d.mpArray;
  return [];
};

const ignoti = new Map();
for (const f of fs.readdirSync(dirQuest).filter((x) => /extended.*\.json$/.test(x))) {
  const dati = JSON.parse(fs.readFileSync(path.join(dirQuest, f), 'utf8'));
  const quest = [];
  const cerca = (nodo, prof = 0) => {
    if (!nodo || typeof nodo !== 'object' || prof > 5) return;
    if (Array.isArray(nodo)) {
      if (nodo.length && nodo[0] && nodo[0].mRewardItemList !== undefined) quest.push(...nodo);
      else for (const v of nodo) cerca(v, prof + 1);
      return;
    }
    for (const v of Object.values(nodo)) cerca(v, prof + 1);
  };
  cerca(dati);

  for (const q of quest) {
    for (const r of comeArray(q.mRewardItemList)) {
      const id = Number(r?.mItemHash);
      if (!Number.isFinite(id) || MAT.has(id) || EQ.has(id)) continue;
      ignoti.set(id, (ignoti.get(id) || 0) + 1);
    }
  }
}

console.log(`\n${'='.repeat(72)}`);
console.log(`I ${ignoti.size} ID IGNOTI DELLE RICOMPENSE: ORA SI SA COSA SONO?`);
console.log('='.repeat(72));

const perFamiglia = new Map();
const restano = [];
for (const [id, volte] of ignoti) {
  const v = catalogo.get(id);
  if (v) {
    const k = v.tabella;
    if (!perFamiglia.has(k)) perFamiglia.set(k, { n: 0, campioni: [] });
    const f = perFamiglia.get(k);
    f.n++;
    if (f.campioni.length < 5) f.campioni.push(`${v.nome} (x${volte})`);
  } else {
    restano.push([id, volte]);
  }
}

for (const [tab, f] of [...perFamiglia.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(f.n).padStart(4)} id  in ${tab}`);
  console.log(`         ${f.campioni.join(' | ')}`);
}
console.log(`\n  ancora non identificati: ${restano.length}`);
if (restano.length) {
  console.log(`  ${restano.slice(0, 10).map(([i, n]) => `${i}(x${n})`).join(', ')}`);
}

if (SCRIVI) {
  const fuori = [...catalogo.entries()].map(([id, v]) => ({
    id, nome: v.nome, tabella: v.tabella, archivio: v.archivio,
  }));
  const dest = path.join(__dirname, 'catalogo-oggetti.json');
  fs.writeFileSync(dest, JSON.stringify(fuori, null, 1));
  console.log(`\nscritto: ${dest} (${fuori.length} id)`);
}

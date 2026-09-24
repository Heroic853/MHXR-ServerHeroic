/*
 * Costruisce l'elenco completo di armi, armature e talismani a partire dagli
 * archivi del gioco, e VERIFICA che gli id trovati siano davvero quelli che il
 * client accetta.
 *
 * La verifica non e' un dettaglio: e' l'unica cosa che distingue una tabella
 * utile da 15.000 numeri inventati. Nel server esistono 18 mst_equipment_id
 * di cui siamo certi (17 nel set iniziale di src/json/user-defaults.json piu'
 * WD_AXE103 dall'esempio di nyanken). Se il campo Hash delle tabelle coincide
 * con quei 18, allora coincide anche con gli altri 15.000.
 *
 *   node costruisci-equip.cjs
 *       verifica e stampa il riepilogo, senza scrivere
 *
 *   node costruisci-equip.cjs --json
 *       scrive equipaggiamenti.json
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
const QUI = __dirname;

// I 18 id certi: se la tabella li riproduce tutti, e' quella giusta.
const CERTI = {
  WD_SWORD001: 2006810019,
  WD_LBOWGUN001: 3125656021,
  WD_AXE103: 3880313379,
  AD_HEAD006: 69277598,
  AD_BODY006: 1801022340,
  AD_ARM006: 3325982510,
  AD_WST006: 62957325,
  AD_LEG006: 3353202438,
  OD_OMA1387: 3529887655,
  OD_OMA1388: 1121636918,
  OD_OMA1389: 903733920,
  OD_OMA1390: 1427794757,
  OD_OMA1391: 572349395,
  OD_OMA1392: 3138652777,
  OD_OMA1393: 3423812351,
  OD_OMA1394: 1383575388,
  OD_OMA1395: 628137930,
  OD_OMA1396: 3162099312,
};

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
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

function senzaNulli(buf) {
  const i = buf.indexOf(0);
  return buf.toString('utf-8', 0, i === -1 ? buf.length : i);
}

function leggiArc(percorso) {
  const buf = fs.readFileSync(percorso);
  const magic = buf.toString('ascii', 0, 4);
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
    } catch { /* non tutto e' zlib: texture, modelli */ }
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

/*
 * Ogni archivio contiene DUE famiglie di tabelle, e servono entrambe:
 *
 *   "*_define"  anagrafica: {mNo, mName, Hash} — il codice ("WD_SWORD001") e
 *               l'id numerico che il client accetta come mst_equipment_id.
 *
 *   "*_series"  statistiche: {mID, mRarity, mName / mNameMale, mElement, ...} —
 *               il nome in giapponese e la rarita'. Si collegano per mID, che e'
 *               lo stesso numero dell'Hash dell'anagrafica.
 *
 * Serve la rarita' per poter dire "dammi le leggendarie" senza tirare a
 * indovinare dal numero progressivo del codice.
 */
function raccogliDefine(archivio, categoriaDa) {
  const fuori = [];
  for (const v of leggiArc(path.join(QUI, archivio))) {
    const nome = v.nome.replace(/\\/g, '/');
    if (!/_define$/.test(nome)) continue;
    let doc;
    try { doc = parseXfs(v.dati); } catch { continue; }
    const rec = trovaRecord(doc.root);
    if (!rec || !rec[0] || rec[0].mName === undefined) continue;

    const base = path.basename(nome);
    const categoria = categoriaDa(base);
    for (const r of rec) {
      if (!r.mName || !Number.isFinite(Number(r.Hash))) continue;
      fuori.push({ nome: String(r.mName), id: Number(r.Hash), categoria, tabella: base });
    }
  }
  return fuori;
}

/** id -> {rarita, nomeJp, elemento}, dalle tabelle delle statistiche. */
function raccogliSeries(archivio) {
  const mappa = new Map();
  for (const v of leggiArc(path.join(QUI, archivio))) {
    const nome = v.nome.replace(/\\/g, '/');
    if (!/_series$/.test(nome)) continue;
    let doc;
    try { doc = parseXfs(v.dati); } catch { continue; }
    const rec = trovaRecord(doc.root);
    if (!rec || !rec[0] || rec[0].mID === undefined) continue;

    for (const r of rec) {
      const id = Number(r.mID);
      if (!Number.isFinite(id) || id <= 0 || mappa.has(id)) continue;
      mappa.set(id, {
        rarita: Number(r.mRarity) || 0,
        // le armi hanno mName, le armature mNameMale/mNameFemale
        nomeJp: String(r.mName ?? r.mNameMale ?? r.mNameFemale ?? '').trim(),
        elemento: Number(r.mElement) || 0,
        valore: Number(r.mSellValue) || 0,
      });
    }
  }
  return mappa;
}

const armi = raccogliDefine('rsdnt_weapon.arc', (b) => {
  const m = b.match(/^weapon_series_(.+)_define$/);
  if (m) return m[1];
  // kariwaza = 狩技, le arti di caccia: mosse speciali, non equipaggiamento.
  // Stanno nello stesso archivio delle armi e hanno la stessa forma
  // {mName, Hash}, ma non vanno messe in box.equipments.
  if (b === 'kariwaza_define') return 'kariwaza';
  return b.replace(/_define$/, '');
});

const armature = raccogliDefine('rsdnt_equip.arc', (b) => {
  const m = b.match(/^equip_series_(.+)_define$/);
  if (m) return m[1];
  if (/omamori/.test(b)) return 'omamori';
  return b.replace(/_define$/, '');
});

// Le statistiche, da unire per id.
const stat = new Map([
  ...raccogliSeries('rsdnt_weapon.arc'),
  ...raccogliSeries('rsdnt_equip.arc'),
]);

const tutti = [...armi, ...armature].map((e) => {
  const s = stat.get(e.id);
  return s ? { ...e, rarita: s.rarita, nomeJp: s.nomeJp, elemento: s.elemento, valore: s.valore } : e;
});

// --- la verifica ------------------------------------------------------------
const perNome = new Map();
for (const e of tutti) if (!perNome.has(e.nome)) perNome.set(e.nome, e.id);

console.log(`armi trovate      : ${armi.length}`);
console.log(`armature/talismani: ${armature.length}`);
console.log(`nomi distinti     : ${perNome.size}\n`);

console.log('=== VERIFICA sui 18 id certi ===');
let ok = 0, sbagliati = 0, mancanti = 0;
for (const [nome, atteso] of Object.entries(CERTI)) {
  const trovato = perNome.get(nome);
  if (trovato === undefined) {
    console.log(`  ${nome.padEnd(15)} MANCA dalla tabella`);
    mancanti++;
  } else if (trovato !== atteso) {
    console.log(`  ${nome.padEnd(15)} DIVERSO: atteso ${atteso}, trovato ${trovato}`);
    sbagliati++;
  } else {
    ok++;
  }
}
console.log(`\n  coincidono: ${ok}/18   diversi: ${sbagliati}   mancanti: ${mancanti}`);

if (ok === 18) {
  console.log('\n  -> Hash E\' mst_equipment_id. La tabella e\' utilizzabile.');
} else {
  console.log('\n  -> ATTENZIONE: la corrispondenza non e\' confermata.');
  console.log('     Non usare questi id per scrivere nell\'inventario.');
}

// --- riepilogo per categoria ----------------------------------------------
const perCat = new Map();
for (const e of tutti) perCat.set(e.categoria, (perCat.get(e.categoria) || 0) + 1);
console.log('\n=== per categoria ===');
for (const [c, n] of [...perCat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${c}`);
}

// Dettaglio per tabella di origine: serve a scoprire se una tabella e' stata
// letta due volte o se ne e' entrata una che non doveva.
const perTab = new Map();
for (const e of tutti) {
  const k = `${e.tabella} [${e.categoria}]`;
  perTab.set(k, (perTab.get(k) || 0) + 1);
}
console.log('\n=== per tabella di origine ===');
for (const [t, n] of [...perTab.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${t}`);
}

// La rarita' serve a poter chiedere "le leggendarie" con un criterio vero.
const conRarita = tutti.filter((e) => e.rarita !== undefined);
console.log(`\n=== rarita' (unite dalle tabelle *_series) ===`);
console.log(`  voci con rarita' nota: ${conRarita.length} su ${tutti.length}`);
const perRar = new Map();
for (const e of conRarita) perRar.set(e.rarita, (perRar.get(e.rarita) || 0) + 1);
for (const [r, n] of [...perRar.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  rarita' ${String(r).padStart(2)}: ${n}`);
}
const max = Math.max(...perRar.keys());
console.log(`\n  esempi alla rarita' massima (${max}):`);
conRarita.filter((e) => e.rarita === max).slice(0, 6).forEach((e) =>
  console.log(`      ${e.nome.padEnd(18)} ${String(e.id).padEnd(11)} ${e.categoria.padEnd(9)} ${e.nomeJp}`));

if (SCRIVI) {
  if (ok !== 18) {
    console.error('\nNon scrivo il file: la verifica non e\' passata.');
    process.exit(1);
  }
  const out = path.join(QUI, 'equipaggiamenti.json');
  fs.writeFileSync(out, JSON.stringify(tutti, null, 1));
  console.log(`\nscritto: ${out}  (${tutti.length} voci)`);
} else {
  console.log('\nNessun file scritto. Rilancia con --json per salvare.');
}

/*
 * Costruisce src/json/catalogo-ricompense.json: per ogni id, in quale array
 * della box del giocatore va scritto.
 *
 * Il problema che risolve: mRewardItemList mescola famiglie diverse senza un
 * campo che le distingua. Analizzando i dati veri delle 2635 quest si e' visto
 * che le ricompense appartengono a QUATTRO famiglie:
 *
 *   4878 id  item_define             -> box.materials      mst_material_id
 *  19956 id  equip/weapon/omamori    -> box.equipments      mst_equipment_id
 *    717 id  plusup_material_define  -> box.growth_items    mst_growth_item_id
 *    413 id  limit_define            -> box.limiteds        mst_limited_id
 *
 * Prima il server trattava TUTTO come materiale e scartava il resto: per questo
 * armi e armature promesse da 506 quest non arrivavano mai in inventario, e i
 * 218 id di potenziamento/limitati venivano buttati.
 *
 * Incluse anche le famiglie che non compaiono nelle ricompense ma servono
 * altrove (valute, punti evento): sapere che un id e' una GEMMA e non un
 * materiale evita di riscrivere l'errore che aveva bloccato il login.
 *
 *   node costruisci-catalogo.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_VOCE = 80;
const DIM_HEADER = 8;

const DIR_ARC = path.join(
  'D:', '000 MHXR SERVER HACK', 'Monster Hunter XR', 'Resources Files Games',
  'MHXR_base', 'assets', 'nativeAndroid', 'arc_cmn', 'resident',
);

/*
 * tabella del gioco -> famiglia e campo da usare nella box.
 * I nomi dei campi vengono dagli schemi in src/model/items/, non inventati.
 */
const FAMIGLIE = [
  [/^item_define$/,                    'materiale',       'mst_material_id',     'materials'],
  [/^equip_series_.*_define$/,         'equipaggiamento', 'mst_equipment_id',    'equipments'],
  [/^weapon_series_.*_define$/,        'equipaggiamento', 'mst_equipment_id',    'equipments'],
  [/^omamori_define$/,                 'equipaggiamento', 'mst_equipment_id',    'equipments'],
  [/^plusup_material_define$/,         'crescita',        'mst_growth_item_id',  'growth_items'],
  [/^limit_define$/,                   'limitato',        'mst_limited_id',      'limiteds'],
  [/^payment_define$/,                 'valuta',          'mst_payment_id',      'payments'],
  [/^event_point_define$/,             'punto',           'mst_event_point_id',  'points'],
  [/^augite_define$/,                  'augite',          'mst_augite_id',       'augite'],
  [/^power_define$/,                   'potere',          'mst_power_id',        'powers'],
  [/^matatabi_define$/,                'matatabi',        'mst_matatabi_id',     'matatabis'],
];

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

const voci = [];
const visti = new Set();
const conteggi = new Map();

for (const a of fs.readdirSync(DIR_ARC).filter((f) => f.endsWith('.arc'))) {
  for (const v of leggiArc(path.join(DIR_ARC, a))) {
    const tabella = path.basename(v.nome.replace(/\\/g, '/'));
    const regola = FAMIGLIE.find(([re]) => re.test(tabella));
    if (!regola) continue;

    let doc;
    try { doc = parseXfs(v.dati); } catch { continue; }
    const rec = trovaRecord(doc.root);
    if (!rec || !rec[0] || rec[0].Hash === undefined) continue;

    const [, famiglia, campo, arrayBox] = regola;
    for (const r of rec) {
      const id = Number(r.Hash);
      if (!r.mName || !Number.isFinite(id) || id <= 0 || visti.has(id)) continue;
      visti.add(id);
      voci.push({ id, nome: String(r.mName), famiglia, campo, box: arrayBox });
      conteggi.set(famiglia, (conteggi.get(famiglia) || 0) + 1);
    }
  }
}

console.log('=== catalogo per famiglia ===');
for (const [f, n] of [...conteggi.entries()].sort((a, b) => b[1] - a[1])) {
  const r = voci.find((v) => v.famiglia === f);
  console.log(`  ${String(n).padStart(6)}  ${f.padEnd(16)} -> box.${r.box} (${r.campo})`);
}
console.log(`\n  totale: ${voci.length} id`);

// Le valute: sapere quale id sono le gemme era rimasto un punto incerto.
console.log('\n=== valute (payment_define) ===');
for (const v of voci.filter((x) => x.famiglia === 'valuta')) {
  console.log(`  ${String(v.id).padEnd(12)} ${v.nome}`);
}

const dest = path.join(__dirname, '..', 'src', 'json', 'catalogo-ricompense.json');
fs.writeFileSync(dest, JSON.stringify(voci.map((v) => ({ id: v.id, f: v.famiglia })), null, 0));
console.log(`\nscritto (compatto, per il server): ${dest}`);

const destPieno = path.join(__dirname, 'catalogo-oggetti.json');
fs.writeFileSync(destPieno, JSON.stringify(voci, null, 1));
console.log(`scritto (con i nomi, per i tool)  : ${destPieno}`);

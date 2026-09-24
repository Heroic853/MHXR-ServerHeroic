/*
 * Costruisce src/json/materiali.json dal foglio degli oggetti del gioco.
 *
 * Serve a una cosa precisa: sapere quali id sono DAVVERO materiali. Le liste
 * ricompensa delle quest (mRewardItemList.mItemHash) contengono anche punti,
 * ticket ed equipaggiamento; scrivere uno di quegli id in box.materials mette
 * nell'inventario un oggetto che il client non sa disegnare, e da quel momento
 * il login crasha a ogni tentativo perche' /api/box/get lo rimanda ogni volta.
 * E' successo davvero col gacha: l'id 1277724242 non era un materiale.
 *
 * Il file finisce in src/json/ perche' lo importa anche il server (il Dockerfile
 * copia src/json in dist/json). Gli script in tools-js lo leggono dal percorso
 * del container.
 *
 *   node costruisci-materiali.cjs <foglio.xlsx>
 */
const fs = require('fs');
const path = require('path');
const { leggiFoglio } = require('./leggi-xlsx.cjs');

const foglio = process.argv[2];
if (!foglio) {
  console.error('uso: node costruisci-materiali.cjs <new_item_material.xlsx>');
  process.exit(1);
}

const { righe } = leggiFoglio(foglio);
console.log(`righe nel foglio: ${righe.length}`);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const materiali = [];
const visti = new Set();
let scartate = 0;

for (const r of righe) {
  const id = num(r.mItemID);
  // Senza un id valido la riga non serve a niente, e un id duplicato indica una
  // riga di prova nel foglio: si tiene la prima.
  if (!Number.isInteger(id) || id <= 0) { scartate++; continue; }
  if (visti.has(id)) { scartate++; continue; }
  visti.add(id);

  materiali.push({
    id,
    no: num(r.mItemNo),
    nome: String(r.mItemName || '').trim(),
    rarita: num(r.mRarity),
    mostro: num(r.mMonsterID),
    punti: num(r.mTradePoint),
  });
}

console.log(`materiali validi: ${materiali.length}`);
console.log(`righe scartate  : ${scartate}`);

const perRarita = new Map();
for (const m of materiali) perRarita.set(m.rarita, (perRarita.get(m.rarita) || 0) + 1);
console.log('\nper rarita\':');
for (const [r, n] of [...perRarita.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  rarita' ${r}: ${n}`);
}

console.log('\ncollegati a un mostro: ' + materiali.filter((m) => m.mostro > 0).length);

const dest = path.join(__dirname, '..', 'src', 'json', 'materiali.json');
fs.writeFileSync(dest, JSON.stringify(materiali, null, 1));
console.log(`\nscritto: ${dest}`);

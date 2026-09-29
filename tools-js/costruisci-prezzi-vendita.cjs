/*
 * Costruisce src/json/prezzi-vendita.json: quanti zeny vale ogni pezzo venduto.
 * Tutto dalle tabelle del gioco (resident.00.fpk originale):
 *
 * - equipaggiamenti: mSellValue di weapon_*_series (rsdnt_weapon.arc) e
 *   equip_*_series (rsdnt_equip.arc), per mID (= mst_equipment_id);
 * - materiali: mTradePoint di item_material (rsdnt_property.arc), per mItemID
 *   (= mst_material_id). Nel gioco non c'e' un altro prezzo dei materiali, e
 *   mTradePoint si comporta come tale: le monete 【換金用】 (fatte per essere
 *   vendute) valgono 100 / 500 / 1000 / 5000 / 10000 / 20000 in ordine di
 *   pregio, i materiali normali 50.
 *
 * Uso:  node tools-js/costruisci-prezzi-vendita.cjs <lib.cjs di apk_check/blk>
 */
const fs = require('fs');
const path = require('path');
const { parseXfs } = require('./xfs-parse.cjs');

const LIB = process.argv[2];
if (!LIB) { console.error('uso: node costruisci-prezzi-vendita.cjs <percorso lib.cjs>'); process.exit(1); }
const { parseFpk, parseArc } = require(LIB);

const REPO = path.join(__dirname, '..');
const RESIDENT = path.join(REPO, 'src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk.jp-backup');

(async () => {
  const fpk = parseFpk(fs.readFileSync(RESIDENT));
  const arcDi = async (nome) => parseArc(fpk.find((y) => y.filePath.endsWith(nome)).data);
  const e = {};
  for (const arcName of ['rsdnt_weapon.arc', 'rsdnt_equip.arc']) {
    for (const a of await arcDi(arcName)) {
      if (!/(weapon|equip)_\w+_series$/.test(a.name) || !a.data) continue;
      for (const d of parseXfs(a.data).root.mDataList.mpArray) if (Number(d.mSellValue) > 0) e[d.mID] = Number(d.mSellValue);
    }
  }
  const m = {};
  const mat = (await arcDi('rsdnt_property.arc')).find((a) => a.name.split('\\').pop() === 'item_material');
  (function w(o) {
    if (Array.isArray(o)) o.forEach(w);
    else if (o && typeof o === 'object') {
      if ('mItemID' in o) { if (Number(o.mTradePoint) > 0) m[o.mItemID] = Number(o.mTradePoint); } else Object.values(o).forEach(w);
    }
  })(parseXfs(mat.data).root);
  const dest = path.join(REPO, 'src/json/prezzi-vendita.json');
  fs.writeFileSync(dest, JSON.stringify({ e, m }));
  console.log('scritto', dest, '| equipaggiamenti:', Object.keys(e).length, '| materiali:', Object.keys(m).length);
})().catch((err) => { console.error(err); process.exit(1); });

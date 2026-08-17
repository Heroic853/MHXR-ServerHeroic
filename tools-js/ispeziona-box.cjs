/*
 * Guarda dentro la box senza toccare niente.
 *
 * Il gacha ha scritto materiali pescandoli dagli mItemHash delle ricompense
 * delle quest — ma quelle liste non contengono solo materiali. Un
 * mst_material_id inesistente salvato in box.materials viene rimandato al
 * client a ogni /api/box/get, cioe' a ogni login: e' il candidato numero uno
 * per il crash all'ingresso.
 *
 * Le voci aggiunte dal gacha stanno IN FONDO all'array (push), quindi le ultime
 * sono le sospette. Questo script le mostra, poi si rimuovono per id preciso
 * con --togli=id1,id2,id3 — mai a occhio.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/ispeziona-box.cjs
 *   ... --togli=123456789,987654321
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const TOGLI = (process.argv.find((a) => a.startsWith('--togli=')) || '')
  .replace('--togli=', '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');
  const qs = mongoose.connection.db.collection('questsheets');

  // Gli id che compaiono nelle ricompense delle quest: se un materiale della
  // box sta qui, e' uno di quelli che ho pescato io.
  const daRicompense = new Set();
  const quests = await qs.find({ mRewardItemList: { $exists: true } })
    .project({ mRewardItemList: 1 }).toArray();
  for (const q of quests) {
    for (const r of q.mRewardItemList || []) {
      const id = Number(r && r.mItemHash);
      if (Number.isFinite(id) && id > 0) daRicompense.add(id);
    }
  }
  console.log(`id presenti nelle ricompense delle quest: ${daRicompense.size}\n`);

  const tutti = await users.find({}).project({
    character_name: 1, 'box.materials': 1, 'box.equipments': 1,
  }).toArray();

  for (const u of tutti) {
    const mat = (u.box && u.box.materials) || [];
    const eq = (u.box && u.box.equipments) || [];
    console.log(`=== ${u.character_name || '(senza nome)'} ===`);
    console.log(`  materiali: ${mat.length}   equipaggiamenti: ${eq.length}`);

    console.log('\n  ULTIME 12 VOCI DI box.materials (le aggiunte stanno in fondo):');
    mat.slice(-12).forEach((m, i) => {
      const id = Number(m && m.mst_material_id);
      const nelleRicompense = daRicompense.has(id) ? 'SI' : 'no';
      const pos = mat.length - Math.min(12, mat.length) + i;
      console.log(`      [${String(pos).padStart(3)}] id=${String(id).padEnd(12)} qta=${String(m.amount).padEnd(5)} nelle-ricompense=${nelleRicompense}`);
    });

    console.log('\n  EQUIPAGGIAMENTI con numero di campi (i validi ne hanno 16):');
    eq.slice(-6).forEach((e) => {
      const campi = Object.keys(e).filter((k) => k !== '_id').length;
      console.log(`      ${String(e.equipment_id).padEnd(20)} campi=${campi}`);
    });

    if (TOGLI.length) {
      const puliti = mat.filter((m) => !TOGLI.includes(Number(m && m.mst_material_id)));
      const rimossi = mat.length - puliti.length;
      if (rimossi) {
        await users.updateOne({ _id: u._id }, { $set: { 'box.materials': puliti } });
        console.log(`\n  RIMOSSI ${rimossi} materiali, restano ${puliti.length}`);
      } else {
        console.log('\n  nessuno degli id indicati era presente');
      }
    }
    console.log('');
  }

  if (!TOGLI.length) console.log('nessun --togli indicato: niente modificato');

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

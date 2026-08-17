/*
 * Ponte definitivo: quest -> ricompense -> mMonsterID -> mostro.
 *
 * Le ricompense di una quest (mRewardItemList) sono i materiali di QUEL mostro,
 * e il foglio new_item_material dice per ogni materiale il suo mMonsterID.
 * Quindi dalle ricompense si risale al mostro anche quando il titolo non lo
 * nomina e l'id non e' nella tabella dei 78.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/rewards-bridge.cjs
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const uno = await qs.findOne({ mDefineId: /^EVENT/, 'mRewardItemList.0': { $exists: true } });
  console.log('=== una quest evento con ricompense ===');
  if (uno) {
    console.log(`  ${uno.mDefineId}  "${String(uno.mQuestName).replace(/\n/g, ' ').slice(0, 30)}"`);
    console.log(`  ricompense: ${JSON.stringify((uno.mRewardItemList || []).slice(0, 4))}`);
  } else {
    console.log('  NESSUNA quest evento ha mRewardItemList popolato nel database');
  }

  const conPremi = await qs.countDocuments({ mDefineId: /^EVENT/, 'mRewardItemList.0': { $exists: true } });
  const tot = await qs.countDocuments({ mDefineId: /^EVENT/ });
  console.log(`\n  quest evento con ricompense: ${conPremi}/${tot}`);

  // e nel file grezzo?
  const d = JSON.parse(fs.readFileSync('/app/dist/json/questDB/event.extended.json', 'utf8'));
  const lista = d?.rQuestSheet?.mQuestDataList || [];
  let conPremiFile = 0;
  let esempio = null;
  for (const q of lista) {
    const arr = q.mRewardItemList?.array?.mpArray ?? q.mRewardItemList?.classref_?.mpArray;
    if (Array.isArray(arr) && arr.length) {
      conPremiFile++;
      if (!esempio) esempio = { def: q.mDefineId, nome: q.mQuestName, premi: arr.slice(0, 5) };
    }
  }
  console.log(`  quest con ricompense nel FILE grezzo: ${conPremiFile}/${lista.length}`);
  if (esempio) {
    console.log(`\n  esempio dal file: ${esempio.def} "${String(esempio.nome).replace(/\n/g, ' ').slice(0, 26)}"`);
    console.log(`    ${JSON.stringify(esempio.premi)}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

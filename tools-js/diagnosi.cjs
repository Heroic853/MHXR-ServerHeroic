/*
 * Diagnosi dei casi segnalati: Morudomunto, Eo Garudia vs Nef-Garmat,
 * Plesioth, Savage Deviljho, e le assegnazioni con vita bassissima.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/diagnosi.cjs
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  for (const [etichetta, jp] of [
    ['MORUDOMUNTO', 'モルドムント'],
    ['EO GARUDIA', 'ガルディア'],
    ['NEF GARMAT', 'ガルムド'],
    ['PLESIOTH', 'ガノトトス'],
    ['DEVILJHO', 'イビルジョー'],
  ]) {
    const q = await qs.find({ mDefineId: /^EVENT/, mQuestName: new RegExp(jp) })
      .project({ mQuestName: 1, mMostro: 1, mMostroVoluto: 1 }).limit(6).toArray();
    console.log(`\n=== ${etichetta} ("${jp}"): ${q.length} quest ===`);
    for (const x of q) {
      const n = String(x.mQuestName).replace(/\n/g, ' ').slice(0, 34);
      console.log(`  "${n.padEnd(34)}"`);
      console.log(`      voluto ${String(x.mMostroVoluto || '(nessuno)').padEnd(24)} assegnato ${x.mMostro || '(NESSUNO)'}`);
    }
  }

  // assegnazioni con note che indicano vita ridotta
  console.log('\n=== quest assegnate a blocchi "facili"/one-shot ===');
  const facili = await qs.find({
    mDefineId: /^EVENT/,
    mMostro: /easy|one shot|tick: ?1[0-9]{0,3}\b|idle/,
  }).project({ mQuestName: 1, mMostro: 1 }).limit(12).toArray();
  console.log(`  totale: ${await qs.countDocuments({ mDefineId: /^EVENT/, mMostro: /easy|one shot|idle/ })}`);
  facili.slice(0, 8).forEach((x) => {
    console.log(`  "${String(x.mQuestName).replace(/\n/g, ' ').slice(0, 26).padEnd(26)}" -> ${x.mMostro}`);
  });

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

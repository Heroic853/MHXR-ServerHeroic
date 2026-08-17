/*
 * Da dove prende il gioco il mostro di una quest? Dalla quest stessa (mBossList)
 * o dai blocchi mappa? Se viene dai blocchi, i miei blocchi ricostruiti fanno
 * comparire il mostro sbagliato.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-bosses.cjs
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

function haBoss(q) {
  const l = q.mBossList;
  if (!Array.isArray(l) || l.length === 0) return false;
  return l.some((b) => b && b.mEnemyID);
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const tutte = await qs.find({}).project({ mQuestID: 1, mDefineId: 1, mQuestName: 1, mBossList: 1, mBlocksSource: 1 }).toArray();

  const gruppi = {};
  for (const q of tutte) {
    const tipo = String(q.mDefineId || '?').slice(0, 5);
    const g = (gruppi[tipo] ??= { tot: 0, conBoss: 0, senzaBoss: 0 });
    g.tot++;
    if (haBoss(q)) g.conBoss++; else g.senzaBoss++;
  }

  console.log('=== il boss e\' scritto nella quest? ===');
  console.log('  tipo     totali   con mBossList   senza');
  for (const [t, g] of Object.entries(gruppi).sort((a, b) => b[1].tot - a[1].tot)) {
    console.log(`  ${t.padEnd(8)} ${String(g.tot).padStart(6)} ${String(g.conBoss).padStart(15)} ${String(g.senzaBoss).padStart(7)}`);
  }

  console.log('\n=== esempi di quest EVENT ===');
  const ev = tutte.filter((q) => String(q.mDefineId || '').startsWith('EVENT')).slice(0, 6);
  for (const q of ev) {
    const nome = String(q.mQuestName || '').replace(/\n/g, ' ');
    console.log(`  ${q.mDefineId}  [${q.mBlocksSource || 'originale'}]  "${nome}"`);
    console.log(`      mBossList: ${JSON.stringify(q.mBossList)}`);
  }

  console.log('\n=== esempi di quest QUEST (che funzionano) ===');
  const st = tutte.filter((q) => String(q.mDefineId || '').startsWith('QUEST') && haBoss(q)).slice(0, 4);
  for (const q of st) {
    console.log(`  ${q.mDefineId}  mBossList: ${JSON.stringify(q.mBossList)}`);
  }

  // incrocio: fra le quest evento, quelle con blocchi autentici hanno boss?
  console.log('\n=== quest evento per origine dei blocchi ===');
  for (const fonte of ['autentico', 'ricostruito']) {
    const sel = tutte.filter((q) => q.mBlocksSource === fonte);
    const conBoss = sel.filter(haBoss).length;
    console.log(`  ${fonte.padEnd(12)} ${sel.length} quest, di cui ${conBoss} con mBossList valorizzato`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

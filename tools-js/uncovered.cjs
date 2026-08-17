/*
 * Che aspetto hanno le quest evento ancora senza mostro assegnato?
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/uncovered.cjs
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

  const scoperte = await qs.find({ mDefineId: /^EVENT/, mMostro: { $exists: false } })
    .project({ mDefineId: 1, mQuestName: 1, mBossList: 1 }).toArray();

  console.log(`quest evento senza mostro: ${scoperte.length}\n`);

  // quali mEnemyID compaiono, e quante quest ciascuno
  const perId = new Map();
  for (const q of scoperte) {
    for (const b of q.mBossList || []) {
      const id = String(b?.mEnemyID ?? '');
      if (!id) continue;
      if (!perId.has(id)) perId.set(id, []);
      perId.get(id).push(String(q.mQuestName || '').replace(/\n/g, ' '));
    }
  }
  const ord = [...perId.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`=== mEnemyID mancanti dalla tabella: ${ord.length} ===`);
  for (const [id, nomi] of ord.slice(0, 30)) {
    const esempio = nomi[0].slice(0, 40);
    console.log(`  enemy ${String(id).padStart(4)}  ${String(nomi.length).padStart(3)} quest   es: "${esempio}"`);
  }

  console.log(`\n=== parole katakana ricorrenti nei nomi scoperti ===`);
  const kata = {};
  for (const q of scoperte) {
    for (const m of String(q.mQuestName || '').matchAll(/[゠-ヿー・]{3,}/g)) {
      kata[m[0]] = (kata[m[0]] || 0) + 1;
    }
  }
  Object.entries(kata).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

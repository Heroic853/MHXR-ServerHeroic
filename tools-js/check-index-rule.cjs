/*
 * IPOTESI FINALE: mBossList.mAreaNo e' l'indice del blocco nella sequenza che il
 * server invia (block_idx parte da 1). Se il server manda MENO blocchi di quel
 * numero, il client non ha dove piazzare il boss.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-index-rule.cjs
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  function indiciBoss(q) {
    return (q.mBossList || [])
      .filter((b) => b && b.mAreaNo !== undefined && b.mAreaNo !== null)
      .map((b) => parseInt(b.mAreaNo, 10))
      .filter((n) => !isNaN(n));
  }

  for (const [etichetta, filtro] of [
    ['STORIA (funzionano)', { mDefineId: /^QUEST/, 'mBlocks.0': { $exists: true }, mBlocksSource: { $exists: false } }],
    ['EVENTO "autentici"', { mDefineId: /^EVENT/, mBlocksSource: 'autentico' }],
    ['EVENTO ricostruiti', { mDefineId: /^EVENT/, mBlocksSource: 'ricostruito' }],
  ]) {
    const docs = await qs.find(filtro).project({ mDefineId: 1, mBossList: 1, mBlocks: 1 }).toArray();
    let ok = 0, corti = 0;
    const esempi = [];
    for (const q of docs) {
      const idx = indiciBoss(q);
      const n = (q.mBlocks || []).length;
      const massimo = Math.max(...idx, 0);
      if (massimo <= n) ok++;
      else {
        corti++;
        if (esempi.length < 3) esempi.push(`      ${q.mDefineId}: boss al blocco ${massimo} ma ne arrivano solo ${n}`);
      }
    }
    const perc = docs.length ? Math.round(ok / docs.length * 100) : 0;
    console.log(`\n${etichetta}`);
    console.log(`  quest esaminate                 : ${docs.length}`);
    console.log(`  blocchi sufficienti per il boss : ${ok}  (${perc}%)`);
    console.log(`  troppo pochi blocchi            : ${corti}`);
    if (esempi.length) { console.log('  esempi:'); esempi.forEach((e) => console.log(e)); }
  }

  // quanti blocchi mandano tipicamente le quest che funzionano?
  const storia = await qs.find({ mDefineId: /^QUEST/, 'mBlocks.0': { $exists: true }, mBlocksSource: { $exists: false } }).project({ mBossList: 1, mBlocks: 1 }).toArray();
  const dist = {};
  for (const q of storia) { const n = q.mBlocks.length; dist[n] = (dist[n] || 0) + 1; }
  console.log(`\n=== quanti blocchi hanno le quest della storia ===`);
  console.log('  ' + Object.entries(dist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} blocchi: ${v}`).join('   '));

  const distIdx = {};
  for (const q of storia) for (const i of indiciBoss(q)) distIdx[i] = (distIdx[i] || 0) + 1;
  console.log(`\n=== valori di mAreaNo nelle quest della storia ===`);
  console.log('  ' + Object.entries(distIdx).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join('   '));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

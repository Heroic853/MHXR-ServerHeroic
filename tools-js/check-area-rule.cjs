/*
 * IPOTESI: i blocchi inviati a una quest devono comprendere l'AREA in cui il
 * client si aspetta il boss (mBossList.mAreaNo). Se manca, il mostro non puo'
 * essere piazzato e ne compare un altro.
 *
 * Verifica sulle quest della storia, che funzionano correttamente.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-area-rule.cjs
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

  // nome del blocco a partire dall'hash
  const csv = fs.readFileSync('/app/dist/csv/blocks.csv', 'utf8').split('\n').slice(1);
  const nomePerHash = new Map();
  for (const r of csv) {
    const [nome, hash] = r.trim().split(',');
    if (nome && hash) nomePerHash.set(Number(hash), nome);
  }

  function areeDeiBlocchi(blocks) {
    const aree = new Set();
    for (const h of blocks || []) {
      const nome = nomePerHash.get(Number(h));
      if (!nome) continue;
      const m = nome.match(/_a(\d+)_/);
      if (m) aree.add(parseInt(m[1], 10));
    }
    return aree;
  }

  function areeBoss(q) {
    return (q.mBossList || [])
      .filter((b) => b && b.mAreaNo !== undefined && b.mAreaNo !== null)
      .map((b) => parseInt(b.mAreaNo, 10))
      .filter((n) => !isNaN(n));
  }

  for (const [etichetta, filtro] of [
    ['STORIA (funzionano)', { mDefineId: /^QUEST/, 'mBlocks.0': { $exists: true }, mBlocksSource: { $exists: false } }],
    ['EVENTO blocchi "autentici"', { mDefineId: /^EVENT/, mBlocksSource: 'autentico' }],
    ['EVENTO blocchi ricostruiti', { mDefineId: /^EVENT/, mBlocksSource: 'ricostruito' }],
  ]) {
    const docs = await qs.find(filtro).project({ mQuestID: 1, mDefineId: 1, mBossList: 1, mBlocks: 1 }).toArray();
    let rispettano = 0, no = 0, senzaArea = 0;
    const esempi = [];
    for (const q of docs) {
      const ab = areeBoss(q);
      if (!ab.length) { senzaArea++; continue; }
      const disponibili = areeDeiBlocchi(q.mBlocks);
      const ok = ab.every((a) => disponibili.has(a));
      if (ok) rispettano++;
      else {
        no++;
        if (esempi.length < 3) {
          esempi.push(`      ${q.mDefineId}: boss in area [${ab.join(',')}], blocchi coprono [${[...disponibili].sort((x, y) => x - y).join(',')}]`);
        }
      }
    }
    const tot = rispettano + no;
    const perc = tot ? Math.round(rispettano / tot * 100) : 0;
    console.log(`\n${etichetta}`);
    console.log(`  quest esaminate                      : ${docs.length}`);
    console.log(`  l'area del boss e' fra i blocchi     : ${rispettano}  (${perc}%)`);
    console.log(`  NON c'e'                             : ${no}`);
    console.log(`  senza area indicata                  : ${senzaArea}`);
    if (esempi.length) { console.log('  esempi di violazione:'); esempi.forEach((e) => console.log(e)); }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

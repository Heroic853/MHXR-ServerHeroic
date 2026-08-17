/*
 * Impara la corrispondenza blocco -> nemico dalle quest che FUNZIONANO.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/learn-blocks.cjs
 *
 * IDEA: le quest della storia (mDefineId QUEST...) hanno sia i blocchi originali
 * del dump sia il mBossList corretto. Sono quindi 2015 esempi in cui sappiamo
 * "questi blocchi -> questo nemico". Incrociandoli si costruisce una tabella
 * blocco -> nemico senza dover deserializzare l'XFS.
 *
 * Poi, per ogni quest evento (di cui conosciamo il mEnemyID ma non i blocchi
 * giusti), si possono assegnare blocchi che contengono davvero quel mostro.
 *
 * Questo script NON scrive niente: misura solo se la strada e' percorribile.
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

function nemici(q) {
  return (q.mBossList || []).filter((b) => b && b.mEnemyID).map((b) => String(b.mEnemyID));
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const tutte = await qs.find({}).project({ mQuestID: 1, mDefineId: 1, mQuestName: 1, mBossList: 1, mBlocks: 1, mBlocksSource: 1 }).toArray();

  const storia = tutte.filter((q) => String(q.mDefineId || '').startsWith('QUEST') && !q.mBlocksSource);
  const eventi = tutte.filter((q) => String(q.mDefineId || '').startsWith('EVENT'));

  console.log(`quest storia (blocchi originali) : ${storia.length}`);
  console.log(`quest evento                     : ${eventi.length}\n`);

  // blocco -> insieme di nemici osservati
  const bloccoNemici = new Map();
  // nemico -> insieme di blocchi osservati
  const nemicoBlocchi = new Map();

  for (const q of storia) {
    const ns = nemici(q);
    if (!ns.length) continue;
    for (const b of q.mBlocks || []) {
      if (!bloccoNemici.has(b)) bloccoNemici.set(b, new Set());
      for (const n of ns) {
        bloccoNemici.get(b).add(n);
        if (!nemicoBlocchi.has(n)) nemicoBlocchi.set(n, new Set());
        nemicoBlocchi.get(n).add(b);
      }
    }
  }

  console.log(`=== tabella imparata dalle quest storia ===`);
  console.log(`  blocchi con almeno un nemico noto : ${bloccoNemici.size}`);
  console.log(`  nemici distinti coperti           : ${nemicoBlocchi.size}`);

  // quanto e' pulita? un blocco dovrebbe avere UN nemico, non tanti
  let univoci = 0, ambigui = 0;
  for (const s of bloccoNemici.values()) { if (s.size === 1) univoci++; else ambigui++; }
  console.log(`  blocchi con un solo nemico        : ${univoci}`);
  console.log(`  blocchi ambigui (piu' nemici)     : ${ambigui}`);

  // LA DOMANDA CHIAVE: i nemici degli eventi compaiono anche nella storia?
  const nemiciEvento = new Map();
  for (const q of eventi) for (const n of nemici(q)) nemiciEvento.set(n, (nemiciEvento.get(n) || 0) + 1);

  const coperti = [...nemiciEvento.keys()].filter((n) => nemicoBlocchi.has(n));
  const scoperti = [...nemiciEvento.keys()].filter((n) => !nemicoBlocchi.has(n));

  console.log(`\n=== copertura ===`);
  console.log(`  nemici distinti usati dagli eventi : ${nemiciEvento.size}`);
  console.log(`  di cui presenti anche nella storia : ${coperti.length}`);
  console.log(`  esclusivi degli eventi             : ${scoperti.length}`);

  // quante quest evento sarebbero sistemabili
  let sistemabili = 0, no = 0;
  for (const q of eventi) {
    const ns = nemici(q);
    if (ns.length && ns.every((n) => nemicoBlocchi.has(n))) sistemabili++; else no++;
  }
  console.log(`\n  quest evento sistemabili con questa tabella : ${sistemabili}/${eventi.length}`);
  console.log(`  non sistemabili (mostro mai visto altrove)  : ${no}`);

  console.log(`\n=== i mostri ESCLUSIVI degli eventi (i piu' usati) ===`);
  const ord = scoperti.map((n) => ({ n, q: nemiciEvento.get(n) })).sort((a, b) => b.q - a.q);
  ord.slice(0, 15).forEach((x) => console.log(`  enemy ${String(x.n).padStart(4)}  usato in ${x.q} quest evento`));

  console.log(`\n=== esempi di quest evento sistemabili ===`);
  let m = 0;
  for (const q of eventi) {
    const ns = nemici(q);
    if (!ns.length || !ns.every((n) => nemicoBlocchi.has(n))) continue;
    const nome = String(q.mQuestName || '').replace(/\n/g, ' ');
    const disponibili = ns.map((n) => `enemy ${n}: ${nemicoBlocchi.get(n).size} blocchi`).join(', ');
    console.log(`  "${nome}"  ->  ${disponibili}`);
    if (++m >= 6) break;
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

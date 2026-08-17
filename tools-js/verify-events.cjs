/*
 * Controlla che ogni evento nel database trovi il suo nodo in event_nodes.json
 * e quindi la sua lista di quest. Un evento che non lo trova arriva al gioco
 * VUOTO: si vede la voce ma non c'e' niente da giocare.
 *
 *   docker compose -f docker-compose.test.yml exec -T server-new node /app/tools/verify-events.cjs
 *
 * Replico qui la logica di enrichEvent invece di importarla: nel progetto nuovo
 * e' ESM e non e' richiamabile da uno script CommonJS. E' poche righe, e cosi'
 * lo script gira identico su entrambe le versioni del server.
 */
const mongoose = require('mongoose');
const nodes = require('/app/dist/json/event_nodes.json');

const COLLECTIONS = {
  tour: 'tourevents',
  standing: 'standingevents',
  m16: 'm16events',
  assault: 'assualtevents',
  score: 'scoreevents',
  ticket: 'ticketevents',
};

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

// stessa corrispondenza di model/events/utils.ts: mEventNodeHash <-> mst_event_node_id
const perNodo = new Map();
for (const n of nodes) perNodo.set(parseInt(n.mEventNodeHash, 10), n);

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log(`database: ${DB_NAME}\n`);

  let totEventi = 0, totQuest = 0, totOrfani = 0;

  for (const [nome, coll] of Object.entries(COLLECTIONS)) {
    const docs = await db.collection(coll).find({}).toArray();
    let quest = 0, orfani = 0;

    for (const d of docs) {
      const id = d.mst_event_node_id ?? d.mst_score_node_id;
      const n = perNodo.get(Number(id));
      if (!n) { orfani++; continue; }
      quest += (n.mEventQuestList || []).length;
    }

    totEventi += docs.length; totQuest += quest; totOrfani += orfani;
    const esito = orfani === 0 ? 'ok' : `${orfani} SENZA NODO`;
    console.log(`  ${nome.padEnd(10)} eventi=${String(docs.length).padStart(4)}  quest collegate=${String(quest).padStart(4)}  ${esito}`);
  }

  console.log(`\n  TOTALE     eventi=${totEventi}  quest=${totQuest}  orfani=${totOrfani}`);

  // le quest degli eventi sono davvero giocabili? (mBlocks vuoto -> errore 10001)
  const qs = db.collection('questsheets');
  const vuoti = await qs.countDocuments({ $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] });
  const tot = await qs.countDocuments({});
  console.log(`\n  questsheets: ${tot} totali, ${vuoti} senza blocchi (darebbero errore 10001)`);
  const perFonte = await qs.aggregate([{ $group: { _id: '$mBlocksSource', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  for (const f of perFonte) console.log(`    ${String(f._id ?? 'originale del dump').padEnd(22)} ${f.n}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

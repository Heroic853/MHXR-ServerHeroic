/*
 * Quante quest hanno mBlocks vuoto (-> errore 10001) e quali dati abbiamo per riempirli.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/check-blocks.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const DIST = '/app/dist';

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  const qs = db.collection('questsheets');

  const tot = await qs.countDocuments({});
  const vuoti = await qs.countDocuments({ $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] });
  console.log(`questsheets totali            : ${tot}`);
  console.log(`con mBlocks VUOTO (err 10001) : ${vuoti}`);
  console.log(`giocabili                     : ${tot - vuoti}`);

  // spaccato per prefisso di mDefineId
  console.log('\n=== per tipo di mDefineId ===');
  const perTipo = await qs.aggregate([
    { $project: {
        tipo: { $substrCP: [{ $ifNull: ['$mDefineId', '?'] }, 0, 5] },
        vuoto: { $cond: [{ $gt: [{ $size: { $ifNull: ['$mBlocks', []] } }, 0] }, 0, 1] },
    } },
    { $group: { _id: '$tipo', tot: { $sum: 1 }, vuoti: { $sum: '$vuoto' } } },
    { $sort: { tot: -1 } },
  ]).toArray();
  for (const t of perTipo) {
    console.log(`  ${String(t._id).padEnd(8)} totali=${String(t.tot).padStart(5)}  senza blocchi=${String(t.vuoti).padStart(5)}`);
  }

  // le quest collegate agli eventi che ho popolato: sono giocabili?
  const nodes = require(path.join(DIST, 'json/event_nodes.json'));
  for (const [nome, prefisso] of [['tour', 'tour'], ['m16', 'gild'], ['standing', 'kako']]) {
    const ids = new Set();
    for (const n of nodes) {
      if (String(n.mBannerPath || '').split('_')[0] !== prefisso) continue;
      for (const q of n.mEventQuestList || []) ids.add(String(q));
    }
    const lista = [...ids];
    const trovate = await qs.countDocuments({ mQuestID: { $in: lista } });
    const conBlocchi = await qs.countDocuments({ mQuestID: { $in: lista }, 'mBlocks.0': { $exists: true } });
    console.log(`\n${nome.padEnd(9)} quest referenziate=${lista.length}  presenti in DB=${trovate}  CON blocchi=${conBlocchi}`);
  }

  // quali file di blocchi abbiamo
  console.log('\n=== dati blocchi disponibili ===');
  for (const f of ['json/questDB/event.blocks.json', 'json/questDB/forest.blocks.json', 'csv/blocks.csv']) {
    const p = path.join(DIST, f);
    if (!fs.existsSync(p)) { console.log(`  ${f}: assente`); continue; }
    const size = fs.statSync(p).size;
    console.log(`  ${f}: ${size} byte`);
    if (f.endsWith('.json')) {
      try {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        const keys = Array.isArray(d) ? `array[${d.length}]` : `oggetto con ${Object.keys(d).length} chiavi`;
        console.log(`      ${keys}`);
        const primo = Array.isArray(d) ? d[0] : d[Object.keys(d)[0]];
        console.log(`      esempio: ${JSON.stringify(primo).slice(0, 300)}`);
      } catch (e) { console.log(`      non parsabile: ${e.message}`); }
    } else {
      const righe = fs.readFileSync(p, 'utf8').split('\n');
      console.log(`      ${righe.length} righe`);
      righe.slice(0, 4).forEach((r) => console.log(`      | ${r.slice(0, 160)}`));
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

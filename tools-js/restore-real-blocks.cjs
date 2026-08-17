/*
 * Rimette i blocchi AUTENTICI dove esistono, al posto di quelli che avevo ricostruito.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-real-blocks.js --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-real-blocks.js
 *
 * PERCHE': il seed del server carica le quest evento da event.extended.blank.json,
 * che ha i mBlocks vuoti. Ma accanto c'e' event.extended.json, che per 967 quest
 * su 1524 contiene i blocchi VERI, generati dal progetto originale incrociando
 * quests.csv e blocks.csv (vedi services/questService.ts nel repo upstream).
 *
 * La mia ricostruzione precedente (fix-blocks.js) sceglieva i blocchi per
 * continente+mappa leggendo il mDefineId. Su EVENT900101 dava l90_m01, mentre il
 * dato autentico e' l90_m12: l'interpretazione del secondo gruppo di cifre come
 * "mappa" era sbagliata. Il vero raggruppamento e' il SUFFISSO del nome del blocco
 * (l90_m12_a01_0011, _a05_0011, _a06_0011...), che identifica il set di aree.
 *
 * Tocco SOLO il campo mBlocks: tutto il resto del documento resta com'e'.
 * Le quest per cui non esiste il dato autentico mantengono la ricostruzione,
 * altrimenti tornerebbero a dare errore 10001.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const SORGENTI = [
  'event.extended.json',
  'ticket.extended.complete.json',
  'score.extended.complete.json',
  'eternal.extended.complete.json',
  'normal.extended.complete.json',
];

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  // raccolgo i blocchi autentici da tutti i file
  const veri = new Map(); // mQuestID -> blocchi
  for (const f of SORGENTI) {
    const p = path.join('/app/dist/json/questDB', f);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    const lista = d?.rQuestSheet?.mQuestDataList || [];
    let n = 0;
    for (const q of lista) {
      if (Array.isArray(q.mBlocks) && q.mBlocks.length > 0 && q.mQuestID) {
        veri.set(String(q.mQuestID), q.mBlocks);
        n++;
      }
    }
    console.log(`  ${f.padEnd(36)} quest con blocchi autentici: ${n}`);
  }
  console.log(`\ntotale quest con blocchi autentici: ${veri.size}`);

  // confronto con quello che c'e' adesso nel database
  const ids = [...veri.keys()];
  const attuali = await qs.find({ mQuestID: { $in: ids } })
    .project({ mQuestID: 1, mBlocks: 1, mBlocksSource: 1 }).toArray();

  let uguali = 0, diversi = 0, ops = [];
  const esempi = [];
  for (const doc of attuali) {
    const nuovo = veri.get(String(doc.mQuestID));
    const vecchio = doc.mBlocks || [];
    const stessi = vecchio.length === nuovo.length && vecchio.every((v, i) => Number(v) === Number(nuovo[i]));
    if (stessi) { uguali++; continue; }
    diversi++;
    if (esempi.length < 5) {
      esempi.push(`  quest ${doc.mQuestID}: ${JSON.stringify(vecchio)} -> ${JSON.stringify(nuovo)} (era "${doc.mBlocksSource || 'originale'}")`);
    }
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { mBlocks: nuovo.map(Number), mBlocksSource: 'autentico' } },
      },
    });
  }

  console.log(`\nquest trovate nel DB      : ${attuali.length}`);
  console.log(`  gia' corrette           : ${uguali}`);
  console.log(`  da correggere           : ${diversi}`);
  console.log('\nesempi di correzione:');
  esempi.forEach((e) => console.log(e));

  if (DRY) {
    console.log('\n[dry] nessuna scrittura.');
  } else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\ncorrette ${r.modifiedCount} quest.`);
    const perFonte = await qs.aggregate([
      { $group: { _id: '$mBlocksSource', n: { $sum: 1 } } }, { $sort: { n: -1 } },
    ]).toArray();
    console.log('\nstato finale dei blocchi:');
    for (const f of perFonte) console.log(`  ${String(f._id ?? 'originale del dump').padEnd(22)} ${f.n}`);
    const vuoti = await qs.countDocuments({ $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] });
    console.log(`  senza blocchi          ${vuoti}`);
    console.log('\nChiudi e riapri il gioco.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

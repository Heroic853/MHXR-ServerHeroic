/*
 * Si puo' ricostruire quali blocchi appartengono a una quest evento?
 * Ipotesi: il nome del blocco (l00_m01_a01_0101) codifica la mappa, e la quest
 * ha un mMapID. Se i due si incrociano, possiamo assegnare blocchi coerenti.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/check-mapping.js
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
  const qs = mongoose.connection.db.collection('questsheets');

  // 1) com'e' fatta una quest evento senza blocchi
  console.log('=== esempio di quest EVENT senza blocchi ===');
  const ev = await qs.findOne({ mDefineId: /^EVENT/, mBlocks: { $size: 0 } });
  if (ev) {
    for (const k of ['mQuestID', 'mDefineId', 'mQuestName', 'mMapID', 'mQuestType', 'mSortieType', 'mTimeLimit']) {
      console.log(`  ${k.padEnd(14)} ${JSON.stringify(ev[k])}`);
    }
    console.log(`  mBossList      ${JSON.stringify(ev.mBossList)}`);
  }

  // 2) com'e' fatta una quest normale CON blocchi, stessa mappa
  console.log('\n=== quest QUEST con blocchi, stessa mMapID ===');
  const ok = await qs.findOne({ mDefineId: /^QUEST/, mMapID: ev && ev.mMapID, 'mBlocks.0': { $exists: true } });
  if (ok) {
    for (const k of ['mQuestID', 'mDefineId', 'mMapID']) {
      console.log(`  ${k.padEnd(14)} ${JSON.stringify(ok[k])}`);
    }
    console.log(`  mBlocks        ${JSON.stringify(ok.mBlocks)}`);
  } else {
    console.log('  nessuna quest normale con la stessa mMapID');
  }

  // 3) i blocchi usati dalle quest normali: come si distribuiscono per mappa?
  console.log('\n=== blocchi per mMapID nelle quest che funzionano ===');
  const perMappa = await qs.aggregate([
    { $match: { 'mBlocks.0': { $exists: true } } },
    { $group: { _id: '$mMapID', quest: { $sum: 1 }, blocchi: { $addToSet: '$mBlocks' } } },
    { $sort: { quest: -1 } },
    { $limit: 15 },
  ]).toArray();
  for (const m of perMappa) {
    const distinti = new Set();
    for (const arr of m.blocchi) for (const b of arr) distinti.add(b);
    console.log(`  mMapID=${String(m._id).padEnd(5)} quest=${String(m.quest).padStart(4)}  blocchi distinti=${distinti.size}`);
  }

  // 4) quali mMapID hanno le quest evento rimaste a secco
  console.log('\n=== mMapID delle quest EVENT senza blocchi ===');
  const evMappe = await qs.aggregate([
    { $match: { mBlocks: { $size: 0 } } },
    { $group: { _id: { mappa: '$mMapID', tipo: { $substrCP: [{ $ifNull: ['$mDefineId', '?'] }, 0, 5] } }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 15 },
  ]).toArray();
  for (const m of evMappe) {
    console.log(`  tipo=${String(m._id.tipo).padEnd(6)} mMapID=${String(m._id.mappa).padEnd(5)} quest=${m.n}`);
  }

  // 5) i 2640 hash di event.blocks.json: corrispondono a nomi in blocks.csv?
  const evBlocks = JSON.parse(fs.readFileSync(path.join(DIST, 'json/questDB/event.blocks.json'), 'utf8'));
  const csv = fs.readFileSync(path.join(DIST, 'csv/blocks.csv'), 'utf8').split('\n').slice(1);
  const perHash = new Map();
  for (const riga of csv) {
    const [nome, hash] = riga.trim().split(',');
    if (nome && hash) perHash.set(Number(hash), nome);
  }
  const risolti = evBlocks.filter((h) => perHash.has(Number(h)));
  console.log(`\n=== event.blocks.json ===`);
  console.log(`  hash totali            : ${evBlocks.length}`);
  console.log(`  risolti in blocks.csv  : ${risolti.length}`);
  console.log(`  esempi: ${risolti.slice(0, 6).map((h) => `${h}=${perHash.get(Number(h))}`).join('  ')}`);

  // raggruppo i blocchi evento per mappa (il pezzo m## del nome)
  const perMappaNome = {};
  for (const h of risolti) {
    const nome = perHash.get(Number(h));
    const m = nome.match(/^l(\d+)_m(\d+)_/);
    if (m) {
      const k = `l${m[1]}_m${m[2]}`;
      (perMappaNome[k] ??= []).push(nome);
    }
  }
  console.log('\n  blocchi evento raggruppati per mappa:');
  Object.entries(perMappaNome).sort((a, b) => b[1].length - a[1].length).slice(0, 15)
    .forEach(([k, v]) => console.log(`    ${k}  ${v.length} blocchi`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

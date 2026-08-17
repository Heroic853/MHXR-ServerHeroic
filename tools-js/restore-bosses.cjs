/*
 * Recupera i mBossList delle quest evento, persi durante l'importazione.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-bosses.cjs --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-bosses.cjs
 *
 * COSA ERA SUCCESSO
 * Nel dump grezzo il boss e' avvolto in una struttura del convertitore XFS:
 *     {"mAutoDelete":"false","classref_":{"mpArray":[{"mEnemyID":"3"},{"mAreaNo":"3"},...]}}
 * e in alcune quest la chiave e' "array" invece di "classref_", con gli oggetti
 * gia' uniti e piu' di un mostro. Lo schema Mongoose si aspetta un array
 * semplice di {mEnemyID, mAreaNo, mFieldSkillPackId}: ricevendo un oggetto ha
 * scritto [null], e tutte le 1524 quest evento sono rimaste senza boss.
 *
 * NOTA IMPORTANTE SU COSA QUESTO RISOLVE E COSA NO
 * I controller non mandano mBossList al client: la risposta di inizio quest
 * contiene solo i mst_block_id. Il mostro che compare lo decide il BLOCCO, non
 * questo campo. Recuperarlo quindi NON corregge da solo i mostri sbagliati:
 * serve ad avere il dato giusto in archivio e a poter verificare, quest per
 * quest, quale mostro ci dovrebbe essere.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

const SORGENTI = [
  'event.extended.json',
  'ticket.extended.complete.json',
  'score.extended.complete.json',
  'eternal.extended.complete.json',
];

// Normalizza le due forme del convertitore in un array di boss veri.
function estraiBoss(mBossList) {
  if (Array.isArray(mBossList)) {
    const validi = mBossList.filter((b) => b && b.mEnemyID);
    return validi.length ? validi : null;
  }
  const arr = mBossList?.classref_?.mpArray ?? mBossList?.array?.mpArray;
  if (!Array.isArray(arr)) return null;

  // forma "array": ogni elemento e' gia' completo -> piu' mostri
  if (arr.some((e) => e && e.mEnemyID && e.mAreaNo !== undefined)) {
    return arr.filter((e) => e && e.mEnemyID);
  }
  // forma "classref_": oggetti a chiave singola da unire in uno solo
  const unito = {};
  for (const e of arr) if (e && typeof e === 'object') Object.assign(unito, e);
  return unito.mEnemyID ? [unito] : null;
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const boss = new Map();
  for (const f of SORGENTI) {
    const p = path.join('/app/dist/json/questDB', f);
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    let n = 0;
    for (const q of d?.rQuestSheet?.mQuestDataList || []) {
      const b = estraiBoss(q.mBossList);
      if (b && q.mQuestID) { boss.set(String(q.mQuestID), b); n++; }
    }
    console.log(`  ${f.padEnd(36)} boss recuperati: ${n}`);
  }
  console.log(`\ntotale quest con boss nei file: ${boss.size}`);

  const ids = [...boss.keys()];
  const attuali = await qs.find({ mQuestID: { $in: ids } })
    .project({ mQuestID: 1, mBossList: 1, mQuestName: 1 }).toArray();

  const ops = [];
  const esempi = [];
  let gia = 0;
  for (const doc of attuali) {
    const nuovo = boss.get(String(doc.mQuestID));
    const vecchio = (doc.mBossList || []).filter((b) => b && b.mEnemyID);
    if (vecchio.length) { gia++; continue; }
    if (esempi.length < 6) {
      const nome = String(doc.mQuestName || '').replace(/\n/g, ' ');
      esempi.push(`  ${nome}  ->  ${nuovo.map((b) => `enemy=${b.mEnemyID}/area=${b.mAreaNo}`).join(' + ')}`);
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { mBossList: nuovo } } } });
  }

  console.log(`quest trovate in DB : ${attuali.length}`);
  console.log(`  gia' con boss     : ${gia}`);
  console.log(`  da recuperare     : ${ops.length}`);
  console.log('\nesempi:');
  esempi.forEach((e) => console.log(e));

  if (DRY) { console.log('\n[dry] nessuna scrittura.'); }
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nrecuperati ${r.modifiedCount} boss.`);
    const senza = await qs.countDocuments({
      mDefineId: /^EVENT/,
      $or: [{ mBossList: { $size: 0 } }, { 'mBossList.0.mEnemyID': { $exists: false } }],
    });
    console.log(`quest EVENT ancora senza boss: ${senza}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

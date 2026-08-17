/*
 * Recupera le ricompense delle quest (mRewardItemList), perse nell'import come
 * lo erano i boss, e le usa per identificare il mostro di ogni quest.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/restore-rewards.cjs
 *
 * Il convertitore XFS avvolge la lista in {mAutoDelete, array:{mpArray:[...]}},
 * lo schema Mongoose si aspetta un array semplice e ha scritto [null].
 *
 * In piu': ogni materiale ha un mMonsterID nel foglio new_item_material, quindi
 * dalle ricompense si risale al mostro anche quando il titolo non lo nomina.
 * E' il ponte piu' affidabile, perche' i premi di una caccia sono per
 * definizione i materiali di quella preda.
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

function estrai(campo) {
  if (Array.isArray(campo)) return campo.filter((x) => x && x.mItemHash);
  const arr = campo?.array?.mpArray ?? campo?.classref_?.mpArray;
  return Array.isArray(arr) ? arr.filter((x) => x && x.mItemHash) : [];
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  // materiale -> mostro
  const materiali = JSON.parse(fs.readFileSync('/app/tools/materiali.json', 'utf8'));
  const mostroPerItem = new Map();
  for (const m of materiali) if (m.itemId && m.monsterId) mostroPerItem.set(String(m.itemId), Number(m.monsterId));
  console.log(`materiali con mostro: ${mostroPerItem.size}`);

  const SORGENTI = ['event.extended.json', 'ticket.extended.complete.json',
    'score.extended.complete.json', 'eternal.extended.complete.json', 'normal.extended.complete.json'];

  const premi = new Map();
  for (const f of SORGENTI) {
    const p = `/app/dist/json/questDB/${f}`;
    if (!fs.existsSync(p)) continue;
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    let n = 0;
    for (const q of d?.rQuestSheet?.mQuestDataList || []) {
      const lista = estrai(q.mRewardItemList);
      if (lista.length && q.mQuestID) { premi.set(String(q.mQuestID), lista); n++; }
    }
    console.log(`  ${f.padEnd(36)} ${n} quest con ricompense`);
  }
  console.log(`totale: ${premi.size}\n`);

  const docs = await qs.find({ mQuestID: { $in: [...premi.keys()] } })
    .project({ mQuestID: 1, mDefineId: 1, mQuestName: 1, mRewardItemList: 1 }).toArray();

  const ops = [];
  let recuperate = 0, gia = 0;
  const perMostro = new Map();

  for (const doc of docs) {
    const lista = premi.get(String(doc.mQuestID));
    const attuali = (doc.mRewardItemList || []).filter((x) => x && x.mItemHash);

    // mostro dedotto dalle ricompense: vince quello piu' rappresentato
    const voti = new Map();
    for (const r of lista) {
      const mid = mostroPerItem.get(String(r.mItemHash));
      if (mid) voti.set(mid, (voti.get(mid) || 0) + 1);
    }
    if (voti.size) {
      const ord = [...voti.entries()].sort((a, b) => b[1] - a[1]);
      perMostro.set(String(doc.mQuestID), ord[0][0]);
    }

    if (attuali.length) { gia++; continue; }
    recuperate++;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { mRewardItemList: lista.map((r) => ({
          mItemHash: String(r.mItemHash), mProbScale: String(r.mProbScale ?? '1'), mRewardType: String(r.mRewardType ?? '0'),
        })) } },
      },
    });
  }

  console.log(`quest trovate in DB     : ${docs.length}`);
  console.log(`  gia' con ricompense   : ${gia}`);
  console.log(`  da recuperare         : ${recuperate}`);
  console.log(`  mostro dedotto dai premi: ${perMostro.size}`);

  if (!DRY && ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nrecuperate ${r.modifiedCount} liste ricompense.`);
  } else if (DRY) console.log('\n[dry] nessuna scrittura.');

  // salvo la mappa quest -> mostro per il passo successivo
  const out = {};
  for (const [q, m] of perMostro) out[q] = m;
  fs.writeFileSync('/app/tools/quest-monster.json', JSON.stringify(out));
  console.log(`salvata quest->mostro per ${Object.keys(out).length} quest`);

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

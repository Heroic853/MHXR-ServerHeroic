/*
 * Diagnosi mirata: cosa offre il foglio per un mostro, e cosa chiedono le quest.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-agnaktor.cjs agnaktor アグナコトル
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const EN = process.argv[2] || 'agnaktor';
const JP = process.argv[3] || 'アグナコトル';

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
}

(async () => {
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  console.log(`=== righe del foglio con "${EN}" ===`);
  const varianti = {};
  for (const r of righe) {
    const n = pulisci(r.G);
    if (!n.includes(EN)) continue;
    if (!varianti[n]) varianti[n] = { n: 0, lands: new Set(), mappe: new Set() };
    varianti[n].n++;
    varianti[n].lands.add(r.B);
    if (r.H) varianti[n].mappe.add(String(r.H));
  }
  Object.entries(varianti).sort((a, b) => b[1].n - a[1].n)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(44)} ${String(v.n).padStart(3)}  ${[...v.lands].sort().join(',')}   ${[...v.mappe][0] || ''}`));

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const quest = await qs.find({ mDefineId: /^EVENT/, mQuestName: new RegExp(JP) })
    .project({ mQuestName: 1, mMostro: 1, mMostroVoluto: 1, mDefineId: 1 }).toArray();

  console.log(`\n=== quest evento che nominano "${JP}": ${quest.length} ===`);
  const visti = new Set();
  for (const q of quest) {
    const nome = String(q.mQuestName).replace(/\n/g, ' ');
    const chiave = nome + '|' + (q.mMostro || '-');
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    console.log(`  "${nome.slice(0, 34).padEnd(34)}"`);
    console.log(`       voluto: ${String(q.mMostroVoluto || '(non assegnata)').padEnd(24)} assegnato: ${q.mMostro || '(nessuno)'}`);
    if (visti.size >= 14) break;
  }

  // quali suffissi giapponesi compaiono in quelle quest
  console.log(`\n=== suffissi/varianti giapponesi presenti in quei titoli ===`);
  const suff = {};
  for (const q of quest) {
    for (const m of String(q.mQuestName).matchAll(/【([^】]+)】|([一-龯]{2,4}種)/g)) {
      const t = m[1] || m[2];
      if (t) suff[t] = (suff[t] || 0) + 1;
    }
  }
  Object.entries(suff).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

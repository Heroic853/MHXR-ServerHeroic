/*
 * Cosa resta scoperto e cosa offre il foglio che non sto usando.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/gap-analysis.cjs
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
}
function eMostro(n) {
  const s = pulisci(n);
  if (!s) return false;
  return !/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|gathering|^\?/i.test(s);
}

(async () => {
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);

  console.log('=== cerco Morudomundo con varie grafie ===');
  for (const p of ['mold', 'mord', 'mund', 'munt', 'moru', 'dmun', 'mol', 'mordo']) {
    const t = righe.filter((r) => eMostro(r.G) && pulisci(r.G).includes(p));
    if (t.length) {
      const nomi = [...new Set(t.map((x) => pulisci(x.G)))].slice(0, 5);
      console.log(`  "${p}": ${t.length} righe -> ${nomi.join(' | ')}`);
    }
  }

  // nomi mai visti prima: quelli che non contengono nessun mostro noto
  const NOTI = ['rathalos', 'rathian', 'tigrex', 'nargacuga', 'zinogre', 'uragaan', 'plesioth',
    'barioth', 'lagiacrus', 'gigginox', 'kushala', 'kirin', 'mizutsune', 'gore magala',
    'shagaru', 'rajang', 'seregios', 'nibelsnarf', 'akantor', 'gammoth', 'glavenus',
    'astalos', 'agnaktor', 'chameleos', 'teostra', 'apypos', 'goruru', 'ankator',
    'garudia', 'garmat', 'jaggi', 'baggi', 'wroggi', 'bullfango', 'arzuros', 'azuros',
    'lagombi', 'volvidon', 'ludroth', 'qurupeco', 'barroth', 'duramboros', 'diablos',
    'brachydios', 'deviljho', 'delex', 'cats', 'jaggia', 'jaggis'];
  const sconosciuti = {};
  for (const r of righe) {
    if (!eMostro(r.G)) continue;
    const n = pulisci(r.G);
    if (NOTI.some((k) => n.includes(k))) continue;
    sconosciuti[n] = (sconosciuti[n] || 0) + 1;
  }
  const ord = Object.entries(sconosciuti).sort((a, b) => b[1] - a[1]);
  console.log(`\n=== nomi nel foglio che non aggancio a nessun mostro noto: ${ord.length} ===`);
  ord.slice(0, 45).forEach(([k, v]) => console.log(`  ${k.padEnd(46)} ${v}`));

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const scoperte = await qs.find({ mDefineId: /^EVENT/, mMostro: { $exists: false } })
    .project({ mDefineId: 1, mQuestName: 1, mBossList: 1 }).toArray();

  console.log(`\n=== quest evento ancora senza mostro: ${scoperte.length} ===`);
  const kata = {};
  for (const q of scoperte) {
    for (const m of String(q.mQuestName || '').matchAll(/[゠-ヿー・]{3,}/g)) kata[m[0]] = (kata[m[0]] || 0) + 1;
  }
  console.log('  katakana ricorrenti:');
  Object.entries(kata).sort((a, b) => b[1] - a[1]).slice(0, 24)
    .forEach(([k, v]) => console.log(`    ${k.padEnd(20)} ${v}`));

  console.log('\n  esempi di titoli:');
  scoperte.slice(0, 14).forEach((q) => console.log(`    "${String(q.mQuestName).replace(/\n/g, ' ').slice(0, 44)}"`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

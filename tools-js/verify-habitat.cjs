/*
 * Controllo finale: nessuna quest evento usa blocchi dei continenti della storia
 * (dove c'e' il tutorial), e in che ambienti si svolgono adesso.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/verify-habitat.cjs
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const info = new Map();
  for (const r of righe) {
    const h = Number(r.F);
    if (h && !isNaN(h)) info.set(h, { land: r.B, ambiente: String(r.H || ''), nota: r.G || '' });
  }

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const eventi = await qs.find({ mDefineId: /^EVENT/, mMostro: { $exists: true } })
    .project({ mQuestName: 1, mBlocks: 1, mMostro: 1, mMostroVoluto: 1 }).toArray();

  const perLand = {}, perAmbiente = {};
  let storia = 0, arene = 0;
  for (const q of eventi) {
    for (const h of q.mBlocks || []) {
      const i = info.get(Number(h));
      if (!i) continue;
      perLand[i.land] = (perLand[i.land] || 0) + 1;
      if (/^l(0\d|1\d)$/.test(i.land)) storia++;
      const a = i.ambiente || '(vuoto)';
      perAmbiente[a] = (perAmbiente[a] || 0) + 1;
      if (/arena|battlequarters/i.test(a)) arene++;
    }
  }

  console.log(`quest evento con mostro assegnato: ${eventi.length}\n`);
  console.log(`=== blocchi dei continenti della STORIA (dovrebbero essere 0) ===`);
  console.log(`  ${storia}`);
  console.log(`\n=== continenti usati ===`);
  console.log('  ' + Object.entries(perLand).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
  console.log(`\n=== ambienti ===`);
  Object.entries(perAmbiente).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(30)} ${v}`));
  console.log(`\n  blocchi in arena: ${arene} su ${Object.values(perAmbiente).reduce((a, b) => a + b, 0)}`);

  console.log(`\n=== il mostro trovato coincide con quello voluto? ===`);
  let esatti = 0, diversi = 0;
  const scarti = [];
  for (const q of eventi) {
    if (q.mMostro === q.mMostroVoluto) esatti++;
    else {
      diversi++;
      if (scarti.length < 8) scarti.push(`  voluto "${q.mMostroVoluto}" -> assegnato "${q.mMostro}"`);
    }
  }
  console.log(`  coincide esattamente : ${esatti}`);
  console.log(`  ripiego              : ${diversi}`);
  scarti.forEach((s) => console.log(s));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

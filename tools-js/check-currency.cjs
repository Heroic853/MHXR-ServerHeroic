/*
 * Dove sta la valuta premium e quanta ne ha il personaggio?
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-currency.cjs
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const u = await mongoose.connection.db.collection('users').findOne({});
  if (!u) { console.log('nessun utente'); process.exit(1); }

  console.log(`personaggio: ${u.character_name}`);
  console.log(`\n  box.zeny            : ${u.box?.zeny}`);
  console.log(`  box.monument.hr     : ${u.box?.monument?.hr}`);
  console.log(`  box.monument.mlv    : ${JSON.stringify(u.box?.monument?.mlv)}`);

  for (const campo of ['payments', 'points', 'powers', 'limiteds', 'growth_items', 'matatabis', 'materials']) {
    const v = u.box?.[campo];
    console.log(`\n  box.${campo}:`);
    if (!Array.isArray(v) || !v.length) { console.log('    vuoto'); continue; }
    for (const e of v.slice(0, 6)) {
      const { _id, ...resto } = e;
      console.log(`    ${JSON.stringify(resto)}`);
    }
    if (v.length > 6) console.log(`    ... altri ${v.length - 6}`);
  }

  console.log(`\n  equipaggiamenti     : ${(u.box?.equipments || []).length}`);
  const primaArma = (u.box?.equipments || []).find((e) => String(e.equipment_id).startsWith('WD_'));
  if (primaArma) {
    const { _id, ...r } = primaArma;
    console.log(`    prima arma: ${JSON.stringify(r)}`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

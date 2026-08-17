/*
 * Quanto testo giapponese arriva dal SERVER (e quindi possiamo tradurlo)
 * rispetto a quello dentro i file del gioco (che richiederebbe di rifare gli FPK).
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/count-text.js
 */
const path = require('path');
const mongoose = require('mongoose');
const DIST = '/app/dist';

const HA_JP = /[぀-ゟ゠-ヿ一-鿿]/; // hiragana, katakana, kanji

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const db = mongoose.connection.db;

  console.log('=== testo servito dal SERVER ===\n');

  // 1) nomi delle quest, dentro la collection questsheets
  const qs = db.collection('questsheets');
  const tot = await qs.countDocuments({});
  const nomi = await qs.distinct('mQuestName');
  const nomiJp = nomi.filter((n) => n && HA_JP.test(n));
  console.log(`questsheets      : ${tot} documenti`);
  console.log(`  mQuestName distinti     : ${nomi.length}`);
  console.log(`  di cui in giapponese    : ${nomiJp.length}`);
  console.log(`  esempi: ${nomiJp.slice(0, 3).map((s) => JSON.stringify(s)).join('  ')}`);

  // 2) nomi e commenti degli eventi, da event_nodes.json
  const nodes = require(path.join(DIST, 'json/event_nodes.json'));
  const nomiEv = new Set();
  const commenti = new Set();
  for (const n of nodes) {
    if (n.mEventNodeName && HA_JP.test(n.mEventNodeName)) nomiEv.add(n.mEventNodeName);
    if (n.mComment && HA_JP.test(n.mComment)) commenti.add(n.mComment);
  }
  console.log(`\nevent_nodes.json : ${nodes.length} nodi`);
  console.log(`  mEventNodeName distinti : ${nomiEv.size}`);
  console.log(`  mComment distinti       : ${commenti.size}`);

  // 3) altri testi hardcoded nei controller
  const fs = require('fs');
  const routes = path.join(DIST, 'routes');
  let stringheJp = new Set();
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
        const s = m[1] ?? m[2];
        if (s && HA_JP.test(s)) stringheJp.add(s);
      }
    }
  };
  walk(routes);
  console.log(`\ncontroller       : ${stringheJp.size} stringhe giapponesi hardcoded`);
  console.log(`  esempi: ${[...stringheJp].slice(0, 3).map((s) => JSON.stringify(s.slice(0, 40))).join('  ')}`);

  const totale = nomiJp.length + nomiEv.size + commenti.size + stringheJp.size;
  console.log(`\n>>> TOTALE stringhe traducibili lato server: ${totale}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

/*
 * Quanto e' ripetitivo il testo delle quest? Se i nomi sono composti da pochi
 * termini ricorrenti (mostri, elementi, gradi), un glossario li traduce quasi
 * tutti senza doverli scrivere a mano uno per uno.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/analyze-text.js
 */
const mongoose = require('mongoose');
const path = require('path');
const DIST = '/app/dist';

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const JP = /[぀-ゟ゠-ヿ一-鿿]/;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const db = mongoose.connection.db;

  const nomi = (await db.collection('questsheets').distinct('mQuestName')).filter((n) => n && JP.test(n));

  // Prefissi tra parentesi quadre giapponesi: 【中級】, 【上級】...
  const prefissi = {};
  for (const n of nomi) {
    const m = n.match(/【([^】]+)】/g);
    if (m) for (const p of m) prefissi[p] = (prefissi[p] || 0) + 1;
  }
  console.log('=== marcatori 【...】 nei nomi quest ===');
  Object.entries(prefissi).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));

  // Sequenze katakana: quasi sempre nomi di mostri
  const kata = {};
  for (const n of nomi) {
    for (const m of n.matchAll(/[゠-ヿー]{3,}/g)) kata[m[0]] = (kata[m[0]] || 0) + 1;
  }
  const kataOrd = Object.entries(kata).sort((a, b) => b[1] - a[1]);
  console.log(`\n=== nomi in katakana (mostri/oggetti): ${kataOrd.length} distinti ===`);
  kataOrd.slice(0, 25).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));

  // Copertura: se traduco i primi N termini, quante quest diventano leggibili?
  console.log('\n=== copertura del glossario ===');
  for (const n of [50, 100, 200, 400]) {
    const top = new Set(kataOrd.slice(0, n).map((e) => e[0]));
    const coperte = nomi.filter((q) => [...q.matchAll(/[゠-ヿー]{3,}/g)].some((m) => top.has(m[0]))).length;
    console.log(`  primi ${String(n).padEnd(4)} termini katakana -> toccano ${coperte}/${nomi.length} nomi quest (${Math.round(coperte / nomi.length * 100)}%)`);
  }

  // Quanti nomi sono solo "numero + testo" ripetuto
  const senzaNumeri = new Set(nomi.map((n) => n.replace(/[0-9０-９\-]+/g, '#')));
  console.log(`\n=== nomi quest ===`);
  console.log(`  distinti                       : ${nomi.length}`);
  console.log(`  distinti ignorando i numeri    : ${senzaNumeri.size}`);
  console.log(`  quindi ${nomi.length - senzaNumeri.size} sono varianti numerate dello stesso nome`);

  // Eventi
  const nodes = require(path.join(DIST, 'json/event_nodes.json'));
  const evNomi = [...new Set(nodes.map((n) => n.mEventNodeName).filter((s) => s && JP.test(s)))];
  const evSenza = new Set(evNomi.map((n) => n.replace(/[0-9０-９]+/g, '#')));
  console.log(`\n=== nomi eventi ===`);
  console.log(`  distinti                       : ${evNomi.length}`);
  console.log(`  distinti ignorando i numeri    : ${evSenza.size}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

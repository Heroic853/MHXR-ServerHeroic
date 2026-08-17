/*
 * IPOTESI: mDefineId "EVENT900101" si scompone in EVENT + 90 + 01 + 01, dove
 * 90 e' il continente (blocchi "l90_...") e i due gruppi seguenti restringono
 * mappa/area. Se regge, possiamo assegnare a ogni quest evento blocchi coerenti.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/test-hypothesis.js
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

  // tabella hash -> nome per TUTTI i blocchi
  const csv = fs.readFileSync(path.join(DIST, 'csv/blocks.csv'), 'utf8').split('\n').slice(1);
  const nomePerHash = new Map();
  const hashPerNome = new Map();
  for (const riga of csv) {
    const [nome, hash] = riga.trim().split(',');
    if (nome && hash) { nomePerHash.set(Number(hash), nome); hashPerNome.set(nome, Number(hash)); }
  }

  // indice: "l90_m12" -> elenco nomi blocco
  const perLandMap = {};
  for (const nome of hashPerNome.keys()) {
    const m = nome.match(/^l(\d+)_m(\d+)_a(\d+)_(\d+)$/);
    if (!m) continue;
    (perLandMap[`l${m[1]}_m${m[2]}`] ??= []).push(nome);
  }

  // quali continenti esistono davvero fra i blocchi
  const continenti = new Set();
  for (const k of Object.keys(perLandMap)) continenti.add(k.split('_')[0]);
  console.log(`continenti presenti in blocks.csv: ${[...continenti].sort().join(', ')}`);

  // scompongo i mDefineId delle quest senza blocchi
  const senza = await qs.find({ mBlocks: { $size: 0 }, mDefineId: /^EVENT\d+/ }).project({ mDefineId: 1, mQuestID: 1 }).toArray();
  console.log(`\nquest EVENT senza blocchi: ${senza.length}`);

  const conteggio = { landOk: 0, landMapOk: 0, landKo: 0 };
  const landVisti = {};
  const esempi = [];

  for (const q of senza) {
    const m = String(q.mDefineId).match(/^EVENT(\d{2})(\d{2})(\d{2})$/);
    if (!m) continue;
    const [, land, g2, g3] = m;
    landVisti[`l${land}`] = (landVisti[`l${land}`] || 0) + 1;

    const haLand = continenti.has(`l${land}`);
    if (haLand) conteggio.landOk++; else conteggio.landKo++;

    const chiave = `l${land}_m${g2}`;
    if (perLandMap[chiave]) {
      conteggio.landMapOk++;
      if (esempi.length < 8) {
        esempi.push(`  ${q.mDefineId} -> ${chiave}  (${perLandMap[chiave].length} blocchi disponibili, es. ${perLandMap[chiave].slice(0, 2).join(' ')})`);
      }
    }
  }

  console.log('\n=== esito ipotesi ===');
  console.log(`  continente riconosciuto (l##)     : ${conteggio.landOk}/${senza.length}`);
  console.log(`  continente NON riconosciuto       : ${conteggio.landKo}`);
  console.log(`  anche la mappa combacia (l##_m##) : ${conteggio.landMapOk}/${senza.length}`);

  console.log('\n=== distribuzione dei continenti nei mDefineId ===');
  Object.entries(landVisti).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([k, v]) => console.log(`  ${k}  ${v} quest   ${continenti.has(k) ? '(esiste nei blocchi)' : '(NON esiste)'}`));

  console.log('\n=== esempi di corrispondenza ===');
  esempi.forEach((e) => console.log(e));

  // controprova: le quest NORMALI che funzionano, i loro blocchi rispettano lo schema?
  console.log('\n=== controprova sulle quest che funzionano ===');
  const funzionanti = await qs.find({ 'mBlocks.0': { $exists: true } }).project({ mDefineId: 1, mBlocks: 1 }).limit(400).toArray();
  const landDaBlocchi = {};
  for (const q of funzionanti) {
    for (const h of q.mBlocks) {
      const nome = nomePerHash.get(Number(h));
      if (!nome) continue;
      const mm = nome.match(/^l(\d+)_/);
      if (mm) landDaBlocchi[`l${mm[1]}`] = (landDaBlocchi[`l${mm[1]}`] || 0) + 1;
    }
  }
  console.log('  continenti usati dai blocchi delle quest normali:');
  Object.entries(landDaBlocchi).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([k, v]) => console.log(`    ${k}  ${v} riferimenti`));
  console.log(`  numero di blocchi per quest: ${[...new Set(funzionanti.map((q) => q.mBlocks.length))].sort((a, b) => a - b).join(', ')}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

/*
 * Garantisce che ogni quest abbia abbastanza blocchi per ospitare il suo boss.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fix-block-count.cjs --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fix-block-count.cjs
 *
 * LA REGOLA, RICAVATA DAI DATI
 * mBossList.mAreaNo non e' l'area della mappa ma l'indice del blocco nella
 * sequenza che il server invia (nel controller: block_idx = index + 1).
 * Verificato sulle 1995 quest della storia, quelle che funzionano davvero:
 * il numero di blocchi e' >= del piu' alto mAreaNo nel 100% dei casi, senza
 * una sola eccezione. Nelle quest evento invece 168 violano la regola, e in
 * quelle il client non ha dove mettere il mostro.
 *
 * Le quest della storia usano quasi sempre 4 blocchi (1652 su 1995), quindi e'
 * il minimo che applico anche qui.
 *
 * Aggiungo blocchi presi dalla STESSA mappa di quelli gia' presenti, scegliendo
 * aree non ancora usate: mescolare mappe diverse nella stessa caccia non ha senso.
 */
const fs = require('fs');
const mongoose = require('mongoose');

// NIENTE minimo fisso a 4. La regola validata sulle quest della storia e'
// "blocchi >= indice del boss", non "blocchi >= 4": imporre 4 modificherebbe
// 1995 quest che funzionano gia' benissimo con 3 blocchi e il boss al terzo.
// Si tocca solo chi viola davvero la regola.

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  // indice dei blocchi per mappa
  const csv = fs.readFileSync('/app/dist/csv/blocks.csv', 'utf8').split('\n').slice(1);
  const nomePerHash = new Map();
  const perMappa = new Map(); // "l90_m12" -> [{nome, hash, area}]
  for (const r of csv) {
    const [nome, hash] = r.trim().split(',');
    if (!nome || !hash) continue;
    const h = Number(hash);
    nomePerHash.set(h, nome);
    const m = nome.match(/^(l\d+_m\d+)_a(\d+)_/);
    if (!m) continue;
    if (!perMappa.has(m[1])) perMappa.set(m[1], []);
    perMappa.get(m[1]).push({ nome, hash: h, area: m[2] });
  }

  // Solo quest evento/ticket/score/eternal: quelle della storia hanno i blocchi
  // originali del dump, rispettano gia' la regola al 100% e non vanno toccate.
  const docs = await qs.find({
    'mBlocks.0': { $exists: true },
    mDefineId: { $not: /^QUEST/ },
  }).project({ mDefineId: 1, mQuestName: 1, mBossList: 1, mBlocks: 1, mBlocksSource: 1 }).toArray();

  const ops = [];
  const esempi = [];
  let ok = 0, sistemate = 0, impossibili = 0;

  for (const q of docs) {
    const indici = (q.mBossList || [])
      .map((b) => parseInt(b?.mAreaNo, 10))
      .filter((n) => !isNaN(n));
    const servono = Math.max(...indici, 0);
    const attuali = q.mBlocks || [];
    if (attuali.length >= servono) { ok++; continue; }

    // da quale mappa vengono i blocchi che ha gia'?
    const mappe = new Set();
    for (const h of attuali) {
      const nome = nomePerHash.get(Number(h));
      const m = nome && nome.match(/^(l\d+_m\d+)_/);
      if (m) mappe.add(m[1]);
    }
    if (mappe.size !== 1) { impossibili++; continue; }
    const mappa = [...mappe][0];
    const candidati = perMappa.get(mappa) || [];

    const gia = new Set(attuali.map(Number));
    const areeUsate = new Set();
    for (const h of attuali) {
      const nome = nomePerHash.get(Number(h));
      const m = nome && nome.match(/_a(\d+)_/);
      if (m) areeUsate.add(m[1]);
    }

    // prima blocchi di aree nuove, poi qualunque altro della stessa mappa
    const nuovi = [];
    for (const c of candidati.sort((a, b) => a.nome.localeCompare(b.nome))) {
      if (attuali.length + nuovi.length >= servono) break;
      if (gia.has(c.hash) || areeUsate.has(c.area)) continue;
      nuovi.push(c.hash); areeUsate.add(c.area);
    }
    for (const c of candidati) {
      if (attuali.length + nuovi.length >= servono) break;
      if (gia.has(c.hash) || nuovi.includes(c.hash)) continue;
      nuovi.push(c.hash);
    }

    if (attuali.length + nuovi.length < servono) { impossibili++; continue; }

    const finali = [...attuali.map(Number), ...nuovi];
    sistemate++;
    if (esempi.length < 6) {
      esempi.push(`  ${q.mDefineId}: boss al blocco ${Math.max(...indici)}, aveva ${attuali.length} -> ora ${finali.length}  (mappa ${mappa})`);
    }
    ops.push({
      updateOne: {
        filter: { _id: q._id },
        update: { $set: { mBlocks: finali, mBlocksSource: `${q.mBlocksSource || 'originale'}+completato` } },
      },
    });
  }

  console.log(`quest con blocchi         : ${docs.length}`);
  console.log(`  gia' a posto            : ${ok}`);
  console.log(`  da completare           : ${sistemate}`);
  console.log(`  non completabili        : ${impossibili}`);
  console.log('\nesempi:');
  esempi.forEach((e) => console.log(e));

  if (DRY) console.log('\n[dry] nessuna scrittura.');
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\ncompletate ${r.modifiedCount} quest.`);
    console.log('Chiudi e riapri il gioco.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

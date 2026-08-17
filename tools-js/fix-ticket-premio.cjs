/*
 * Le quest premio (ticket "レア装備確定", "フラッグどっさり", "曙光頭装備25%"...)
 * non sono cacce: si consumano per ricevere equipaggiamento. Non avendo un
 * mostro, fix-monsters.cjs le salta, e restano coi blocchi originali — che sono
 * quelli dei continenti della storia, fra cui l'isola del tutorial.
 *
 * Qui non c'e' niente da indovinare: si sostituiscono con blocchi di RACCOLTA
 * in un continente evento. Nessun boss, nessun tutorial, e il numero di blocchi
 * rispetta la regola blocchi >= max(mAreaNo).
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fix-ticket-premio.cjs --dry
 *   ... senza --dry per applicare
 *   ... --undo per tornare indietro
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');
const UNDO = process.argv.includes('--undo');

const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const E_STORIA = (land) => /^l(0\d|1[0-8])$/.test(String(land || ''));

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  if (UNDO) {
    const docs = await qs.find({ mBlocchiPremioPrima: { $exists: true } })
      .project({ mBlocchiPremioPrima: 1 }).toArray();
    console.log(`ripristino ${docs.length} quest`);
    if (!DRY) {
      for (const d of docs) {
        await qs.updateOne({ _id: d._id }, {
          $set: { mBlocks: d.mBlocchiPremioPrima },
          $unset: { mBlocchiPremioPrima: '', mBlocksSource: '' },
        });
      }
    }
    await mongoose.disconnect();
    return;
  }

  // --- blocchi di raccolta in continente evento -----------------------------
  const foglio = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const neutri = [];
  for (const r of foglio) {
    if (!r.F || !r.B) continue;
    if (E_STORIA(r.B)) continue;                       // niente continenti storia
    if (!/^l(70|75|9\d)$/.test(String(r.B))) continue; // solo continenti evento
    const nota = pulisci(r.G).toLowerCase();
    // blocchi di sola raccolta: nessun mostro da affrontare
    if (!/collection node|gathering node|mining|bug|honey|herb/.test(nota)) continue;
    if (/hunter|hp:|dead|test/.test(nota)) continue;
    neutri.push({ hash: String(r.F), land: r.B, mappa: r.C, area: r.D, nota: pulisci(r.G) });
  }
  console.log(`blocchi di raccolta utilizzabili: ${neutri.length}`);
  if (!neutri.length) { console.error('nessun blocco neutro trovato: controlla il foglio'); process.exit(1); }

  // tutti dalla stessa mappa: mescolare mappe diverse in una quest e' incoerente
  const perMappa = new Map();
  for (const b of neutri) {
    const k = `${b.land}/${b.mappa}`;
    if (!perMappa.has(k)) perMappa.set(k, []);
    perMappa.get(k).push(b);
  }
  const mappaScelta = [...perMappa.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  console.log(`mappa scelta: ${mappaScelta[0]} (${mappaScelta[1].length} blocchi)\n`);
  const pool = mappaScelta[1];

  // --- le candidate ---------------------------------------------------------
  const BLOCCO = new Map();
  for (const r of foglio) if (r.F) BLOCCO.set(String(r.F), { land: r.B });

  const tutte = await qs.find({ mDefineId: /^(TICKE|SCORE)/ })
    .project({ mDefineId: 1, mQuestName: 1, mBlocks: 1, mBossList: 1, mMostro: 1, mBlocchiPremioPrima: 1 })
    .toArray();

  const ops = [];
  const esempi = [];
  for (const q of tutte) {
    if (q.mMostro) continue; // ha gia' un mostro: l'ha sistemata fix-monsters
    const blocchi = (q.mBlocks || []).filter(Boolean);
    const suStoria = blocchi.some((h) => {
      const b = BLOCCO.get(String(h));
      return b && E_STORIA(b.land);
    });
    if (!suStoria) continue;

    const aree = (q.mBossList || []).map((b) => parseInt(b && b.mAreaNo, 10)).filter((n) => !isNaN(n));
    const quanti = Math.max(blocchi.length || 1, aree.length ? Math.max(...aree) : 1);

    const finali = [];
    for (let i = 0; i < quanti; i++) finali.push(pool[i % pool.length].hash);

    if (esempi.length < 10) {
      esempi.push(`  ${String(q.mDefineId).padEnd(14)} ${blocchi.length}->${finali.length} blocchi  "${pulisci(q.mQuestName).slice(0, 34)}"`);
    }
    ops.push({
      updateOne: {
        filter: { _id: q._id },
        update: {
          $set: {
            mBlocks: finali,
            mBlocksSource: 'ticket-premio-neutro',
            ...(q.mBlocchiPremioPrima ? {} : { mBlocchiPremioPrima: blocchi }),
          },
        },
      },
    });
  }

  console.log(`quest premio da spostare fuori dal tutorial: ${ops.length}`);
  esempi.forEach((e) => console.log(e));

  if (DRY) { console.log('\n--dry: niente scritto'); }
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nscritte ${r.modifiedCount} quest`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

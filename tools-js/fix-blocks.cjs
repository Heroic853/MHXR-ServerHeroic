/*
 * Assegna i blocchi mappa alle quest che ne sono prive, eliminando l'errore 10001.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/fix-blocks.js --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/fix-blocks.js
 *   ... --only=EVENT     lavora solo su un tipo (EVENT, TICKE, ETERN, SCORE)
 *   ... --undo           rimette mBlocks vuoto sulle quest toccate da questo script
 *
 * COS'E' E COSA NON E':
 * I dati originali non contengono la corrispondenza quest -> blocchi: nel dump ci
 * sono 2640 hash di blocchi usati dagli eventi e la tabella nome->hash, ma non chi
 * usa cosa. Questa e' una RICOSTRUZIONE, non un restauro.
 *
 * Come funziona: mDefineId "EVENT900101" si scompone in EVENT + 90 (continente)
 * + 01 (mappa) + 01 (variante), e i blocchi si chiamano l90_m01_a03_0011. Quindi
 * a ogni quest assegno blocchi del suo continente e della sua mappa, scegliendo
 * aree distinte come fanno le quest normali (che ne usano da 1 a 8, di solito 4).
 *
 * La quest diventa giocabile e ambientata nel posto giusto; la disposizione esatta
 * delle aree com'era nel 2016 non e' recuperabile da questi dati.
 *
 * Marco ogni documento con mBlocksSource, cosi' si distingue sempre cosa e'
 * originale e cosa ricostruito, e --undo puo' tornare indietro con precisione.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const DIST = '/app/dist';

const BLOCCHI_PER_QUEST = 4; // come la maggioranza delle quest originali

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const UNDO = argv.includes('--undo');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  if (UNDO) {
    const r = await qs.updateMany(
      { mBlocksSource: 'ricostruito' },
      { $set: { mBlocks: [] }, $unset: { mBlocksSource: '' } }
    );
    console.log(`annullato su ${r.modifiedCount} quest.`);
    await mongoose.disconnect();
    return;
  }

  // indice dei blocchi: nome -> hash, e raggruppamenti
  const csv = fs.readFileSync(path.join(DIST, 'csv/blocks.csv'), 'utf8').split('\n').slice(1);
  const perLandMap = {};  // "l90_m01" -> [{nome, hash, area}]
  const perLand = {};     // "l90"     -> [{nome, hash, area}]
  for (const riga of csv) {
    const [nome, hash] = riga.trim().split(',');
    if (!nome || !hash) continue;
    const m = nome.match(/^l(\d+)_m(\d+)_a(\d+)_(\d+)$/);
    if (!m) continue;
    const voce = { nome, hash: Number(hash), area: m[3] };
    (perLandMap[`l${m[1]}_m${m[2]}`] ??= []).push(voce);
    (perLand[`l${m[1]}`] ??= []).push(voce);
  }

  // sceglie N blocchi privilegiando aree DIVERSE, come nelle quest originali
  function scegli(candidati, n) {
    const perArea = new Map();
    for (const c of candidati) if (!perArea.has(c.area)) perArea.set(c.area, c);
    const unoPerArea = [...perArea.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    if (unoPerArea.length >= n) return unoPerArea.slice(0, n);
    const resto = candidati
      .filter((c) => !unoPerArea.includes(c))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return [...unoPerArea, ...resto].slice(0, n);
  }

  const filtro = { $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] };
  if (ONLY) filtro.mDefineId = new RegExp('^' + ONLY);
  const daSistemare = await qs.find(filtro).project({ mQuestID: 1, mDefineId: 1, mQuestName: 1 }).toArray();

  console.log(`quest senza blocchi: ${daSistemare.length}\n`);

  const stat = { mappaEsatta: 0, soloContinente: 0, nonRisolte: 0 };
  const ops = [];
  const esempi = [];

  for (const q of daSistemare) {
    const def = String(q.mDefineId || '');
    const m = def.match(/^[A-Z]+(\d{2})(\d{2})/);
    if (!m) { stat.nonRisolte++; continue; }
    const [, land, mappa] = m;

    let candidati = perLandMap[`l${land}_m${mappa}`];
    let livello = 'mappa esatta';

    if (!candidati || !candidati.length) {
      // La mappa indicata dal mDefineId non esiste fra i blocchi. Ripiego sul
      // continente, ma NON mescolando mappe diverse: una caccia che si svolge
      // meta' su l00_m01 e meta' su l00_m08 sarebbe incoerente. Scelgo quindi
      // la mappa piu' ricca di aree in quel continente e resto dentro quella.
      const mappeDelContinente = Object.entries(perLandMap)
        .filter(([k]) => k.startsWith(`l${land}_`))
        .sort((a, b) => b[1].length - a[1].length);
      if (mappeDelContinente.length) {
        candidati = mappeDelContinente[0][1];
        livello = `ripiego su ${mappeDelContinente[0][0]}`;
      }
    }
    if (!candidati || !candidati.length) { stat.nonRisolte++; continue; }

    if (livello === 'mappa esatta') stat.mappaEsatta++; else stat.soloContinente++;

    // sanita': tutti i blocchi scelti devono stare sulla STESSA mappa
    const mappeUsate = new Set(candidati.map((c) => c.nome.match(/^l\d+_m\d+/)[0]));
    if (mappeUsate.size !== 1) {
      console.warn(`  ATTENZIONE ${def}: candidati su piu' mappe (${[...mappeUsate].join(',')})`);
    }

    const scelti = scegli(candidati, BLOCCHI_PER_QUEST);
    if (esempi.length < 6) {
      esempi.push(`  ${def} [${livello}] -> ${scelti.map((s) => s.nome).join(' ')}`);
    }

    ops.push({
      updateOne: {
        filter: { _id: q._id },
        update: { $set: { mBlocks: scelti.map((s) => s.hash), mBlocksSource: 'ricostruito' } },
      },
    });
  }

  console.log('=== come sono state risolte ===');
  console.log(`  continente E mappa corrispondenti : ${stat.mappaEsatta}`);
  console.log(`  solo continente (mappa ripiegata) : ${stat.soloContinente}`);
  console.log(`  non risolvibili (saltate)         : ${stat.nonRisolte}`);
  console.log('\n=== esempi ===');
  esempi.forEach((e) => console.log(e));

  if (DRY) {
    console.log('\n[dry] nessuna scrittura.');
  } else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nscritte ${r.modifiedCount} quest.`);
    const restano = await qs.countDocuments({ $or: [{ mBlocks: { $size: 0 } }, { mBlocks: { $exists: false } }] });
    console.log(`quest ancora senza blocchi: ${restano}`);
    console.log('\nChiudi e riapri il gioco.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

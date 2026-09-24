/*
 * In quale missione trovo un certo mostro?
 *
 * fix-monsters.cjs scrive su ogni quest due campi: mMostroVoluto (il mostro che
 * il titolo della quest promette) e mMostro (il blocco che gli e' stato
 * assegnato davvero). Questo script li interroga, cosi' si puo' verificare che
 * una correzione sia arrivata a destinazione senza doverla cercare a mano nel
 * gioco.
 *
 * Utile soprattutto dopo un fix-monsters: quello stampa solo 12 esempi, non
 * l'elenco completo delle quest che ha sistemato.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/cerca-mostro.cjs rathalos
 *       tutte le quest il cui mostro contiene "rathalos"
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/cerca-mostro.cjs "destruction wyvern"
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/cerca-mostro.cjs --elenco
 *       elenco di tutti i mostri assegnati, con quante quest per ciascuno
 *
 *   ... cerca-mostro.cjs --quest=使徒
 *       cerca per TITOLO invece che per mostro, su TUTTE le quest comprese
 *       quelle che fix-monsters non ha mai toccato. Serve a rispondere alla
 *       domanda "questa quest esiste nel mio database, e cosa le e' stato
 *       assegnato?" quando in gioco si vede un mostro diverso da quello atteso.
 *
 *   ... cerca-mostro.cjs --scoperte
 *       le quest evento che fix-monsters NON e' riuscito ad assegnare: se una
 *       quest che ti aspetti sta qui, il suo titolo non combacia con nessuna
 *       regola e va aggiunta una sovrascrizione.
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const ELENCO = process.argv.includes('--elenco');
const SCOPERTE = process.argv.includes('--scoperte');
const arg = (n) => {
  const v = process.argv.find((a) => a.startsWith(`--${n}=`));
  return v === undefined ? null : v.split('=').slice(1).join('=');
};
const QUEST = arg('quest');
const CERCA = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').toLowerCase();

if (!ELENCO && !SCOPERTE && !QUEST && !CERCA) {
  console.error('Serve un nome da cercare, oppure --elenco / --scoperte / --quest=TITOLO.');
  process.exit(1);
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  // Il titolo sta in mQuestName (vedi src/model/questsheet.ts). Non "mName":
  // quello non esiste, e chiederlo faceva stampare "(senza nome)" ovunque.
  const PROIEZIONE = {
    mQuestName: 1, mQuestID: 1, mMostro: 1, mMostroVoluto: 1,
    mDangerLevel: 1, mBlocks: 1, mBossList: 1,
  };
  const unaRiga = (s) => String(s || '(senza nome)').replace(/\n/g, ' ').trim();

  /*
   * RICERCA PER TITOLO — su TUTTE le quest, non solo quelle gia' sistemate.
   * E' la diagnosi da fare quando in gioco compare un mostro diverso da quello
   * che la schermata della quest promette: dice se la quest esiste davvero nel
   * database, con che titolo esatto, e se fix-monsters l'ha mai toccata.
   */
  if (QUEST) {
    const trovate = await qs.find({ mQuestName: { $regex: QUEST } })
      .project(PROIEZIONE).limit(40).toArray();

    console.log('='.repeat(76));
    console.log(`titolo contiene "${QUEST}" -> ${trovate.length} quest`);
    console.log('='.repeat(76));

    if (!trovate.length) {
      console.log('\nNessuna quest con questo titolo nel database.');
      console.log('Significa che quella quest non e\' proprio presente sul tuo server:');
      console.log('nessuna correzione dei mostri potra' + '\' mai farla comparire.');
    }

    for (const q of trovate) {
      const toccata = q.mMostro !== undefined;
      console.log(`\n  ${unaRiga(q.mQuestName)}`);
      console.log(`    mQuestID : ${q.mQuestID}`);
      // Il titolo vero contiene a-capo: mostrarlo con le sequenze di escape
      // rende visibile dove sono, ed e' li' che si rompono le espressioni.
      console.log(`    titolo grezzo: ${JSON.stringify(q.mQuestName)}`);
      console.log(`    blocchi  : ${(q.mBlocks || []).length}`);
      console.log(`    id nemico: ${(q.mBossList || []).map((b) => b && b.mEnemyID).filter(Boolean).join(', ') || '(nessuno)'}`);
      if (toccata) {
        console.log(`    voluto   : ${q.mMostroVoluto || '(?)'}`);
        console.log(`    assegnato: ${q.mMostro || '(?)'}`);
      } else {
        console.log('    NON toccata da fix-monsters: nessuna regola riconosce questo titolo.');
      }
    }
    await mongoose.disconnect();
    return;
  }

  /*
   * Le quest evento rimaste senza assegnazione. Se una quest che ti aspetti di
   * vedere compare qui, il suo titolo non combacia con nessuna regola: va
   * aggiunta una riga in SOVRASCRIZIONI_TITOLO dentro fix-monsters.cjs.
   */
  if (SCOPERTE) {
    const scoperte = await qs.find({ mMostro: { $exists: false } })
      .project(PROIEZIONE).toArray();
    const conTitolo = scoperte.filter((q) => q.mQuestName);
    console.log(`${conTitolo.length} quest senza mostro assegnato\n`);
    for (const q of conTitolo.slice(0, 120)) {
      console.log(`  ${String(q.mQuestID).padEnd(12)} ${unaRiga(q.mQuestName)}`);
    }
    if (conTitolo.length > 120) console.log(`\n  ... e altre ${conTitolo.length - 120}.`);
    await mongoose.disconnect();
    return;
  }

  // Solo le quest che fix-monsters ha effettivamente toccato: le altre non
  // hanno questi campi e non direbbero nulla.
  const quest = await qs.find({ mMostro: { $exists: true } })
    .project(PROIEZIONE)
    .toArray();

  if (!quest.length) {
    console.log('Nessuna quest ha il campo mMostro: fix-monsters.cjs non e\' mai stato eseguito su questo database.');
    await mongoose.disconnect();
    return;
  }

  // --- elenco riassuntivo ---------------------------------------------------
  if (ELENCO) {
    const conta = new Map();
    for (const q of quest) {
      const m = q.mMostroVoluto || q.mMostro || '(?)';
      conta.set(m, (conta.get(m) || 0) + 1);
    }
    console.log(`${conta.size} mostri diversi su ${quest.length} quest assegnate\n`);
    for (const [m, n] of [...conta.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${m}`);
    }
    await mongoose.disconnect();
    return;
  }

  // --- ricerca --------------------------------------------------------------
  const trovate = quest.filter((q) => `${q.mMostroVoluto || ''} ${q.mMostro || ''}`.toLowerCase().includes(CERCA));

  console.log('='.repeat(76));
  console.log(`"${CERCA}" -> ${trovate.length} quest`);
  console.log('='.repeat(76));

  if (!trovate.length) {
    console.log('\nNessuna quest con questo mostro. Due possibilita\':');
    console.log('  - il nome e\' scritto diversamente (prova --elenco per vedere quelli veri)');
    console.log('  - la correzione non e\' stata applicata da fix-monsters.cjs');
    await mongoose.disconnect();
    return;
  }

  for (const q of trovate.slice(0, 60)) {
    // Il titolo vero contiene degli a-capo: su una riga sola si legge meglio.
    const titolo = String(q.mName || '(senza nome)').replace(/\n/g, ' ').trim();
    // Se voluto e assegnato non coincidono, il gioco mostrera' il secondo:
    // e' esattamente il caso che vale la pena vedere a colpo d'occhio.
    const diverso = q.mMostro && q.mMostroVoluto && q.mMostro !== q.mMostroVoluto;
    console.log(`\n  ${titolo}`);
    console.log(`    voluto   : ${q.mMostroVoluto || '(?)'}`);
    console.log(`    assegnato: ${q.mMostro || '(?)'}${diverso ? '   <-- diverso da quello voluto' : ''}`);
  }

  if (trovate.length > 60) console.log(`\n  ... e altre ${trovate.length - 60} quest.`);

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

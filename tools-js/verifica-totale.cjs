/*
 * Verifica completa di TUTTE le quest: storia, eventi, ticket, eterne, score.
 *
 * Controlla quattro cose, che sono i quattro modi in cui una quest si rompe:
 *   1. blocchi mancanti      -> il server risponde errore 10001
 *   2. blocchi della storia  -> parte il tutorial invece dell'evento
 *   3. regola dei blocchi    -> blocchi < max(mAreaNo), il boss non compare
 *   4. ricompense mancanti   -> a fine caccia arrivano i premi di ripiego
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/verifica-totale.cjs
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// I continenti l00-l18 sono quelli della storia e contengono l'isola del
// tutorial: leciti per le quest QUEST, sbagliati per tutto il resto.
const E_STORIA = (land) => /^l(0\d|1[0-8])$/.test(String(land || ''));

(async () => {
  // --- foglio dei blocchi: hash -> {continente, mappa, mostro} --------------
  const foglio = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const BLOCCO = new Map();
  for (const r of foglio) {
    if (r.F) BLOCCO.set(String(r.F), { land: r.B, mappa: r.C, nome: pulisci(r.G), luogo: pulisci(r.H) });
  }
  console.log(`foglio dei blocchi: ${BLOCCO.size} hash conosciuti\n`);

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const tutte = await qs.find({}).project({
    mDefineId: 1, mQuestName: 1, mBlocks: 1, mBossList: 1,
    mRewardItemList: 1, mMostro: 1, mMostroVoluto: 1, mBlocksSource: 1,
  }).toArray();

  const tipoDi = (q) => (String(q.mDefineId || '').match(/^[A-Z]+/) || ['ALTRO'])[0];

  const gruppi = new Map();
  for (const q of tutte) {
    const t = tipoDi(q);
    if (!gruppi.has(t)) gruppi.set(t, []);
    gruppi.get(t).push(q);
  }

  const problemi = { vuoti: [], storia: [], regola: [], premi: [], ignoti: [] };

  console.log('='.repeat(78));
  console.log('RIEPILOGO PER TIPO DI QUEST');
  console.log('='.repeat(78));
  console.log('tipo    totale  senzaBlocchi  bloccoStoria  regolaKO  senzaPremi  conMostro');

  for (const [tipo, lista] of [...gruppi.entries()].sort((a, b) => b[1].length - a[1].length)) {
    let vuoti = 0, storia = 0, regola = 0, premi = 0, mostro = 0, ignoti = 0;

    for (const q of lista) {
      const blocchi = Array.isArray(q.mBlocks) ? q.mBlocks.filter(Boolean) : [];

      if (!blocchi.length) {
        vuoti++;
        if (problemi.vuoti.length < 400) problemi.vuoti.push(q);
      }

      // un blocco della storia dentro una quest non-storia = tutorial
      if (tipo !== 'QUEST') {
        const cattivi = blocchi.filter((h) => {
          const b = BLOCCO.get(String(h));
          return b && E_STORIA(b.land);
        });
        if (cattivi.length) {
          storia++;
          if (problemi.storia.length < 400) problemi.storia.push({ q, cattivi });
        }
        const sconosciuti = blocchi.filter((h) => !BLOCCO.has(String(h)));
        if (sconosciuti.length === blocchi.length && blocchi.length) {
          ignoti++;
          if (problemi.ignoti.length < 100) problemi.ignoti.push(q);
        }
      }

      // regola validata sulle 1995 quest storia: blocchi >= max(mAreaNo)
      const aree = (q.mBossList || []).map((b) => parseInt(b && b.mAreaNo, 10)).filter((n) => !isNaN(n));
      if (aree.length && blocchi.length < Math.max(...aree)) {
        regola++;
        if (problemi.regola.length < 200) problemi.regola.push(q);
      }

      const premiOk = Array.isArray(q.mRewardItemList)
        && q.mRewardItemList.filter((r) => r && r.mItemHash).length > 0;
      if (!premiOk) {
        premi++;
        if (problemi.premi.length < 400) problemi.premi.push(q);
      }

      if (q.mMostro) mostro++;
    }

    console.log(
      `${tipo.padEnd(7)} ${String(lista.length).padStart(5)}  ${String(vuoti).padStart(12)}  ` +
      `${String(storia).padStart(12)}  ${String(regola).padStart(8)}  ` +
      `${String(premi).padStart(10)}  ${String(mostro).padStart(9)}`
    );
  }

  // --- dettaglio dei problemi ------------------------------------------------
  const mostra = (titolo, lista, fmt) => {
    console.log(`\n\n${'='.repeat(78)}\n${titolo}  (${lista.length})\n${'='.repeat(78)}`);
    if (!lista.length) { console.log('  nessuno'); return; }
    lista.slice(0, 25).forEach((x) => console.log(fmt(x)));
    if (lista.length > 25) console.log(`  ... altri ${lista.length - 25}`);
  };

  mostra('1. QUEST SENZA BLOCCHI - danno errore 10001, non si possono giocare',
    problemi.vuoti, (q) => `  ${String(q.mDefineId).padEnd(14)} "${pulisci(q.mQuestName).slice(0, 44)}"`);

  mostra('2. QUEST NON-STORIA CON BLOCCHI DELLA STORIA - qui parte il tutorial',
    problemi.storia, ({ q, cattivi }) => {
      const b = BLOCCO.get(String(cattivi[0]));
      return `  ${String(q.mDefineId).padEnd(14)} "${pulisci(q.mQuestName).slice(0, 34)}"  -> ${b.land}/${b.mappa} ${b.luogo} (${b.nome})`;
    });

  mostra('3. REGOLA VIOLATA: blocchi inviati < max(mAreaNo) - il boss non compare',
    problemi.regola, (q) => {
      const aree = (q.mBossList || []).map((b) => parseInt(b && b.mAreaNo, 10)).filter((n) => !isNaN(n));
      const nb = (q.mBlocks || []).filter(Boolean).length;
      return `  ${String(q.mDefineId).padEnd(14)} blocchi=${nb} maxArea=${Math.max(...aree)}  "${pulisci(q.mQuestName).slice(0, 34)}"`;
    });

  mostra('4. QUEST SENZA RICOMPENSE - a fine caccia arrivano i premi di ripiego',
    problemi.premi, (q) => `  ${String(q.mDefineId).padEnd(14)} "${pulisci(q.mQuestName).slice(0, 44)}"`);

  mostra('5. BLOCCHI SCONOSCIUTI AL FOGLIO - impossibile sapere che mappa sia',
    problemi.ignoti, (q) => `  ${String(q.mDefineId).padEnd(14)} "${pulisci(q.mQuestName).slice(0, 44)}"`);

  // --- le quest delle collaborazioni ----------------------------------------
  console.log(`\n\n${'='.repeat(78)}\nCOLLABORAZIONI - stato attuale\n${'='.repeat(78)}`);
  const COLLAB = [
    ['Street Fighter', /真の格闘家|ストV|ストⅤ|SFV/],
    ['Fullmetal Alchemist', /ハガレン|業を背負いし鋼/],
    ['Demon Slayer', /鬼滅の刃|鬼狩り|鬼影/],
    ['Resident Evil', /バイオハザード|バイオコラボ/],
    ['Evangelion', /使徒|サードインパクト|号機/],
  ];
  for (const [nome, re] of COLLAB) {
    const hit = tutte.filter((q) => re.test(String(q.mQuestName || '')));
    console.log(`\n  --- ${nome}: ${hit.length} quest ---`);
    for (const q of hit.slice(0, 8)) {
      const b = (q.mBlocks || []).filter(Boolean).map((h) => BLOCCO.get(String(h))).filter(Boolean);
      const mappe = [...new Set(b.map((x) => `${x.land}/${x.mappa}`))].join(' ');
      const nomi = [...new Set(b.map((x) => x.nome))].slice(0, 2).join(' + ');
      console.log(`    ${String(q.mDefineId).padEnd(13)} "${pulisci(q.mQuestName).slice(0, 26).padEnd(26)}"`);
      console.log(`         mostro=${q.mMostro || 'NESSUNO'}  blocchi=[${mappe}] ${nomi.slice(0, 40)}`);
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

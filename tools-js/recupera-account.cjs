/*
 * Recupero account: la rete di sicurezza per chi perde il telefono.
 *
 * Il gioco non ha password: ti riconosce dal dispositivo (uu_id + secret_id
 * generati alla prima installazione). L'unico modo previsto per spostarsi su un
 * telefono nuovo e' il trasferimento (引き継ぎ): dal gioco imposti una password,
 * il server ti da' un codice di 8 caratteri, e con quei due dati riagganci il
 * personaggio altrove.
 *
 * Il problema: chi perde il telefono SENZA aver mai impostato il trasferimento
 * prima non ha nessun modo di recuperare, dal gioco. Non esiste "password
 * dimenticata", il server non ha mai saputo un'email.
 *
 * Ma il database ce l'hai tu. Questo strumento imposta il codice di
 * trasferimento a mano, anche a posteriori: il personaggio resta nel database,
 * quindi si puo' sempre restituire a chi l'ha perso.
 *
 * COME FUNZIONA IL RECUPERO, lato server (letto da services/accountService.ts):
 *   - /migration/auth cerca per transfer.migration_id + transfer.migration_pass
 *     e riscrive uu_id e secret_id con quelli del telefono nuovo.
 *   - La password e' confrontata IN CHIARO, nessun hash: quello che si scrive
 *     qui e' esattamente quello che il giocatore dovra' digitare.
 *   - La domanda segreta viene salvata ma NON verificata al recupero.
 *
 *   node recupera-account.cjs
 *       elenca tutti gli account e chi ha il trasferimento pronto
 *
 *   node recupera-account.cjs --utente=Heroic69
 *       mostra i dati di trasferimento di quell'account (senza toccare nulla)
 *
 *   node recupera-account.cjs --utente=Heroic69 --genera
 *       crea codice e password nuovi e li salva
 *
 *   node recupera-account.cjs --utente=Heroic69 --genera --pass=MIAPAROLA
 *       come sopra, ma con una password scelta da te
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const arg = (n, pred) => {
  const v = process.argv.find((a) => a.startsWith(`--${n}=`));
  return v === undefined ? pred : v.split('=').slice(1).join('=');
};
const UTENTE = arg('utente', null);
const PASS_SCELTA = arg('pass', null);
const GENERA = process.argv.includes('--genera');

/*
 * Stesso alfabeto e stessa lunghezza di generateToken() nel server
 * (services/accountService.ts): maiuscole e cifre, 8 caratteri. Usare un
 * formato diverso rischierebbe che il client non lo accetti in digitazione.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function codice(lunghezza = 8) {
  let t = '';
  for (let i = 0; i < lunghezza; i++) t += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return t;
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const filtro = UTENTE ? { character_name: UTENTE } : {};
  const elenco = await users.find(filtro).project({
    character_name: 1, login_id: 1, user_id: 1, game_id: 1, uu_id: 1,
    transfer: 1, 'box.equipments': 1, 'box.materials': 1, 'box.zeny': 1,
  }).toArray();

  if (!elenco.length) {
    console.error(UTENTE ? `Nessun account chiamato "${UTENTE}"` : 'Nessun account nel database');
    process.exit(1);
  }

  // --- solo elenco, nessun nome indicato ------------------------------------
  if (!UTENTE) {
    console.log('='.repeat(72));
    console.log('ACCOUNT NEL DATABASE');
    console.log('='.repeat(72));
    console.log('personaggio        game_id    trasferimento   equip  materiali');
    for (const u of elenco) {
      const t = u.transfer || {};
      const pronto = t.migration_id && t.migration_pass ? 'PRONTO' : 'NON IMPOSTATO';
      console.log(
        `${String(u.character_name || '(senza nome)').padEnd(18)} ` +
        `${String(u.game_id || '?').padEnd(10)} ${pronto.padEnd(15)} ` +
        `${String((u.box?.equipments || []).length).padStart(5)}  ` +
        `${String((u.box?.materials || []).length).padStart(9)}`,
      );
    }
    console.log('\nPer i dettagli di uno:  --utente=NOME');
    console.log('Per impostarne uno   :  --utente=NOME --genera');
    await mongoose.disconnect();
    return;
  }

  // --- un account specifico -------------------------------------------------
  const u = elenco[0];
  const t = u.transfer || {};

  console.log('='.repeat(72));
  console.log(`ACCOUNT: ${u.character_name || '(senza nome)'}`);
  console.log('='.repeat(72));
  console.log(`  game_id        : ${u.game_id || '?'}`);
  console.log(`  login_id       : ${u.login_id || '?'}`);
  console.log(`  equipaggiamenti: ${(u.box?.equipments || []).length}`);
  console.log(`  materiali      : ${(u.box?.materials || []).length} tipi`);
  console.log(`  zeny           : ${u.box?.zeny ?? 0}`);
  console.log('');
  console.log('  --- stato del trasferimento ---');
  if (t.migration_id && t.migration_pass) {
    console.log(`  codice   : ${t.migration_id}`);
    console.log(`  password : ${t.migration_pass}`);
    console.log('  -> gia\' impostato: con questi due dati si recupera su un altro telefono.');
  } else {
    console.log('  NON IMPOSTATO: se questo giocatore perde il telefono, dal gioco');
    console.log('  non ha nessun modo di recuperare. Serve --genera.');
  }

  if (!GENERA) {
    console.log('\n(nessuna modifica fatta. Aggiungi --genera per impostare il trasferimento)');
    await mongoose.disconnect();
    return;
  }

  // --- generazione ----------------------------------------------------------
  const nuovoCodice = codice(8);
  const nuovaPass = PASS_SCELTA || codice(8);

  /*
   * Si scrive solo dentro "transfer", campo per campo: mai sostituire l'intero
   * documento utente, che contiene personaggio e inventario. Un $set mirato non
   * puo' toccare nient'altro.
   */
  await users.updateOne({ _id: u._id }, {
    $set: {
      'transfer.migration_id': nuovoCodice,
      'transfer.migration_pass': nuovaPass,
      // La domanda segreta il server la salva ma non la verifica mai al
      // recupero: si valorizza per coerenza con cio' che farebbe il gioco.
      'transfer.mst_himitsu_question_id': Number(t.mst_himitsu_question_id) || 1,
      'transfer.himitsu_answer': t.himitsu_answer || 'recupero',
    },
  });

  const dopo = await users.findOne({ _id: u._id }, { projection: { transfer: 1 } });

  console.log('\n' + '='.repeat(72));
  console.log('TRASFERIMENTO IMPOSTATO');
  console.log('='.repeat(72));
  console.log(`  codice   : ${dopo.transfer.migration_id}`);
  console.log(`  password : ${dopo.transfer.migration_pass}`);
  console.log('');
  console.log('  Annota questi due dati FUORI dal telefono.');
  console.log('  Sul dispositivo nuovo: nel gioco scegli il trasferimento account,');
  console.log('  inserisci codice e password, e il personaggio torna con tutto.');

  if (String(dopo.transfer.migration_id) !== nuovoCodice) {
    console.error('\nATTENZIONE: il valore riletto non combacia, la scrittura non e\' andata a buon fine.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

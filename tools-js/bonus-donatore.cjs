/*
 * Bonus 狩玉 per un giocatore: +N% sulle gemme di fine missione.
 *
 * Il server lo applica in quest/island/end (services/karidamaService.ts,
 * karidamaConBonus). Con 3 gemme a missione i decimali si accumulano: con +10%
 * arriva una gemma in piu' ogni 10 missioni, con +30% ogni 3-4 missioni.
 * Vale dalla prossima missione, non serve riavviare niente.
 *
 *   node /app/tools/bonus-donatore.cjs --elenco
 *       chi ha un bonus
 *
 *   node /app/tools/bonus-donatore.cjs --utente=Configur --percento=20
 *       mette il bonus (da 0 a 100; 0 lo toglie)
 *
 *   node /app/tools/bonus-donatore.cjs --utente=Configur
 *       mostra il bonus di quel giocatore senza cambiare niente
 *
 * Il nome e' il nome del personaggio, maiuscole comprese (come nei log).
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const arg = (n) => {
  const v = process.argv.find((a) => a.startsWith(`--${n}=`));
  return v === undefined ? null : v.split('=').slice(1).join('=');
};
const UTENTE = arg('utente');
const PERCENTO = arg('percento');
const ELENCO = process.argv.includes('--elenco');
const MASSIMO = 100;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');
  try {
    if (ELENCO) {
      const lista = await users.find({ bonus_karidama: { $gt: 0 } }, { projection: { character_name: 1, bonus_karidama: 1 } }).toArray();
      if (!lista.length) console.log('Nessun giocatore ha un bonus.');
      for (const u of lista) console.log(`${u.character_name}: +${u.bonus_karidama}%`);
      return;
    }
    if (!UTENTE) {
      console.log('Uso: --elenco   oppure   --utente=NOME [--percento=0..100]');
      process.exitCode = 1;
      return;
    }
    const u = await users.findOne({ character_name: UTENTE }, { projection: { character_name: 1, bonus_karidama: 1 } });
    if (!u) {
      console.log(`Nessun personaggio si chiama "${UTENTE}" (controlla maiuscole e minuscole).`);
      process.exitCode = 1;
      return;
    }
    if (PERCENTO === null) {
      console.log(`${u.character_name}: bonus attuale +${u.bonus_karidama || 0}%`);
      return;
    }
    const p = Number(PERCENTO);
    if (!Number.isInteger(p) || p < 0 || p > MASSIMO) {
      console.log(`--percento deve essere un numero intero da 0 a ${MASSIMO}.`);
      process.exitCode = 1;
      return;
    }
    await users.updateOne({ _id: u._id }, { $set: { bonus_karidama: p } });
    console.log(p === 0
      ? `${u.character_name}: bonus tolto (era +${u.bonus_karidama || 0}%).`
      : `${u.character_name}: bonus impostato a +${p}% (era +${u.bonus_karidama || 0}%). Vale dalla prossima missione.`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });

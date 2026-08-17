/*
 * EMERGENZA: toglie dalla box l'equipaggiamento creato dal gacha.
 *
 * Il login carica box.equipments, e un pezzo con campi mancanti fa crashare il
 * client prima ancora di entrare. Finche' resta nel database il crash si
 * ripete a ogni tentativo, percio' va rimosso da qui.
 *
 * Riconosce i pezzi generati dal gacha dall'equipment_id: quelli veri sono
 * "WD_SWORD001", "OD_OMA1390" (un underscore), i miei "WD_SWORD001_19" —
 * nome piu' progressivo, quindi DUE underscore e cifre finali. Il confronto e'
 * volutamente restrittivo: meglio lasciarne uno che cancellare roba tua.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/ripara-box.cjs --dry
 *   ... senza --dry per rimuovere
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

// nome_progressivo: due underscore e cifre in fondo
const DA_GACHA = /^(WD|AD|OD)_[A-Za-z0-9]+_\d+$/;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const tutti = await users.find({}).project({
    character_name: 1, 'box.equipments': 1, 'box.materials': 1, 'box.payments': 1,
  }).toArray();

  console.log(`utenti: ${tutti.length}\n`);

  for (const u of tutti) {
    const eq = (u.box && u.box.equipments) || [];
    const sospetti = eq.filter((e) => e && DA_GACHA.test(String(e.equipment_id || '')));

    console.log(`--- ${u.character_name || '(senza nome)'} ---`);
    console.log(`  equipaggiamenti totali : ${eq.length}`);
    console.log(`  creati dal gacha       : ${sospetti.length}`);

    if (sospetti.length) {
      sospetti.slice(0, 10).forEach((e) => {
        const campi = Object.keys(e).filter((k) => k !== '_id').length;
        console.log(`      ${String(e.equipment_id).padEnd(20)} mst=${e.mst_equipment_id}  campi=${campi}`);
      });
      if (sospetti.length > 10) console.log(`      ... altri ${sospetti.length - 10}`);
    }

    // Le valute e i materiali NON si toccano: sono id validi, non fanno danno.
    const pag = (u.box && u.box.payments) || [];
    console.log(`  valute in box.payments :`);
    pag.forEach((p) => console.log(`      mst_payment_id=${p.mst_payment_id}  amount=${p.amount}`));

    if (!DRY && sospetti.length) {
      const puliti = eq.filter((e) => !(e && DA_GACHA.test(String(e.equipment_id || ''))));
      await users.updateOne({ _id: u._id }, { $set: { 'box.equipments': puliti } });
      console.log(`  RIMOSSI ${sospetti.length}, restano ${puliti.length}`);
    }
    console.log('');
  }

  if (DRY) console.log('--dry: niente rimosso');

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

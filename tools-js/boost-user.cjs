/*
 * Potenzia il personaggio per poter provare le quest degli eventi.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/boost-user.js --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/boost-user.js
 *
 * PRINCIPIO: non invento oggetti nuovi. Gli id equipaggiamento sono hash
 * (crc32 del nome XOR una costante, vedi services/defineService.ts) e non esiste
 * da nessuna parte un elenco di quelli validi: inventarsi "AD_ARM999" darebbe
 * caselle vuote o un crash. Quindi POTENZIO quello che il personaggio ha gia',
 * che per definizione esiste nel gioco.
 *
 * L'unica eccezione sono le gemme: l'id 1573159746 lo usa il server stesso
 * quando crea un account (account.controller.ts), quindi e' garantito valido.
 */
const mongoose = require('mongoose');

const CONFIG = {
  hr: 500,            // livello cacciatore (box.monument.hr)
  mlv: 50,            // potenziamenti monumento: atk, def, hp, sp
  zeny: 99999999,     // soldi
  karidama: 99999,    // gemme
  augite: 9999,       // pietre per il monumento

  // Valori per l'equipaggiamento. Il tetto vero non e' documentato da nessuna
  // parte nel server: sono tenuti alti ma non assurdi, per non rischiare che il
  // client vada in overflow. Se il gioco li accetta si possono alzare e rilanciare.
  elv: 50,            // livello equipaggiamento
  slv: 10,            // livello arti marziali
  potential: 5,       // potenziale / tecnica segreta
};

const MST_PAYMENT_KARIDAMA = 1573159746;

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const u = await users.findOne({});
  if (!u) { console.log('nessun utente nel database'); process.exit(1); }

  console.log(`personaggio: ${u.character_name}  (game_id ${u.game_id})`);
  console.log('--- prima ---');
  console.log(`  HR            : ${u.box?.monument?.hr}`);
  console.log(`  monumento mlv : ${JSON.stringify(u.box?.monument?.mlv)}`);
  console.log(`  zeny          : ${u.box?.zeny}`);
  console.log(`  gemme         : ${(u.box?.payments || []).reduce((t, p) => t + (p.amount || 0), 0)}`);
  console.log(`  equipaggiamenti: ${(u.box?.equipments || []).length}`);

  // Potenzio ogni pezzo. Armi e armature usano elv/slv/potential; i talismani
  // (prefisso OD_) usano invece il risveglio, quindi vanno trattati a parte.
  const equipments = (u.box?.equipments || []).map((e) => {
    const talismano = String(e.equipment_id || '').startsWith('OD_');
    if (talismano) {
      return { ...e, awaked: 1, is_awake: 1, endAwakeCount: 0, endAwakeRemain: 0, end_remain: 0 };
    }
    return {
      ...e,
      elv: CONFIG.elv,
      slv: CONFIG.slv,
      potential: CONFIG.potential,
      is_complete_auto_potential_composite: 1,
    };
  });

  const armi = equipments.filter((e) => String(e.equipment_id).startsWith('WD_'));
  const armature = equipments.filter((e) => String(e.equipment_id).startsWith('AD_'));
  const talismani = equipments.filter((e) => String(e.equipment_id).startsWith('OD_'));
  console.log(`     di cui: ${armi.length} armi, ${armature.length} armature, ${talismani.length} talismani`);

  const augite = (u.box?.monument?.augite || []).map((a) => ({ ...a, amount: CONFIG.augite }));

  const update = {
    $set: {
      'box.monument.hr': CONFIG.hr,
      'box.monument.mlv': { atk: CONFIG.mlv, def: CONFIG.mlv, hp: CONFIG.mlv, sp: CONFIG.mlv },
      'box.monument.augite': augite,
      'box.zeny': CONFIG.zeny,
      'box.payments': [{ amount: CONFIG.karidama, mst_payment_id: MST_PAYMENT_KARIDAMA }],
      'box.equipments': equipments,
      'box.capacity.eqp_box': 500,
      'box.capacity.eqp_set': 100,
    },
  };

  console.log('\n--- dopo ---');
  console.log(`  HR            : ${CONFIG.hr}`);
  console.log(`  monumento mlv : atk/def/hp/sp = ${CONFIG.mlv}`);
  console.log(`  zeny          : ${CONFIG.zeny}`);
  console.log(`  gemme         : ${CONFIG.karidama}`);
  console.log(`  armi/armature : elv=${CONFIG.elv} slv=${CONFIG.slv} potential=${CONFIG.potential}`);
  console.log(`  talismani     : risvegliati`);

  if (DRY) {
    console.log('\n[dry] nessuna scrittura.');
  } else {
    const r = await users.updateOne({ _id: u._id }, update);
    console.log(`\nscritto: matched=${r.matchedCount} modified=${r.modifiedCount}`);
    console.log('Chiudi COMPLETAMENTE il gioco e riaprilo: i dati del personaggio');
    console.log('vengono letti al login, non aggiornati a caldo.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

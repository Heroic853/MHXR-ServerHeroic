/*
 * Elenca l'equipaggiamento e, se richiesto, lo porta al massimo.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/max-equipment.cjs
 *       (solo elenco, non tocca niente)
 *   ... --max=WD_AXE103        porta al massimo quel pezzo
 *   ... --max-all-weapons      tutte le armi
 *   ... --max-all              tutto (armi, armature, talismani)
 *
 * I valori sono quelli piu' alti che compaiono nei dati originali del gioco
 * (vedi i dump nei controller: potential arriva a 222, slv a 3-4, elv a 5+).
 * Il tetto vero non e' documentato: se il gioco mostra numeri strani o li
 * tronca, si abbassano qui e si rilancia.
 */
const mongoose = require('mongoose');

const MAX = {
  elv: 99,        // livello equipaggiamento
  slv: 10,        // livello arti marziali
  potential: 222, // valore piu' alto visto nei dump originali
};

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const argv = process.argv.slice(2);
const TARGET = (argv.find((a) => a.startsWith('--max=')) || '').split('=')[1];
const ALL_WEAPONS = argv.includes('--max-all-weapons');
const ALL = argv.includes('--max-all');

function tipo(id) {
  const s = String(id);
  if (s.startsWith('WD_')) return 'arma';
  if (s.startsWith('AD_')) return 'armatura';
  if (s.startsWith('OD_')) return 'talismano';
  return 'altro';
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');
  const u = await users.findOne({});
  if (!u) { console.log('nessun utente'); process.exit(1); }

  const eq = u.box?.equipments || [];
  console.log(`personaggio: ${u.character_name}   equipaggiamenti: ${eq.length}\n`);
  console.log('  tipo        equipment_id        elv  slv  pot  risvegliato');
  console.log('  ' + '-'.repeat(62));
  for (const e of eq) {
    console.log(
      '  ' + tipo(e.equipment_id).padEnd(11) +
      String(e.equipment_id).padEnd(20) +
      String(e.elv ?? 0).padStart(3) +
      String(e.slv ?? 0).padStart(5) +
      String(e.potential ?? 0).padStart(5) +
      String(e.is_awake ? '  si' : '  no').padStart(6)
    );
  }

  const daModificare = eq.filter((e) => {
    if (ALL) return true;
    if (ALL_WEAPONS) return tipo(e.equipment_id) === 'arma';
    if (TARGET) return String(e.equipment_id) === TARGET;
    return false;
  });

  if (!daModificare.length) {
    console.log('\n(nessuna modifica richiesta: usa --max=ID, --max-all-weapons o --max-all)');
    await mongoose.disconnect();
    return;
  }

  const aggiornati = eq.map((e) => {
    if (!daModificare.includes(e)) return e;
    if (tipo(e.equipment_id) === 'talismano') {
      return { ...e, awaked: 1, is_awake: 1 };
    }
    return {
      ...e,
      elv: MAX.elv,
      slv: MAX.slv,
      potential: MAX.potential,
      is_complete_auto_potential_composite: 1,
    };
  });

  await users.updateOne({ _id: u._id }, { $set: { 'box.equipments': aggiornati } });

  console.log(`\nportati al massimo ${daModificare.length} pezzi (elv=${MAX.elv} slv=${MAX.slv} potential=${MAX.potential}):`);
  for (const e of daModificare) console.log(`  ${e.equipment_id}`);
  console.log('\nChiudi COMPLETAMENTE il gioco e riaprilo.');

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

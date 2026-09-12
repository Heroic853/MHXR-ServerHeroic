/*
 * Regala equipaggiamento leggendario a un account GIA' ESISTENTE.
 *
 * PERCHE' SERVE: DEFAULT_EQUIPMENT (src/json/user-defaults.json) e' un
 * "default" di schema Mongoose - si applica SOLO quando viene creato un
 * documento utente nuovo. Un personaggio gia' esistente (es. Heroic69) non
 * lo ricevera' mai da solo, per quanti rebuild del server si facciano.
 * Questo script fa la stessa cosa ma a mano, su un account che esiste gia'.
 *
 * Usa solo pezzi presenti in tools-js/equipaggiamenti.json (19.956 voci
 * verificate 18/18 contro id noti dal gioco): nessun id inventato, stessa
 * regola di sempre.
 *
 *   node regala-equip.cjs --utente=Heroic69
 *       regala 2 armi + un'armatura completa (5 pezzi) di rarita' 8
 *
 *   node regala-equip.cjs --utente=Heroic69 --dry
 *       mostra solo cosa verrebbe regalato, nessuna scrittura
 *
 *   node regala-equip.cjs --utente=Heroic69 --armi=3 --rarita=7 --niente-armatura
 *       personalizza quantita' di armi, rarita', e salta l'armatura
 */
const fs = require('fs');
const path = require('path');
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
const DRY = process.argv.includes('--dry');
const N_ARMI = Number(arg('armi', 2));
const RARITA = Number(arg('rarita', 8));
const NIENTE_ARMATURA = process.argv.includes('--niente-armatura');

if (!UTENTE) {
  console.error('Serve --utente=NOME');
  process.exit(1);
}

const equip = JSON.parse(fs.readFileSync(
  fs.existsSync(path.join(__dirname, 'equipaggiamenti.json'))
    ? path.join(__dirname, 'equipaggiamenti.json')
    : '/app/tools/equipaggiamenti.json',
  'utf8',
));

const CATEGORIE_ARMI = [
  'sword', 'lsword', 'lsword2', 'wsword', 'axe', 'chaxe', 'acaxe', 'hammer',
  'lance', 'gunlance', 'bow', 'lbowgun', 'hbowgun', 'pipe', 'stick', 'kariwaza',
];
const CATEGORIE_ARMATURA = ['head', 'body', 'arm', 'waist', 'leg'];

function scegliUno(categoria, rarita, gia_scelti) {
  const pool = equip.filter((e) => e.categoria === categoria && e.rarita === rarita
    && !gia_scelti.has(e.nome));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Costruisce l'oggetto equipaggiamento nella forma esatta richiesta dallo
 * schema (16 campi, vedi src/model/items/equipment.ts) — stessa struttura
 * usata da DEFAULT_EQUIPMENT in user-defaults.json. */
function pezzo(voce) {
  return {
    auto_potential_composite: 0,
    awaked: 0,
    created: 0,
    elv: 0,
    endAwakeCount: 0,
    endAwakeRemain: 0,
    end_remain: 0,
    equipment_id: voce.nome,
    evolve_start_time: 0,
    favorite: 0,
    is_awake: 0,
    is_complete_auto_potential_composite: 0,
    mst_equipment_id: voce.id,
    potential: 0,
    slv: 0,
    start_remain: 0,
  };
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const doc = await users.findOne({ character_name: UTENTE }, { projection: { character_name: 1, 'box.equipments': 1 } });
  if (!doc) {
    console.error(`Nessun account chiamato "${UTENTE}"`);
    process.exit(1);
  }

  const possieduti = new Set((doc.box?.equipments || []).map((e) => Number(e.mst_equipment_id)));
  const scelti = new Set();
  const daRegalare = [];

  // --- armi: N categorie diverse, a caso tra quelle non ancora possedute ---
  const categorieArmiDisponibili = [...CATEGORIE_ARMI].sort(() => Math.random() - 0.5);
  for (const cat of categorieArmiDisponibili) {
    if (daRegalare.filter((v) => CATEGORIE_ARMI.includes(v.categoria)).length >= N_ARMI) break;
    const voce = scegliUno(cat, RARITA, scelti);
    if (voce && !possieduti.has(voce.id)) { daRegalare.push(voce); scelti.add(voce.nome); }
  }

  // --- armatura completa: un pezzo per ciascuno dei 5 slot ---
  if (!NIENTE_ARMATURA) {
    for (const cat of CATEGORIE_ARMATURA) {
      const voce = scegliUno(cat, RARITA, scelti);
      if (voce && !possieduti.has(voce.id)) { daRegalare.push(voce); scelti.add(voce.nome); }
    }
  }

  if (!daRegalare.length) {
    console.log('Niente da regalare: possiede gia\' tutto quello che si poteva scegliere a quella rarita\'.');
    await mongoose.disconnect();
    return;
  }

  console.log('='.repeat(72));
  console.log(`${DRY ? '[anteprima] ' : ''}Equipaggiamento da regalare a ${doc.character_name} (rarita' ${RARITA})`);
  console.log('='.repeat(72));
  for (const v of daRegalare) {
    console.log(`  ${v.categoria.padEnd(9)} R${v.rarita}  ${v.nome.padEnd(16)} ${v.nomeJp || ''}`);
  }

  if (DRY) {
    console.log('\n(nessuna scrittura fatta, e\' solo un\'anteprima)');
    await mongoose.disconnect();
    return;
  }

  const nuoviPezzi = daRegalare.map(pezzo);
  await users.updateOne(
    { _id: doc._id },
    { $push: { 'box.equipments': { $each: nuoviPezzi } } },
  );

  const dopo = await users.findOne({ _id: doc._id }, { projection: { 'box.equipments': 1 } });
  const idsPresenti = new Set((dopo.box?.equipments || []).map((e) => e.equipment_id));
  const mancanti = nuoviPezzi.filter((p) => !idsPresenti.has(p.equipment_id));

  console.log(`\n${nuoviPezzi.length - mancanti.length}/${nuoviPezzi.length} pezzi scritti e riletti correttamente.`);
  if (mancanti.length) {
    console.error('ATTENZIONE: alcuni pezzi non risultano dopo la scrittura:', mancanti.map((p) => p.equipment_id));
    process.exitCode = 1;
  } else {
    console.log('Fatto. Riapri il gioco (o esci e rientra dal box) per vederli in inventario.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

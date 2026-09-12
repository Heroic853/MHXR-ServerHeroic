/*
 * Mette armi e armature nella box del giocatore, per poter scegliere
 * liberamente l'equipaggiamento e provare il potenziamento.
 *
 * Il potenziamento lato server c'e' gia' e funziona: box.controller.ts
 * implementa /equipment/levelup, /awake, /potentialup/auto/set. Quello che
 * mancava era avere dei pezzi VALIDI nella box da cui scegliere.
 *
 * Gli id vengono da equipaggiamenti.json, costruito da costruisci-equip.cjs
 * dagli archivi del gioco e verificato su 18 id certi (18/18). La forma
 * dell'oggetto e' copiata da DEFAULT_EQUIPMENT in src/json/user-defaults.json,
 * cioe' dal set iniziale che il client accetta: 16 campi, non 15.
 *
 * ATTENZIONE, lezione dal gacha: un pezzo con un campo in meno o con un
 * mst_equipment_id inesistente resta nel database e fa crashare il LOGIN a
 * ogni tentativo, perche' /api/box/get lo rimanda al client ogni volta. Per
 * questo qui si usano solo id verificati e la forma completa, e c'e' --undo.
 *
 *   node dai-equipaggiamento.cjs --dry
 *   node dai-equipaggiamento.cjs --utente=Heroic69
 *   node dai-equipaggiamento.cjs --utente=Heroic69 --per-tipo=10 --elv=50 --slv=10
 *   node dai-equipaggiamento.cjs --utente=Heroic69 --undo
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const arg = (nome, pred) => {
  const v = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return v === undefined ? pred : v.split('=').slice(1).join('=');
};
const DRY = process.argv.includes('--dry');
const UNDO = process.argv.includes('--undo');
const UTENTE = arg('utente', null);
const PER_TIPO = Number(arg('per-tipo', 5));
const ELV = Number(arg('elv', 1));
const SLV = Number(arg('slv', 1));
const POT = Number(arg('potential', 0));
// Rarita' minima. Le tabelle *_series del gioco vanno da 1 a 8: con --rarita=8
// si prendono solo le leggendarie (779 pezzi in tutto).
const RARITA = Number(arg('rarita', 0));

// kariwaza sono le arti di caccia (mosse), non equipaggiamento: non vanno in box.
const NON_EQUIPAGGIAMENTO = new Set(['kariwaza']);

/** La forma che il client accetta: 16 campi, come DEFAULT_EQUIPMENT. */
function costruisci(voce) {
  return {
    auto_potential_composite: 0,
    awaked: 0,
    created: Math.floor(Date.now() / 1000),
    elv: ELV,
    endAwakeCount: 0,
    endAwakeRemain: 0,
    end_remain: 0,
    // Nei default del gioco equipment_id e' il nome nudo ("AD_ARM006"): qui si
    // da' un pezzo solo per tipo, quindi il nome basta ed e' univoco.
    equipment_id: voce.nome,
    evolve_start_time: 0,
    favorite: 0,
    is_awake: 0,
    is_complete_auto_potential_composite: 0,
    mst_equipment_id: voce.id,
    potential: POT,
    slv: SLV,
    start_remain: 0,
  };
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const filtro = UTENTE ? { character_name: UTENTE } : {};
  const elenco = await users.find(filtro)
    .project({ character_name: 1, 'box.equipments': 1, 'box.capacity': 1, boxEquipPrima: 1 })
    .toArray();

  if (!elenco.length) {
    console.error(UTENTE ? `Nessun utente chiamato "${UTENTE}"` : 'Nessun utente nel database');
    process.exit(1);
  }

  if (UNDO) {
    for (const u of elenco) {
      if (!u.boxEquipPrima) {
        console.log(`${u.character_name}: nessuno stato salvato, salto`);
        continue;
      }
      console.log(`${u.character_name}: ripristino ${u.boxEquipPrima.length} pezzi (ora ne ha ${(u.box?.equipments || []).length})`);
      if (!DRY) {
        await users.updateOne({ _id: u._id }, {
          $set: { 'box.equipments': u.boxEquipPrima },
          $unset: { boxEquipPrima: '' },
        });
      }
    }
    await mongoose.disconnect();
    return;
  }

  const tutti = JSON.parse(fs.readFileSync(path.join(__dirname, 'equipaggiamenti.json'), 'utf8'));

  // Selezione distribuita: invece dei primi N per categoria si prendono N pezzi
  // sparsi su tutto l'intervallo, cosi' arrivano sia i deboli sia i forti e si
  // puo' davvero provare il potenziamento su livelli diversi.
  const perCat = new Map();
  let senzaRarita = 0;
  let segnaposto = 0;
  for (const e of tutti) {
    if (NON_EQUIPAGGIAMENTO.has(e.categoria)) continue;
    // Nei dati del gioco alcune righe si chiamano "dummy": sono buchi lasciati
    // dagli sviluppatori, hanno un id valido ma non sono oggetti veri. Darli al
    // giocatore produrrebbe un pezzo senza nome ne' modello.
    if (e.nomeJp !== undefined && (e.nomeJp === '' || /^dummy$/i.test(e.nomeJp))) {
      segnaposto++;
      continue;
    }
    if (RARITA > 0) {
      // Chi non ha rarita' nota viene escluso quando la si richiede: meglio
      // dare meno pezzi che dare pezzi di cui non sappiamo il valore.
      if (e.rarita === undefined) { senzaRarita++; continue; }
      if (e.rarita < RARITA) continue;
    }
    if (!perCat.has(e.categoria)) perCat.set(e.categoria, []);
    perCat.get(e.categoria).push(e);
  }
  console.log(`segnaposto esclusi : ${segnaposto}`);
  if (RARITA > 0) {
    console.log(`filtro rarita'     : >= ${RARITA}  (esclusi ${senzaRarita} senza rarita' nota)`);
  }

  const scelti = [];
  for (const [cat, lista] of perCat) {
    const quanti = Math.min(PER_TIPO, lista.length);
    const passo = lista.length / quanti;
    for (let i = 0; i < quanti; i++) {
      scelti.push(lista[Math.min(lista.length - 1, Math.floor(i * passo))]);
    }
  }

  console.log(`categorie          : ${perCat.size}`);
  console.log(`pezzi per categoria: ${PER_TIPO}`);
  console.log(`pezzi selezionati  : ${scelti.length}`);
  console.log(`livelli            : elv=${ELV} slv=${SLV} potential=${POT}\n`);

  for (const u of elenco) {
    const esistenti = (u.box && u.box.equipments) || [];
    const giaPresenti = new Set(esistenti.map((e) => String(e.equipment_id)));

    // Non si tocca quello che il giocatore ha gia': si aggiunge solo il nuovo.
    const daAggiungere = scelti.filter((v) => !giaPresenti.has(v.nome)).map(costruisci);
    const finale = [...esistenti, ...daAggiungere];

    const capacitaOra = (u.box && u.box.capacity && u.box.capacity.eqp_box) || 100;
    const capacitaNuova = Math.max(capacitaOra, finale.length + 50);

    console.log(`--- ${u.character_name || '(senza nome)'} ---`);
    console.log(`  ha gia'   : ${esistenti.length} pezzi`);
    console.log(`  aggiungo  : ${daAggiungere.length}`);
    console.log(`  totale    : ${finale.length}`);
    console.log(`  capacita' : ${capacitaOra} -> ${capacitaNuova}`);
    if (daAggiungere.length) {
      console.log('  pezzi     :');
      const info = new Map(scelti.map((v) => [v.nome, v]));
      for (const e of daAggiungere) {
        const v = info.get(e.equipment_id) || {};
        const rar = v.rarita === undefined ? '?' : v.rarita;
        console.log(`      ${e.equipment_id.padEnd(18)} R${String(rar).padEnd(2)} ${String(v.categoria || '').padEnd(9)} ${v.nomeJp || ''}`);
      }
    }

    if (!DRY && daAggiungere.length) {
      await users.updateOne({ _id: u._id }, {
        $set: {
          'box.equipments': finale,
          'box.capacity.eqp_box': capacitaNuova,
          // Salvato una volta sola: cosi' --undo riporta alla situazione
          // precedente al primo passaggio, non a quella intermedia.
          ...(u.boxEquipPrima ? {} : { boxEquipPrima: esistenti }),
        },
      });
      console.log('  scritto.');
    }
    console.log('');
  }

  if (DRY) console.log('--dry: niente scritto');

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

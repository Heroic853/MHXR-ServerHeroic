/*
 * Popola le collection eventi rimaste vuote: tourevents, m16events, standingevents.
 *
 *   docker compose -f docker-compose.test.yml exec -T server-new node /app/tools/seed-events.cjs --dry
 *   ... --only=tour      un solo gruppo
 *   ... --wipe           svuota prima di riempire
 *
 * IDEMPOTENTE: upsert su mst_event_node_id, quindi si puo' rilanciare per
 * correggere gli id banner senza duplicare nulla.
 *
 * Rispetto alla versione per il vecchio server, qui NON importo i modelli
 * compilati: il progetto nuovo e' ESM e un require() su /app/dist/model/... non
 * funziona. Uso il driver Mongo grezzo sui nomi di collection, che sono identici
 * nelle due versioni e non dipendono da come e' compilato il server.
 */
const path = require('path');
const mongoose = require('mongoose');

const nodes = require('/app/dist/json/event_nodes.json');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const GIORNI = 3650;
const ORA = Date.now();
const FINE = ORA + GIORNI * 24 * 60 * 60 * 1000;

const GRUPPI = {
  tour: {
    prefisso: 'tour', collection: 'tourevents',
    big: 90005, middle: 90035, schedule_category: 'tour',
  },
  standing: {
    prefisso: 'kako', collection: 'standingevents',
    big: 90006, middle: 90036, schedule_category: 'standing',
  },
  m16: {
    prefisso: 'gild', collection: 'm16events',
    big: 90037, middle: 90037, m16: true,
  },
};

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const WIPE = argv.includes('--wipe');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

function documentiPerGruppo(g) {
  return nodes
    .filter((n) => String(n.mBannerPath || '').split('_')[0] === g.prefisso)
    .map((n) => {
      const base = {
        mst_event_node_id: parseInt(n.mEventNodeHash, 10),
        big_node_banner_id: g.big,
        middle_node_banner_id: g.middle,
        state: 1,
        start_remain: new Date(ORA),
        end_remain: new Date(FINE),
      };
      if (g.schedule_category !== undefined) base.schedule_category = g.schedule_category;
      if (g.m16) {
        base.appear_remain = new Date(ORA);
        base.disappear_remain = new Date(FINE);
        base.recommended_flag = 0;
        base.metamorphoze_type = 0;
      }
      return base;
    });
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log(`connesso a ${DB_NAME}\n`);

  for (const [nome, g] of Object.entries(GRUPPI)) {
    if (ONLY && ONLY !== nome) continue;

    const coll = db.collection(g.collection);
    const docs = documentiPerGruppo(g);
    const prima = await coll.countDocuments({});

    console.log(`--- ${nome}  (prefisso "${g.prefisso}_", big=${g.big} middle=${g.middle}) ---`);
    console.log(`    nodi in event_nodes.json    : ${docs.length}`);
    console.log(`    documenti gia' presenti     : ${prima}`);
    if (!docs.length) { console.log('    nessun nodo, salto.\n'); continue; }

    const quest = docs.reduce((tot, d) => {
      const n = nodes.find((x) => parseInt(x.mEventNodeHash, 10) === d.mst_event_node_id);
      return tot + ((n && n.mEventQuestList) || []).length;
    }, 0);
    console.log(`    quest che verranno collegate: ${quest}`);

    if (DRY) {
      console.log('    [dry] esempio:', JSON.stringify(docs[0]));
      console.log('    [dry] nessuna scrittura.\n');
      continue;
    }
    if (WIPE) {
      const del = await coll.deleteMany({});
      console.log(`    svuotata: ${del.deletedCount} rimossi`);
    }

    const ops = docs.map((d) => ({
      updateOne: {
        filter: { mst_event_node_id: d.mst_event_node_id },
        update: { $set: d },
        upsert: true,
      },
    }));
    const r = await coll.bulkWrite(ops);
    console.log(`    inseriti=${r.upsertedCount} aggiornati=${r.modifiedCount}  ->  totale: ${await coll.countDocuments({})}\n`);
  }

  await mongoose.disconnect();
  console.log('fatto.');
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

/*
 * Mette materiali nell'inventario del giocatore.
 *
 * Gli id vengono da src/json/materiali.json, costruito da
 * costruisci-materiali.cjs dal foglio degli oggetti del gioco: 4878 materiali
 * con nome, rarita' e mostro di provenienza. Nessun id inventato — e' la stessa
 * tabella che il server usa per filtrare le ricompense delle quest.
 *
 * Perche' conta: box.materials viene rimandato al client a ogni login. Un id
 * che non e' un materiale vero blocca l'ingresso in modo permanente, e per
 * uscirne bisogna intervenire sul database. E' successo col gacha (id
 * 1277724242). Qui non puo' succedere, perche' si pesca solo da quella tabella.
 *
 *   node dai-materiali.cjs --dry
 *   node dai-materiali.cjs --utente=Heroic69 --rarita=8 --quanti=20
 *   node dai-materiali.cjs --utente=Heroic69 --tutti --quanti=10
 *   node dai-materiali.cjs --utente=Heroic69 --undo
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
const TUTTI = process.argv.includes('--tutti');
const UTENTE = arg('utente', null);
const RARITA = Number(arg('rarita', 0));
const QUANTI = Number(arg('quanti', 10));
const PER_RARITA = Number(arg('per-rarita', 0)); // quanti tipi diversi per rarita'

/*
 * La tabella sta in src/json perche' la importa anche il server. Nel container
 * il percorso e' /app/dist/json (il Dockerfile copia src/json la' dentro),
 * mentre eseguendo dal progetto e' ../src/json: si provano entrambi.
 */
function caricaMateriali() {
  const candidati = [
    path.join(__dirname, '..', 'src', 'json', 'materiali.json'),
    '/app/dist/json/materiali.json',
    path.join(__dirname, 'materiali.json'),
  ];
  for (const p of candidati) {
    if (fs.existsSync(p)) return { dati: JSON.parse(fs.readFileSync(p, 'utf8')), da: p };
  }
  throw new Error(`materiali.json non trovato. Cercato in:\n  ${candidati.join('\n  ')}`);
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const filtro = UTENTE ? { character_name: UTENTE } : {};
  const elenco = await users.find(filtro)
    .project({ character_name: 1, 'box.materials': 1, boxMatPrima: 1 })
    .toArray();

  if (!elenco.length) {
    console.error(UTENTE ? `Nessun utente chiamato "${UTENTE}"` : 'Nessun utente nel database');
    process.exit(1);
  }

  if (UNDO) {
    for (const u of elenco) {
      if (!u.boxMatPrima) {
        console.log(`${u.character_name}: nessuno stato salvato, salto`);
        continue;
      }
      console.log(`${u.character_name}: ripristino ${u.boxMatPrima.length} voci (ora ne ha ${(u.box?.materials || []).length})`);
      if (!DRY) {
        await users.updateOne({ _id: u._id }, {
          $set: { 'box.materials': u.boxMatPrima },
          $unset: { boxMatPrima: '' },
        });
      }
    }
    await mongoose.disconnect();
    return;
  }

  const { dati: materiali, da } = caricaMateriali();
  console.log(`tabella           : ${da}`);
  console.log(`materiali noti    : ${materiali.length}`);

  let scelti = materiali.filter((m) => m.nome && !/^dummy$/i.test(m.nome));
  if (RARITA > 0) scelti = scelti.filter((m) => m.rarita >= RARITA);

  if (!TUTTI && !RARITA) {
    console.error('\nServe --rarita=N oppure --tutti: senza uno dei due non so cosa darti.');
    console.error('Esempi:  --rarita=8 (solo i piu\' rari)   --rarita=6   --tutti');
    process.exit(1);
  }

  // Con --per-rarita si prende un campione distribuito invece di tutti: utile
  // per provare senza riempire l'inventario di migliaia di voci.
  if (PER_RARITA > 0) {
    const perRar = new Map();
    for (const m of scelti) {
      if (!perRar.has(m.rarita)) perRar.set(m.rarita, []);
      perRar.get(m.rarita).push(m);
    }
    const campione = [];
    for (const [, lista] of perRar) {
      const q = Math.min(PER_RARITA, lista.length);
      const passo = lista.length / q;
      for (let i = 0; i < q; i++) campione.push(lista[Math.min(lista.length - 1, Math.floor(i * passo))]);
    }
    scelti = campione;
  }

  console.log(`filtro rarita'    : ${RARITA > 0 ? '>= ' + RARITA : 'nessuno (tutti)'}`);
  console.log(`tipi selezionati  : ${scelti.length}`);
  console.log(`quantita' per tipo: ${QUANTI}\n`);

  for (const u of elenco) {
    const esistenti = (u.box && u.box.materials) || [];
    const perId = new Map(esistenti.map((m) => [Number(m.mst_material_id), m]));

    let nuovi = 0, aumentati = 0;
    const finale = esistenti.map((m) => ({ ...m }));
    const indice = new Map(finale.map((m, i) => [Number(m.mst_material_id), i]));

    for (const m of scelti) {
      const i = indice.get(m.id);
      if (i === undefined) {
        finale.push({ mst_material_id: m.id, amount: QUANTI });
        indice.set(m.id, finale.length - 1);
        nuovi++;
      } else {
        finale[i].amount = Number(finale[i].amount || 0) + QUANTI;
        aumentati++;
      }
    }

    console.log(`--- ${u.character_name || '(senza nome)'} ---`);
    console.log(`  aveva     : ${esistenti.length} tipi`);
    console.log(`  nuovi     : ${nuovi}`);
    console.log(`  aumentati : ${aumentati}`);
    console.log(`  totale    : ${finale.length} tipi`);

    const esempi = scelti.slice(0, 8);
    if (esempi.length) {
      console.log('  esempi    :');
      for (const m of esempi) {
        console.log(`      R${m.rarita} ${String(m.id).padEnd(11)} ${m.nome}`);
      }
      if (scelti.length > 8) console.log(`      ... altri ${scelti.length - 8}`);
    }

    if (!DRY) {
      await users.updateOne({ _id: u._id }, {
        $set: {
          'box.materials': finale,
          ...(u.boxMatPrima ? {} : { boxMatPrima: esistenti }),
        },
      });
      console.log('  scritto.');
    }
    console.log('');
    void perId;
  }

  if (DRY) console.log('--dry: niente scritto');

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

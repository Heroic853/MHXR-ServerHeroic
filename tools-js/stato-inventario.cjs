/*
 * Fotografia completa dell'inventario di un giocatore: cosa ha davvero, con i
 * nomi veri e la rarita', diviso per famiglia.
 *
 * Serve a rispondere senza congetture a domande tipo "ho gia' le armi
 * leggendarie?" — e a verificare che in box non sia finito niente di rotto:
 * un id fuori catalogo o un equipaggiamento a 15 campi invece di 16 blocca il
 * login in modo permanente, ed e' meglio scoprirlo da qui che dal gioco.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/stato-inventario.cjs
 *   ... --utente=Heroic69
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

function carica(nomi) {
  for (const p of nomi) if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return null;
}

const equip = carica([
  path.join(__dirname, 'equipaggiamenti.json'),
  '/app/tools/equipaggiamenti.json',
]) || [];
const materiali = carica([
  path.join(__dirname, '..', 'src', 'json', 'materiali.json'),
  '/app/dist/json/materiali.json',
]) || [];
const catalogo = carica([
  path.join(__dirname, '..', 'src', 'json', 'catalogo-ricompense.json'),
  '/app/dist/json/catalogo-ricompense.json',
]) || [];

const EQ = new Map(equip.map((e) => [e.id, e]));
const MAT = new Map(materiali.map((m) => [m.id, m]));
const CAT = new Map(catalogo.map((v) => [v.id, v.f]));

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const users = mongoose.connection.db.collection('users');

  const elenco = await users.find(UTENTE ? { character_name: UTENTE } : {})
    .project({ character_name: 1, box: 1 }).toArray();

  if (!elenco.length) {
    console.error(UTENTE ? `Nessun utente "${UTENTE}"` : 'Nessun utente');
    process.exit(1);
  }

  for (const u of elenco) {
    const box = u.box || {};
    const eqp = box.equipments || [];
    const mat = box.materials || [];

    console.log('='.repeat(70));
    console.log(`${u.character_name || '(senza nome)'}`);
    console.log('='.repeat(70));
    console.log(`  equipaggiamenti : ${eqp.length}   (capacita' ${box.capacity?.eqp_box ?? '?'})`);
    console.log(`  materiali       : ${mat.length} tipi`);
    console.log(`  crescita        : ${(box.growth_items || []).length} tipi`);
    console.log(`  limitati        : ${(box.limiteds || []).length} tipi`);
    console.log(`  zeny            : ${box.zeny ?? 0}`);
    for (const p of box.payments || []) {
      console.log(`  valuta ${p.mst_payment_id} : ${p.amount}`);
    }

    // --- equipaggiamento per rarita' -----------------------------------
    const perRar = new Map();
    const perCat = new Map();
    const sconosciuti = [];
    const malformati = [];

    for (const e of eqp) {
      const campi = Object.keys(e).filter((k) => k !== '_id').length;
      if (campi !== 16) malformati.push(`${e.equipment_id} (${campi} campi)`);

      const info = EQ.get(Number(e.mst_equipment_id));
      if (!info) { sconosciuti.push(String(e.equipment_id)); continue; }
      const r = info.rarita ?? '?';
      perRar.set(r, (perRar.get(r) || 0) + 1);
      perCat.set(info.categoria, (perCat.get(info.categoria) || 0) + 1);
    }

    console.log('\n  --- equipaggiamento per rarita\' ---');
    for (const [r, n] of [...perRar.entries()].sort((a, b) => (b[0] === '?' ? -1 : b[0]) - (a[0] === '?' ? -1 : a[0]))) {
      const etichetta = r === 8 ? '  <-- LEGGENDARIE' : '';
      console.log(`    R${String(r).padEnd(4)} ${String(n).padStart(4)}${etichetta}`);
    }
    if (!perRar.size) console.log('    (nessuno con rarita\' nota)');

    console.log('\n  --- equipaggiamento per tipo ---');
    const righe = [...perCat.entries()].sort((a, b) => b[1] - a[1]);
    for (const [c, n] of righe) console.log(`    ${c.padEnd(10)} ${n}`);

    // i pezzi migliori, coi nomi veri
    const migliori = eqp
      .map((e) => ({ e, i: EQ.get(Number(e.mst_equipment_id)) }))
      .filter((x) => x.i && x.i.rarita !== undefined)
      .sort((a, b) => b.i.rarita - a.i.rarita)
      .slice(0, 12);
    if (migliori.length) {
      console.log('\n  --- i 12 pezzi piu\' rari che possiedi ---');
      for (const { e, i } of migliori) {
        console.log(`    R${String(i.rarita).padEnd(2)} ${String(i.nome).padEnd(16)} ${String(i.categoria).padEnd(9)} elv${e.elv ?? 0} ${i.nomeJp || ''}`);
      }
    }

    // --- materiali piu' rari -------------------------------------------
    const matRari = mat
      .map((m) => ({ m, i: MAT.get(Number(m.mst_material_id)) }))
      .filter((x) => x.i)
      .sort((a, b) => b.i.rarita - a.i.rarita)
      .slice(0, 6);
    if (matRari.length) {
      console.log('\n  --- materiali piu\' rari ---');
      for (const { m, i } of matRari) console.log(`    R${i.rarita} x${String(m.amount).padEnd(4)} ${i.nome}`);
    }

    // --- controlli di sicurezza ----------------------------------------
    console.log('\n  --- CONTROLLI ---');
    console.log(`    equipaggiamenti a 16 campi : ${malformati.length ? 'NO -> ' + malformati.join(', ') : 'si, tutti'}`);
    console.log(`    id fuori catalogo (equip)  : ${sconosciuti.length ? sconosciuti.join(', ') : 'nessuno'}`);

    const matFuori = mat.filter((m) => CAT.get(Number(m.mst_material_id)) !== 'materiale');
    console.log(`    materiali fuori catalogo   : ${matFuori.length ? matFuori.map((m) => m.mst_material_id).join(', ') : 'nessuno'}`);

    const problemi = malformati.length + sconosciuti.length + matFuori.length;
    console.log(`\n    ${problemi === 0 ? 'Inventario sano: niente che possa bloccare il login.' : 'ATTENZIONE: ' + problemi + ' anomalie, vanno rimosse.'}`);
    console.log('');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

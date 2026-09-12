/*
 * Riscrive DEFAULT_EQUIPMENT in src/json/user-defaults.json: la dotazione che
 * ogni NUOVO utente si ritrova in inventario appena creato l'account.
 *
 * Serve perche' oggi un giocatore nuovo parte con 17 pezzi (una balestra e un
 * set base) e non ha di che affrontare i mostri: deve prima farmare, ma per
 * farmare gli servono armi. Con una dotazione decente puo' entrare e giocare.
 *
 * Tre vincoli, tutti verificati e nessuno negoziabile:
 *
 * 1. I 17 pezzi originali RESTANO. DEFAULT_EQUIPSET (l'equipaggiamento
 *    indossato all'avvio) punta per equipment_id a WD_LBOWGUN001, AD_ARM006,
 *    AD_BODY006, AD_LEG006, AD_HEAD006: toglierli lascerebbe il personaggio
 *    che indossa oggetti inesistenti.
 *
 * 2. Solo id presenti in equipaggiamenti.json, che vengono dalle tabelle
 *    dell'apk e sono stati verificati 18/18 contro gli id certi. Nessun id
 *    inventato: uno sbagliato in box blocca il login in modo permanente.
 *
 * 3. Forma a 16 campi, identica a quella dei pezzi originali. Un pezzo con 15
 *    campi (mancava auto_potential_composite) ha gia' bloccato il login una
 *    volta.
 *
 * Le armature vengono date come SET COMPLETI: i cinque pezzi di un set
 * condividono il numero nel codice (AD_HEAD4038/AD_BODY4038/AD_ARM4038/...),
 * quindi si cercano i numeri per cui esistono tutti e cinque — cosi' il
 * giocatore ha davvero un set da indossare, non cinque pezzi scompagnati.
 *
 *   node dotazione-iniziale.cjs --dry
 *   node dotazione-iniziale.cjs
 *   node dotazione-iniziale.cjs --armi=50 --set=2 --rarita=6
 */
const fs = require('fs');
const path = require('path');

const QUI = __dirname;
const arg = (n, pred) => {
  const v = process.argv.find((a) => a.startsWith(`--${n}=`));
  return v === undefined ? pred : v.split('=').slice(1).join('=');
};
const DRY = process.argv.includes('--dry');
const N_ARMI = Number(arg('armi', 50));
const N_SET = Number(arg('set', 2));
const RARITA = Number(arg('rarita', 6));

const CATEGORIE_ARMI = [
  'sword', 'lsword', 'lsword2', 'wsword', 'hammer', 'lance', 'gunlance',
  'axe', 'chaxe', 'acaxe', 'stick', 'pipe', 'bow', 'lbowgun', 'hbowgun',
];
const PEZZI_ARMATURA = ['head', 'body', 'arm', 'waist', 'leg'];

const equip = JSON.parse(fs.readFileSync(path.join(QUI, 'equipaggiamenti.json'), 'utf8'));
const perNome = new Map(equip.map((e) => [e.nome, e]));

const utilizzabile = (e) =>
  e && e.nomeJp !== undefined && e.nomeJp !== '' && !/^dummy$/i.test(e.nomeJp);

/** Un pezzo nella forma a 16 campi, uguale a quella dei default originali. */
const costruisci = (e) => ({
  auto_potential_composite: 0,
  awaked: 0,
  created: 0,
  elv: 0,
  endAwakeCount: 0,
  endAwakeRemain: 0,
  end_remain: 0,
  equipment_id: e.nome,
  evolve_start_time: 0,
  favorite: 0,
  is_awake: 0,
  is_complete_auto_potential_composite: 0,
  mst_equipment_id: e.id,
  potential: 0,
  slv: 0,
  start_remain: 0,
});

// --- armi: distribuite su tutti i tipi -------------------------------------
const perTipo = new Map();
for (const e of equip) {
  if (!CATEGORIE_ARMI.includes(e.categoria) || !utilizzabile(e)) continue;
  if (e.rarita !== RARITA) continue;
  if (!perTipo.has(e.categoria)) perTipo.set(e.categoria, []);
  perTipo.get(e.categoria).push(e);
}

const tipiDisponibili = [...perTipo.keys()];
const armiScelte = [];
// A giro: un'arma per tipo finche' non si arriva al totale, cosi' nessun tipo
// resta scoperto anche se il totale non e' divisibile per il numero di tipi.
for (let giro = 0; armiScelte.length < N_ARMI; giro++) {
  let aggiunte = 0;
  for (const t of tipiDisponibili) {
    if (armiScelte.length >= N_ARMI) break;
    const lista = perTipo.get(t);
    // pezzi sparsi nell'intervallo, non i primi N di fila
    const passo = Math.max(1, Math.floor(lista.length / 8));
    const i = (giro * passo) % lista.length;
    const scelto = lista[i];
    if (scelto && !armiScelte.some((a) => a.nome === scelto.nome)) {
      armiScelte.push(scelto);
      aggiunte++;
    }
  }
  if (!aggiunte) break; // esauriti: evita il ciclo infinito
}

// --- armature: set completi (stesso numero su tutti e cinque i pezzi) ------
const perNumero = new Map();
for (const e of equip) {
  if (!PEZZI_ARMATURA.includes(e.categoria) || !utilizzabile(e)) continue;
  const m = e.nome.match(/^AD_(HEAD|BODY|ARM|WST|LEG)(\d+)$/);
  if (!m) continue;
  const numero = m[2];
  if (!perNumero.has(numero)) perNumero.set(numero, {});
  perNumero.get(numero)[e.categoria] = e;
}

const setCompleti = [...perNumero.entries()]
  .filter(([, p]) => PEZZI_ARMATURA.every((c) => p[c]))
  .filter(([, p]) => PEZZI_ARMATURA.every((c) => p[c].rarita === RARITA));

const setScelti = [];
if (setCompleti.length) {
  const passo = Math.max(1, Math.floor(setCompleti.length / Math.max(1, N_SET)));
  for (let i = 0; i < N_SET && i * passo < setCompleti.length; i++) {
    setScelti.push(setCompleti[i * passo]);
  }
}

// --- unione con i 17 originali ---------------------------------------------
const percorsoDefaults = path.join(QUI, '..', 'src', 'json', 'user-defaults.json');
const defaults = JSON.parse(fs.readFileSync(percorsoDefaults, 'utf8'));
const originali = defaults.DEFAULT_EQUIPMENT;
const giaPresenti = new Set(originali.map((e) => e.equipment_id));

const daAggiungere = [];
for (const e of armiScelte) if (!giaPresenti.has(e.nome)) daAggiungere.push(costruisci(e));
for (const [, pezzi] of setScelti) {
  for (const c of PEZZI_ARMATURA) {
    if (!giaPresenti.has(pezzi[c].nome)) daAggiungere.push(costruisci(pezzi[c]));
  }
}

console.log(`rarita' richiesta   : ${RARITA}`);
console.log(`armi selezionate    : ${armiScelte.length} su ${tipiDisponibili.length} tipi`);
console.log(`set completi trovati: ${setCompleti.length}, ne prendo ${setScelti.length}`);
console.log(`pezzi originali     : ${originali.length} (restano tutti)`);
console.log(`pezzi aggiunti      : ${daAggiungere.length}`);
console.log(`TOTALE nuovo utente : ${originali.length + daAggiungere.length}`);

console.log('\n=== armi, per tipo ===');
for (const t of tipiDisponibili) {
  const n = armiScelte.filter((a) => a.categoria === t);
  if (n.length) console.log(`  ${t.padEnd(9)} ${n.length}  ${n.slice(0, 2).map((x) => x.nomeJp).join(', ')}`);
}
console.log('\n=== set di armatura ===');
for (const [numero, pezzi] of setScelti) {
  console.log(`  set ${numero}: ${PEZZI_ARMATURA.map((c) => pezzi[c].nome).join(' + ')}`);
  console.log(`           ${pezzi.body.nomeJp}`);
}

// Controllo finale: nessun id fuori catalogo, nessun pezzo a 15 campi.
const tuttiFinali = [...originali, ...daAggiungere];
const idValidi = new Set(equip.map((e) => e.id));
const sospetti = tuttiFinali.filter((e) => !idValidi.has(e.mst_equipment_id));
const campiSbagliati = tuttiFinali.filter((e) => Object.keys(e).length !== 16);
console.log(`\n=== controlli ===`);
console.log(`  id non nel catalogo : ${sospetti.length}${sospetti.length ? ' -> ' + sospetti.map((s) => s.equipment_id).join(', ') : ''}`);
console.log(`  pezzi non a 16 campi: ${campiSbagliati.length}`);
console.log(`  equipment_id doppi  : ${tuttiFinali.length - new Set(tuttiFinali.map((e) => e.equipment_id)).size}`);

if (sospetti.length || campiSbagliati.length) {
  console.error('\nNon scrivo: i controlli non sono passati.');
  process.exit(1);
}

if (DRY) {
  console.log('\n--dry: niente scritto');
} else {
  defaults.DEFAULT_EQUIPMENT = tuttiFinali;
  fs.writeFileSync(percorsoDefaults, JSON.stringify(defaults, null, 1));
  console.log(`\nscritto: ${percorsoDefaults}`);
  console.log('Vale solo per gli utenti creati DA ORA: chi esiste gia\' usa dai-equipaggiamento.cjs.');
}

/*
 * Elenca le quest che danno ARMI o ARMATURE come ricompensa, e isola gli id
 * che non stanno in nessuna delle due tabelle verificate.
 *
 * Contesto: mRewardItemList mescola materiali ed equipaggiamento senza un campo
 * che li distingua (mRewardType NON serve a questo: il tipo 1 contiene 13970
 * materiali e 13936 equipaggiamenti). L'unico criterio affidabile e' in quale
 * tabella cade l'id — e le due tabelle sono disgiunte, verificato: zero id in
 * comune fra i 4878 materiali e i 19956 equipaggiamenti.
 *
 * Gli id che non stanno ne' di qua ne' di la' sono il pericolo vero: scriverne
 * uno nell'inventario blocca il login in modo permanente (successo davvero con
 * 1277724242). Vanno identificati e sempre scartati.
 *
 *   node quest-con-equipaggiamento.cjs
 *   node quest-con-equipaggiamento.cjs --json    scrive quest-equipaggiamento.json
 */
const fs = require('fs');
const path = require('path');

const QUI = __dirname;
const SCRIVI = process.argv.includes('--json');

const materiali = JSON.parse(fs.readFileSync(path.join(QUI, '..', 'src', 'json', 'materiali.json'), 'utf8'));
const equip = JSON.parse(fs.readFileSync(path.join(QUI, 'equipaggiamenti.json'), 'utf8'));
const MAT = new Map(materiali.map((m) => [m.id, m]));
const EQ = new Map(equip.map((e) => [e.id, e]));

const dirQuest = path.join(QUI, '..', 'src', 'json', 'questDB');
const file = fs.readdirSync(dirQuest).filter((f) => /extended.*\.json$/.test(f));

function estraiQuest(dati) {
  const fuori = [];
  const cerca = (nodo, prof = 0) => {
    if (!nodo || typeof nodo !== 'object' || prof > 5) return;
    if (Array.isArray(nodo)) {
      if (nodo.length && nodo[0] && nodo[0].mRewardItemList !== undefined) fuori.push(...nodo);
      else for (const v of nodo) cerca(v, prof + 1);
      return;
    }
    for (const v of Object.values(nodo)) cerca(v, prof + 1);
  };
  cerca(dati);
  return fuori;
}

/*
 * mRewardItemList non ha sempre la stessa forma. Il convertitore XFS a volte
 * lascia un array piatto, a volte lo avvolge in {classref_: {mpArray: [...]}}
 * e a volte usa la chiave "array" al posto di "classref_". E' la stessa
 * trappola che aveva fatto perdere i boss delle quest evento (finivano a
 * [null] nel database perche' lo schema Mongoose si aspettava un array e
 * riceveva un oggetto). Qui si normalizzano tutte e tre le forme.
 */
function comeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v !== 'object') return [];
  const dentro = v.classref_ ?? v.array ?? v;
  if (Array.isArray(dentro)) return dentro;
  if (dentro && Array.isArray(dentro.mpArray)) return dentro.mpArray;
  return [];
}

const risultato = [];
const ignoti = new Map(); // id -> quante volte
const perPrefisso = new Map();

for (const f of file) {
  for (const q of estraiQuest(JSON.parse(fs.readFileSync(path.join(dirQuest, f), 'utf8')))) {
    const pezzi = [];
    for (const r of comeArray(q.mRewardItemList)) {
      if (!r || r.mItemHash === undefined) continue;
      const id = Number(r.mItemHash);
      if (EQ.has(id)) {
        const e = EQ.get(id);
        pezzi.push({ id, nome: e.nome, categoria: e.categoria, rarita: e.rarita ?? null, nomeJp: e.nomeJp || '' });
      } else if (!MAT.has(id)) {
        ignoti.set(id, (ignoti.get(id) || 0) + 1);
      }
    }
    if (!pezzi.length) continue;

    const defineId = String(q.mDefineId || q.mQuestID || '?');
    const prefisso = (defineId.match(/^[A-Z]+/) || ['ALTRO'])[0];
    perPrefisso.set(prefisso, (perPrefisso.get(prefisso) || 0) + 1);

    risultato.push({
      defineId,
      questId: String(q.mQuestID || ''),
      nome: String(q.mQuestName || '').replace(/\s+/g, ' ').trim(),
      pezzi,
    });
  }
}

console.log(`quest che danno equipaggiamento: ${risultato.length}\n`);

console.log('=== per tipo di quest ===');
for (const [p, n] of [...perPrefisso.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${p}`);
}

// Quali categorie di equipaggiamento vengono distribuite, e con che rarita'
const perCat = new Map();
const perRar = new Map();
for (const q of risultato) {
  for (const p of q.pezzi) {
    perCat.set(p.categoria, (perCat.get(p.categoria) || 0) + 1);
    perRar.set(p.rarita, (perRar.get(p.rarita) || 0) + 1);
  }
}
console.log('\n=== categorie distribuite ===');
for (const [c, n] of [...perCat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${c}`);
}
console.log('\n=== rarita\' distribuite ===');
for (const [r, n] of [...perRar.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
  console.log(`  R${String(r).padEnd(4)} ${n}`);
}

console.log('\n=== esempi di quest EVENTO con equipaggiamento ===');
for (const q of risultato.filter((x) => /^(EVENT|TICKE|SCORE|ETERNAL)/.test(x.defineId)).slice(0, 12)) {
  console.log(`  ${q.defineId.padEnd(14)} "${q.nome.slice(0, 34)}"`);
  for (const p of q.pezzi.slice(0, 3)) {
    console.log(`        ${p.nome.padEnd(16)} ${String(p.categoria).padEnd(9)} R${p.rarita ?? '?'}  ${p.nomeJp}`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`ID CHE NON SONO NE' MATERIALI NE' EQUIPAGGIAMENTI: ${ignoti.size} distinti`);
console.log('='.repeat(70));
console.log('Questi vanno SEMPRE scartati: sono il tipo di id che blocca il login.');
for (const [id, n] of [...ignoti.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${String(id).padEnd(12)} ricorre ${n} volte`);
}

if (SCRIVI) {
  const dest = path.join(QUI, 'quest-equipaggiamento.json');
  fs.writeFileSync(dest, JSON.stringify(risultato, null, 1));
  console.log(`\nscritto: ${dest} (${risultato.length} quest)`);
}

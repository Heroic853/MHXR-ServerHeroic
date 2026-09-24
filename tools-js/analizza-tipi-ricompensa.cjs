/*
 * Scopre cosa significa mRewardType nelle liste ricompensa delle quest.
 *
 * Nello schema (src/model/questSheet.ts) ogni voce di mRewardItemList e'
 * {mItemHash, mProbScale, mRewardType}, ma il codice ha sempre ignorato
 * mRewardType e trattato ogni mItemHash come un materiale. Nei dati i valori
 * sono 0,1,2,3,4 — quindi cinque categorie diverse di ricompensa.
 *
 * Il metodo non e' interpretativo: per ogni tipo si guarda in quale tabella
 * VERIFICATA finiscono gli id.
 *   - materiali.json      4878 id, dal foglio degli oggetti del gioco
 *   - equipaggiamenti.json 19956 id, dalle tabelle dell'apk (verificati 18/18)
 * Se gli id di un tipo cadono tutti fra gli equipaggiamenti, quel tipo E'
 * l'equipaggiamento. Nessuna ipotesi, solo conteggi.
 *
 *   node analizza-tipi-ricompensa.cjs
 */
const fs = require('fs');
const path = require('path');

const QUI = __dirname;
const materiali = JSON.parse(fs.readFileSync(path.join(QUI, '..', 'src', 'json', 'materiali.json'), 'utf8'));
const equip = JSON.parse(fs.readFileSync(path.join(QUI, 'equipaggiamenti.json'), 'utf8'));

const ID_MATERIALE = new Set(materiali.map((m) => m.id));
const ID_EQUIP = new Map(equip.map((e) => [e.id, e]));

const dirQuest = path.join(QUI, '..', 'src', 'json', 'questDB');
const file = fs.readdirSync(dirQuest).filter((f) => /extended.*\.json$/.test(f));

// tipo -> conteggi e campioni
const perTipo = new Map();
const vedi = (tipo) => {
  if (!perTipo.has(tipo)) {
    perTipo.set(tipo, {
      totale: 0, materiale: 0, equipaggiamento: 0, ignoto: 0,
      campioniEquip: [], campioniMat: [], campioniIgnoti: [],
    });
  }
  return perTipo.get(tipo);
};

// Le quest che danno equipaggiamento: mDefineId -> elenco
const questConEquip = new Map();

let questViste = 0;

for (const f of file) {
  const dati = JSON.parse(fs.readFileSync(path.join(dirQuest, f), 'utf8'));

  // I file sono {rQuestSheet: {mQuestDataList: [...]}}, ma non tutti allo
  // stesso modo: si cerca l'array delle quest ovunque sia, invece di dare per
  // scontata la forma (gia' sbagliata una volta).
  const elenco = [];
  const cerca = (nodo, prof = 0) => {
    if (!nodo || typeof nodo !== 'object' || prof > 5) return;
    if (Array.isArray(nodo)) {
      if (nodo.length && nodo[0] && nodo[0].mRewardItemList !== undefined) elenco.push(...nodo);
      else for (const v of nodo) cerca(v, prof + 1);
      return;
    }
    for (const v of Object.values(nodo)) cerca(v, prof + 1);
  };
  cerca(dati);

  for (const q of elenco) {
    if (!q || typeof q !== 'object') continue;
    const lista = q.mRewardItemList;
    if (!Array.isArray(lista)) continue;
    questViste++;

    for (const r of lista) {
      if (!r || r.mItemHash === undefined) continue;
      const id = Number(r.mItemHash);
      const tipo = String(r.mRewardType ?? '?');
      const c = vedi(tipo);
      c.totale++;

      if (ID_EQUIP.has(id)) {
        c.equipaggiamento++;
        const e = ID_EQUIP.get(id);
        if (c.campioniEquip.length < 4) c.campioniEquip.push(`${e.nome} (${e.categoria}, R${e.rarita ?? '?'}) ${e.nomeJp || ''}`);

        const chiave = String(q.mDefineId || q.mQuestID || '?');
        if (!questConEquip.has(chiave)) {
          questConEquip.set(chiave, { nome: String(q.mQuestName || '').replace(/\s+/g, ' ').trim(), pezzi: [] });
        }
        questConEquip.get(chiave).pezzi.push({ nome: e.nome, categoria: e.categoria, rarita: e.rarita, nomeJp: e.nomeJp, tipo });
      } else if (ID_MATERIALE.has(id)) {
        c.materiale++;
        if (c.campioniMat.length < 4) {
          const m = materiali.find((x) => x.id === id);
          c.campioniMat.push(`${m.nome} (R${m.rarita})`);
        }
      } else {
        c.ignoto++;
        if (c.campioniIgnoti.length < 6) c.campioniIgnoti.push(String(id));
      }
    }
  }
}

console.log(`file letti      : ${file.length}`);
console.log(`quest con premi : ${questViste}\n`);

console.log('='.repeat(74));
console.log('COSA E\' OGNI mRewardType');
console.log('='.repeat(74));
console.log('tipo  voci    materiale  equipaggiam.  ignoto');
for (const [tipo, c] of [...perTipo.entries()].sort()) {
  console.log(
    `  ${tipo}  ${String(c.totale).padStart(6)}  ${String(c.materiale).padStart(9)}  ${String(c.equipaggiamento).padStart(12)}  ${String(c.ignoto).padStart(6)}`,
  );
}

for (const [tipo, c] of [...perTipo.entries()].sort()) {
  console.log(`\n--- tipo ${tipo} ---`);
  if (c.campioniMat.length) console.log(`  materiali    : ${c.campioniMat.join(' | ')}`);
  if (c.campioniEquip.length) console.log(`  equipaggiam. : ${c.campioniEquip.join(' | ')}`);
  if (c.campioniIgnoti.length) console.log(`  id ignoti    : ${c.campioniIgnoti.join(', ')}`);
}

console.log(`\n${'='.repeat(74)}`);
console.log(`QUEST CHE DANNO EQUIPAGGIAMENTO: ${questConEquip.size}`);
console.log('='.repeat(74));
let n = 0;
for (const [chiave, q] of questConEquip) {
  if (n++ >= 25) { console.log(`  ... altre ${questConEquip.size - 25}`); break; }
  console.log(`  ${chiave.padEnd(14)} "${q.nome.slice(0, 30)}"`);
  for (const p of q.pezzi.slice(0, 3)) {
    console.log(`        tipo${p.tipo} ${p.nome.padEnd(16)} ${String(p.categoria).padEnd(9)} R${p.rarita ?? '?'} ${p.nomeJp || ''}`);
  }
}

/*
 * Costruisce la corrispondenza mEnemyID -> nome del mostro, usando come ponte le
 * quest della storia (che hanno sia il mEnemyID sia i blocchi giusti) e il foglio
 * mst_block_ids, dove qualcuno ha annotato a mano quale mostro c'e' in ogni blocco.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/build-enemy-names.cjs
 *
 * Logica: per ogni quest storia prendo il blocco all'indice mAreaNo (che e'
 * l'indice nella sequenza, non l'area della mappa) e leggo la nota del foglio.
 * Se lo stesso mEnemyID cade sempre sulla stessa nota, la corrispondenza e' solida.
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

// le note contengono anche quantita' e varianti: "3 Ludroth", "Rathalos  ", "Jaggi 6, Jaggia"
function pulisci(nota) {
  return String(nota || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+\s*x?\s*/i, '')      // "3 Ludroth" -> "Ludroth"
    .replace(/\s*\d+$/, '')            // "Jaggi 6" -> "Jaggi"
    .trim();
}

function eMostro(nota) {
  const n = pulisci(nota);
  if (!n) return false;
  if (/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|\?$/i.test(n)) return false;
  return true;
}

(async () => {
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8'));
  // A=Name B=Level C=Map D=Area E=Block F=Hash G=Notes H=MapName
  const notaPerHash = new Map();
  let conNota = 0;
  for (const r of righe.slice(1)) {
    const hash = Number(r.F);
    if (!hash || isNaN(hash)) continue;
    notaPerHash.set(hash, r.G || '');
    if (eMostro(r.G)) conNota++;
  }
  console.log(`righe nel foglio          : ${righe.length - 1}`);
  console.log(`blocchi con hash valido   : ${notaPerHash.size}`);
  console.log(`di cui con un mostro      : ${conNota}`);

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const storia = await qs.find({ mDefineId: /^QUEST/, 'mBlocks.0': { $exists: true } })
    .project({ mDefineId: 1, mBossList: 1, mBlocks: 1 }).toArray();

  // mEnemyID -> conteggio delle note viste al blocco indicato
  const voti = new Map();
  for (const q of storia) {
    const blocchi = q.mBlocks || [];
    for (const b of q.mBossList || []) {
      const id = String(b?.mEnemyID ?? '');
      const idx = parseInt(b?.mAreaNo, 10);
      if (!id || isNaN(idx)) continue;
      const hash = blocchi[idx - 1];
      if (hash === undefined) continue;
      const nota = pulisci(notaPerHash.get(Number(hash)));
      if (!eMostro(nota)) continue;
      if (!voti.has(id)) voti.set(id, new Map());
      const m = voti.get(id);
      m.set(nota, (m.get(nota) || 0) + 1);
    }
  }

  console.log(`\nmEnemyID con almeno un voto: ${voti.size}`);

  const tabella = {};
  let solidi = 0, incerti = 0;
  const righeOut = [];
  for (const [id, m] of [...voti.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const ord = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const totale = ord.reduce((t, x) => t + x[1], 0);
    const [nome, n] = ord[0];
    const fiducia = Math.round(n / totale * 100);
    if (fiducia >= 60 && totale >= 2) { tabella[id] = nome; solidi++; } else incerti++;
    righeOut.push(`  enemy ${String(id).padStart(4)} -> ${String(nome).padEnd(24)} ${n}/${totale} voti (${fiducia}%)${ord.length > 1 ? '   altri: ' + ord.slice(1, 3).map((x) => `${x[0]}(${x[1]})`).join(', ') : ''}`);
  }

  console.log(`  solidi (>=60% e >=2 voti) : ${solidi}`);
  console.log(`  incerti                   : ${incerti}`);
  console.log('\n=== corrispondenze trovate ===');
  righeOut.slice(0, 45).forEach((r) => console.log(r));

  fs.writeFileSync('/app/tools/enemy-names.json', JSON.stringify(tabella, null, 1));
  console.log(`\nsalvata la tabella in tools-js/enemy-names.json (${Object.keys(tabella).length} mostri)`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

/*
 * Verifica il parser XFS confrontando quello che estrae con blocks.csv,
 * che e' stato generato dagli stessi file dal progetto originale.
 * Se i nomi e gli hash coincidono al 100%, il parser e' corretto.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/xfs-verify.cjs /app/tools/_probe.xfs
 */
const fs = require('fs');
const { parseXfs } = require('./xfs-parse.cjs');

const doc = parseXfs(fs.readFileSync(process.argv[2]));

// il documento e' { mData: { mAutoDelete, mpArray: [ {mNo, mName, Hash}, ... ] } }
const arr = doc.root?.mData?.mpArray || [];
console.log(`record estratti dal parser: ${arr.length}`);

const csv = fs.readFileSync('/app/dist/csv/blocks.csv', 'utf8').split('\n').slice(1);
const daCsv = new Map();
for (const riga of csv) {
  const [nome, hash] = riga.trim().split(',');
  if (nome && hash) daCsv.set(nome, Number(hash));
}
console.log(`record in blocks.csv        : ${daCsv.size}`);

let ok = 0, mancanti = 0, diversi = 0;
const problemi = [];
for (const r of arr) {
  if (!daCsv.has(r.mName)) { mancanti++; if (problemi.length < 5) problemi.push(`  ${r.mName} non e' in blocks.csv`); continue; }
  if (daCsv.get(r.mName) !== r.Hash) {
    diversi++;
    if (problemi.length < 5) problemi.push(`  ${r.mName}: parser=${r.Hash} csv=${daCsv.get(r.mName)}`);
  } else ok++;
}

console.log(`\n=== confronto ===`);
console.log(`  nome e hash coincidono : ${ok}`);
console.log(`  hash diverso           : ${diversi}`);
console.log(`  assenti dal csv        : ${mancanti}`);
if (problemi.length) { console.log('\nproblemi:'); problemi.forEach((p) => console.log(p)); }
console.log(`\n${ok === arr.length && arr.length > 0 ? '>>> PARSER CORRETTO: corrispondenza totale' : '>>> ci sono discrepanze'}`);

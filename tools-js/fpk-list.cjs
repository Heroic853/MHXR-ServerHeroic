/*
 * Elenca (o estrae) il contenuto degli archivi FPK del gioco.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fpk-list.cjs quest
 *   ... quest --filter=block        mostra solo i file che contengono "block" nel nome
 *   ... quest --extract=/tmp/out    estrae davvero i file
 *
 * Il formato e' quello implementato in src/tools/fpk/formats/fpk.ts della nuova
 * versione, riportato qui in CommonJS perche' quello e' TypeScript e nel
 * container di produzione mancano le dipendenze di sviluppo per eseguirlo.
 *
 *   header 16 byte : "FPK\0" + field4 + field8 + compression(2) + fileCount(2)
 *   voce   80 byte : path(64) + padding(4) + size(4) + sizeAndFlags(4) + offset(4)
 */
const fs = require('fs');
const path = require('path');

const RES = '/app/dist/public/res/download/android';

const argv = process.argv.slice(2);
const GRUPPO = argv.find((a) => !a.startsWith('--')) || 'quest';
const FILTRO = (argv.find((a) => a.startsWith('--filter=')) || '').split('=')[1];
const ESTRAI = (argv.find((a) => a.startsWith('--extract=')) || '').split('=')[1];
const LIMITE = parseInt((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '40', 10);

function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') {
    throw new Error('non e\' un FPK');
  }
  const fileCount = buf.readUInt16LE(14);
  const entries = [];
  for (let i = 0; i < fileCount; i++) {
    const off = 16 + i * 80;
    if (off + 80 > buf.length) break;
    const pathBuf = buf.subarray(off, off + 64);
    const nul = pathBuf.indexOf(0);
    const filePath = pathBuf.toString('utf-8', 0, nul === -1 ? 64 : nul);
    const size = buf.readUInt32LE(off + 68);
    const dataOff = buf.readUInt32LE(off + 76);
    if (dataOff + size > buf.length) continue;
    entries.push({ filePath, size, dataOff });
  }
  return { fileCount, entries };
}

function trovaFpk(gruppo) {
  const risultati = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (f.endsWith('.fpk') && f.startsWith(gruppo + '.')) risultati.push(p);
    }
  })(RES);
  return risultati.sort();
}

const archivi = trovaFpk(GRUPPO);
console.log(`archivi "${GRUPPO}.*.fpk" trovati: ${archivi.length}\n`);

const estensioni = {};
let totFile = 0;
const mostrati = [];

for (const a of archivi) {
  let fpk;
  try { fpk = parseFpk(fs.readFileSync(a)); }
  catch (e) { console.log(`  ${path.basename(a)}: ${e.message}`); continue; }

  totFile += fpk.entries.length;
  for (const e of fpk.entries) {
    const ext = path.extname(e.filePath) || '(nessuna)';
    estensioni[ext] = (estensioni[ext] || 0) + 1;
    if (FILTRO && !e.filePath.toLowerCase().includes(FILTRO.toLowerCase())) continue;
    if (mostrati.length < LIMITE) {
      mostrati.push(`  ${path.basename(a).padEnd(16)} ${e.filePath}  (${e.size} byte)`);
    }
    if (ESTRAI) {
      const dest = path.join(ESTRAI, e.filePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const buf = fs.readFileSync(a);
      fs.writeFileSync(dest, buf.subarray(e.dataOff, e.dataOff + e.size));
    }
  }
}

console.log(`file totali dentro gli archivi: ${totFile}`);
console.log('\nestensioni presenti:');
for (const [k, v] of Object.entries(estensioni).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}
console.log(`\n${FILTRO ? `file che contengono "${FILTRO}"` : 'primi file'}:`);
mostrati.forEach((m) => console.log(m));
if (ESTRAI) console.log(`\nestratti in ${ESTRAI}`);

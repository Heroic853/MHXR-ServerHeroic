/*
 * Guarda dentro un file di area (es. m12a01) per capire come sono descritti i
 * blocchi e se contengono l'id del nemico.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/blocks-inspect.cjs /tmp/blk/quest_block_lv90_m12_m12a01
 */
const fs = require('fs');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('file non trovato: ' + file); process.exit(1); }
const buf = fs.readFileSync(file);

console.log(`file: ${file}   ${buf.length} byte`);
console.log(`primi 4 byte (firma): ${JSON.stringify(buf.toString('ascii', 0, 4))}  hex=${buf.subarray(0, 4).toString('hex')}`);

console.log('\n=== primi 96 byte ===');
for (let i = 0; i < Math.min(96, buf.length); i += 16) {
  const c = buf.subarray(i, i + 16);
  const hex = [...c].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const asc = [...c].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
  console.log(`  ${String(i).padStart(5)}  ${hex.padEnd(47)}  ${asc}`);
}

console.log('\n=== stringhe leggibili (>=4 caratteri) ===');
const testo = buf.toString('latin1');
const trovate = [...testo.matchAll(/[\x20-\x7E]{4,}/g)].map((m) => ({ off: m.index, s: m[0] }));
console.log(`  totale: ${trovate.length}`);
for (const t of trovate.slice(0, 40)) console.log(`  ${String(t.off).padStart(6)}  ${t.s}`);

// I nomi dei blocchi finiscono con 4 cifre (0011, 0012...): compaiono come testo?
console.log('\n=== stringhe che sembrano nomi di blocco ===');
const nomi = trovate.filter((t) => /^[a-z]*\d{2}[a-z]?\d*$|_\d{4}$|^\d{4}$/.test(t.s.trim()));
nomi.slice(0, 30).forEach((t) => console.log(`  ${String(t.off).padStart(6)}  ${t.s}`));

// Sequenze di interi a 32 bit che potrebbero essere id nemico (1..600)
console.log('\n=== possibili id nemico (uint32 fra 1 e 600, primi 40) ===');
const cand = [];
for (let i = 0; i + 4 <= buf.length; i += 4) {
  const v = buf.readUInt32LE(i);
  if (v >= 1 && v <= 600) cand.push({ off: i, v });
}
console.log(`  totale candidati: ${cand.length}`);
cand.slice(0, 40).forEach((c) => console.log(`  offset ${String(c.off).padStart(6)}  = ${c.v}`));

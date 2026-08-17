/*
 * Dump grezzo della zona definizioni di un XFS v16, per ricavare il layout vero.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/xfs-probe.cjs /app/tools/_probe.xfs
 */
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);

const HEADER = 24;
const defCount = buf.readInt32LE(16);
const defSize = buf.readInt32LE(20);
console.log(`defCount=${defCount} defSize=${defSize}  blocco definizioni: ${HEADER}..${HEADER + defSize}`);

// dove sono le stringhe (i nomi delle proprieta')
console.log('\n=== stringhe nel blocco definizioni ===');
const zona = buf.subarray(0, HEADER + defSize).toString('latin1');
const stringhe = [...zona.matchAll(/[\x20-\x7E]{3,}/g)];
for (const m of stringhe) {
  console.log(`  offset file ${String(m.index).padStart(5)}  (nameOffset sarebbe ${m.index - HEADER})  "${m[0]}"`);
}

console.log('\n=== dump da 48 a 340 ===');
for (let i = 48; i < Math.min(340, buf.length); i += 16) {
  const c = buf.subarray(i, i + 16);
  const hex = [...c].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const asc = [...c].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
  const u32 = [];
  for (let k = 0; k + 4 <= c.length; k += 4) u32.push(c.readUInt32LE(k));
  console.log(`  ${String(i).padStart(5)}  ${hex.padEnd(47)}  ${asc}  | ${u32.join(' ')}`);
}

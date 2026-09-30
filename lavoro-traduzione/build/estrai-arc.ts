// Estrae un .arc da un .fpk: npx tsx estrai-arc.ts <fpk> <percorso-interno> <uscita>
import fs from 'node:fs';
import { parseFpk } from '../../src/tools/fpk/formats/fpk.js';
const [, , fpk, interno, out] = process.argv;
const e = parseFpk(fs.readFileSync(fpk!)).entries.find((x) => x.filePath === interno);
if (!e) { console.error('non trovato', interno); process.exit(1); }
fs.writeFileSync(out!, e.data);
console.log('estratto', interno, e.data.length, 'byte');

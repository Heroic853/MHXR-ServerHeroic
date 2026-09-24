/*
 * Rimette un singolo .arc gia' pronto (per esempio gia' tradotto) dentro un
 * FPK, lasciando tutte le altre voci byte per byte identiche.
 *
 *   npx tsx src/tools/fpk/inject-arc.ts <ingresso.fpk> <percorso-interno.arc> <nuovo.arc> <uscita.fpk>
 *
 * <percorso-interno.arc> e' il filePath cosi' come appare nel manifest FPK,
 * es. /arc_cmn/resident/rsdnt_equip.arc
 */
import fs from 'node:fs';
import { parseFpk, buildFpk } from './formats/fpk.js';

const [, , fpkIn, percorsoInterno, arcNuovo, fpkOut] = process.argv;
if (!fpkIn || !percorsoInterno || !arcNuovo || !fpkOut) {
  console.error('Uso: inject-arc.ts <ingresso.fpk> <percorso-interno.arc> <nuovo.arc> <uscita.fpk>');
  process.exit(1);
}

const fpk = parseFpk(fs.readFileSync(fpkIn));
console.log(`${fpkIn}: ${fpk.entries.length} voci, compressione header=${fpk.header.compression}`);

let trovato = false;
const nuoviInput = fpk.entries.map((e) => {
  if (e.filePath === percorsoInterno) {
    trovato = true;
    console.log(`sostituisco ${e.filePath}: ${e.data.length} -> ${fs.statSync(arcNuovo).size} byte`);
    return { filePath: e.filePath, data: fs.readFileSync(arcNuovo) };
  }
  return { filePath: e.filePath, data: e.data };
});

if (!trovato) {
  console.error(`ERRORE: ${percorsoInterno} non trovato nel manifest (voci presenti: ${fpk.entries.map((e) => e.filePath).join(', ')})`);
  process.exit(1);
}

const buffers = buildFpk(nuoviInput, { compression: fpk.header.compression });
if (buffers.length !== 1) {
  console.error(`ATTENZIONE: buildFpk ha prodotto ${buffers.length} file invece di 1 (troppe voci per un solo FPK?)`);
}
fs.writeFileSync(fpkOut, buffers[0]!);
console.log(`scritto: ${fpkOut} (${buffers[0]!.length} byte)`);

// verifica: riapre l'uscita e controlla che ogni voce (compresa quella nuova) si rilegga
const rilettura = parseFpk(fs.readFileSync(fpkOut));
let ok = 0;
for (let i = 0; i < rilettura.entries.length; i++) {
  const a = fpk.entries[i]!;
  const b = rilettura.entries[i]!;
  const atteso = a.filePath === percorsoInterno ? fs.readFileSync(arcNuovo) : a.data;
  if (a.filePath === b.filePath && atteso.equals(b.data)) ok++;
  else console.log(`  DIVERSO: ${a.filePath}`);
}
console.log(`verifica: ${ok}/${rilettura.entries.length} voci identiche a quanto atteso`);

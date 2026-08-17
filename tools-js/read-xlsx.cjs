/*
 * Legge un .xlsx gia' scompattato (cartella con xl/sharedStrings.xml e
 * xl/worksheets/sheet1.xml) senza dipendenze esterne.
 *   node read-xlsx.cjs <cartella-scompattata> [--righe=N] [--out=file.json]
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const RIGHE = parseInt((process.argv.find((a) => a.startsWith('--righe=')) || '').split('=')[1] || '25', 10);
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').split('=')[1];

function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}

// tabella delle stringhe condivise
const ss = [];
const ssPath = path.join(dir, 'xl', 'sharedStrings.xml');
if (fs.existsSync(ssPath)) {
  const xml = fs.readFileSync(ssPath, 'utf8');
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // una <si> puo' contenere piu' <t> (testo formattato a pezzi)
    let testo = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) testo += t[1];
    ss.push(decodeEntities(testo));
  }
}
console.log(`stringhe condivise: ${ss.length}`);

const sheet = fs.readFileSync(path.join(dir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');

const righe = [];
for (const r of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const celle = {};
  for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
    const col = c[1];
    const tipo = c[2];
    const vm = c[3].match(/<v>([\s\S]*?)<\/v>/);
    const im = c[3].match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
    let val;
    if (im) val = decodeEntities(im[1]);
    else if (vm) val = tipo === 's' ? (ss[parseInt(vm[1], 10)] ?? '') : decodeEntities(vm[1]);
    else val = '';
    if (val !== '') celle[col] = val;
  }
  if (Object.keys(celle).length) righe.push({ n: parseInt(r[1], 10), celle });
}

console.log(`righe con contenuto: ${righe.length}`);

const colonne = new Set();
for (const r of righe) for (const c of Object.keys(r.celle)) colonne.add(c);
const ordinate = [...colonne].sort((a, b) => (a.length - b.length) || a.localeCompare(b));
console.log(`colonne usate: ${ordinate.join(', ')}\n`);

console.log(`=== prime ${RIGHE} righe ===`);
for (const r of righe.slice(0, RIGHE)) {
  const s = ordinate.map((c) => `${c}=${(r.celle[c] ?? '').toString().slice(0, 22)}`).filter((x) => !x.endsWith('=')).join('  ');
  console.log(`  [${String(r.n).padStart(5)}] ${s}`);
}

if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(righe.map((r) => r.celle)));
  console.log(`\nsalvate ${righe.length} righe in ${OUT}`);
}

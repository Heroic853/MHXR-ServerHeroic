/*
 * Legge un .xlsx scompattato risolvendo i nomi dei fogli (workbook.xml + rels).
 *   node read-workbook.cjs <cartella> [--foglio=nome] [--righe=N] [--out=file.json]
 *   node read-workbook.cjs <cartella> --elenco
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const ELENCO = process.argv.includes('--elenco');
const FOGLIO = (process.argv.find((a) => a.startsWith('--foglio=')) || '').split('=')[1];
const RIGHE = parseInt((process.argv.find((a) => a.startsWith('--righe=')) || '').split('=')[1] || '20', 10);
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').split('=')[1];

function dec(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}

// stringhe condivise
const ss = [];
const ssPath = path.join(dir, 'xl', 'sharedStrings.xml');
if (fs.existsSync(ssPath)) {
  const xml = fs.readFileSync(ssPath, 'utf8');
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const x of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += x[1];
    ss.push(dec(t));
  }
}

// nome foglio -> file, via r:id
const wb = fs.readFileSync(path.join(dir, 'xl', 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(dir, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
const perId = {};
for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) perId[m[1]] = m[2];
const fogli = [];
for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
  fogli.push({ nome: dec(m[1]), file: perId[m[2]] });
}

if (ELENCO) {
  console.log(`fogli: ${fogli.length}`);
  for (const f of fogli) {
    const p = path.join(dir, 'xl', String(f.file).replace(/^\/?xl\//, ''));
    const kb = fs.existsSync(p) ? Math.round(fs.statSync(p).size / 1024) : 0;
    console.log(`  ${f.nome.padEnd(28)} ${String(kb).padStart(5)} KB   ${f.file}`);
  }
  process.exit(0);
}

const scelto = fogli.find((f) => f.nome.toLowerCase().includes(String(FOGLIO || '').toLowerCase()));
if (!scelto) { console.error(`foglio "${FOGLIO}" non trovato`); process.exit(1); }
console.log(`foglio: ${scelto.nome}\n`);

const sheetPath = path.join(dir, 'xl', String(scelto.file).replace(/^\/?xl\//, ''));
const sheet = fs.readFileSync(sheetPath, 'utf8');

const righe = [];
for (const r of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const celle = {};
  for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
    const vm = c[3].match(/<v>([\s\S]*?)<\/v>/);
    const im = c[3].match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
    let val;
    if (im) val = dec(im[1]);
    else if (vm) val = c[2] === 's' ? (ss[parseInt(vm[1], 10)] ?? '') : dec(vm[1]);
    else val = '';
    if (val !== '') celle[c[1]] = val;
  }
  if (Object.keys(celle).length) righe.push(celle);
}

console.log(`righe: ${righe.length}`);
const colonne = [...new Set(righe.flatMap((r) => Object.keys(r)))].sort((a, b) => (a.length - b.length) || a.localeCompare(b));
console.log(`colonne: ${colonne.join(', ')}\n`);
for (const r of righe.slice(0, RIGHE)) {
  console.log('  ' + colonne.map((c) => r[c] ? `${c}=${String(r[c]).replace(/\n/g, ' ').slice(0, 30)}` : '').filter(Boolean).join('  |  '));
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(righe)); console.log(`\nsalvate ${righe.length} righe in ${OUT}`); }

/*
 * Costruisce la tabella mMonsterID -> nome giapponese del mostro, partendo dai
 * MATERIALI: in Monster Hunter si chiamano "<mostro>の甲殻", "<mostro>の鱗"...
 * e il foglio new_item_material ne indica il mMonsterID.
 *
 *   node build-monster-table.cjs <cartella-xlsx-scompattata>
 *
 * Se mMonsterID usa lo stesso spazio di numeri di mBossList.mEnemyID delle
 * quest, questa tabella copre anche le quest che il mostro non lo nominano.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];

function dec(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}

const ss = [];
const xml = fs.readFileSync(path.join(dir, 'xl', 'sharedStrings.xml'), 'utf8');
for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  let t = '';
  for (const x of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += x[1];
  ss.push(dec(t));
}

const sheet = fs.readFileSync(path.join(dir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
const righe = [];
for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const celle = {};
  for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
    const vm = c[3].match(/<v>([\s\S]*?)<\/v>/);
    const im = c[3].match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
    let v;
    if (im) v = dec(im[1]);
    else if (vm) v = c[2] === 's' ? (ss[parseInt(vm[1], 10)] ?? '') : dec(vm[1]);
    else v = '';
    if (v !== '') celle[c[1]] = v;
  }
  if (Object.keys(celle).length) righe.push(celle);
}

const dati = righe.slice(1); // salta l'intestazione
console.log(`materiali nel foglio: ${dati.length}`);

const conMostro = dati.filter((r) => r.F && r.F !== '0');
console.log(`con mMonsterID valorizzato: ${conMostro.length}`);

// I nomi materiale sono tipo "リオレウスの甲殻": la parte prima di の e' il mostro.
// Vanno tolti i prefissi fra 【】 e i suffissi di grado.
function nomeMostro(itemName) {
  let s = String(itemName || '').replace(/【[^】]*】/g, '').trim();
  const m = s.match(/^([^\sの]+)の/);
  if (!m) return null;
  return m[1];
}

const voti = new Map();
for (const r of conMostro) {
  const n = nomeMostro(r.D);
  if (!n) continue;
  const id = String(r.F);
  if (!voti.has(id)) voti.set(id, new Map());
  const v = voti.get(id);
  v.set(n, (v.get(n) || 0) + 1);
}

const tabella = {};
let solidi = 0;
for (const [id, v] of voti) {
  const ord = [...v.entries()].sort((a, b) => b[1] - a[1]);
  const tot = ord.reduce((t, x) => t + x[1], 0);
  if (ord[0][1] / tot >= 0.5) { tabella[id] = ord[0][0]; solidi++; }
}

console.log(`\nmMonsterID distinti          : ${voti.size}`);
console.log(`corrispondenze solide (>=50%): ${solidi}`);
console.log('\n=== prime 40 ===');
Object.entries(tabella).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 40)
  .forEach(([id, n]) => console.log(`  monster ${String(id).padStart(5)} -> ${n}`));

fs.writeFileSync('/t/monster-id-jp.json', JSON.stringify(tabella, null, 1));
console.log(`\nsalvata in tools-js/monster-id-jp.json`);

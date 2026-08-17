/*
 * Esplora il foglio: nomi di collaborazione, mappe (colonna H), continenti.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/explore-sheet.cjs
 */
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
}
function eMostro(n) {
  const s = pulisci(n);
  if (!s) return false;
  return !/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|gathering|^\?/i.test(s);
}

console.log('=== nomi che sembrano collaborazioni o edizioni speciali ===');
const chiavi = /fate|kitty|christmas|xmas|santa|new year|halloween|evangelion|unit-01|ffbe|basara|valentine|easter|summer|eva|collab|anniversary|wedding|chocolate|choco|pumpkin/i;
const collab = {};
for (const r of righe) {
  if (!eMostro(r.G)) continue;
  const n = pulisci(r.G);
  if (!chiavi.test(n)) continue;
  if (!collab[n]) collab[n] = { n: 0, lands: new Set(), mappe: new Set() };
  collab[n].n++;
  collab[n].lands.add(r.B);
  if (r.H) collab[n].mappe.add(r.H);
}
Object.entries(collab).sort((a, b) => b[1].n - a[1].n).slice(0, 45)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(44)} ${String(v.n).padStart(3)}  ${[...v.lands].sort().join(',')}`));

console.log('\n=== nomi mappa (colonna H) piu' + "'" + ' frequenti ===');
const mappe = {};
for (const r of righe) { const h = String(r.H || '').trim(); if (h) mappe[h] = (mappe[h] || 0) + 1; }
Object.entries(mappe).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(38)} ${v}`));

console.log('\n=== blocchi per continente (solo quelli con mostro) ===');
const perLand = {};
for (const r of righe) { if (!eMostro(r.G)) continue; perLand[r.B] = (perLand[r.B] || 0) + 1; }
console.log('  ' + Object.entries(perLand).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));

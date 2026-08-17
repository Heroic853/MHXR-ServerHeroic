/*
 * Il foglio mst_block_ids copre i blocchi che servono agli eventi?
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-sheet-coverage.cjs
 */
const fs = require('fs');

const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
const eventBlocks = require('/app/dist/json/questDB/event.blocks.json');

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim();
}
function eMostro(n) {
  const s = pulisci(n);
  if (!s) return false;
  return !/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|^\?/i.test(s);
}

const perHash = new Map();
for (const r of righe) {
  const h = Number(r.F);
  if (h && !isNaN(h)) perHash.set(h, { nome: r.A, nota: r.G || '', mappa: r.H || '', land: r.B, map: r.C, area: r.D });
}

console.log(`blocchi nel foglio        : ${perHash.size}`);
console.log(`hash usati dagli eventi   : ${eventBlocks.length}`);

const coperti = eventBlocks.filter((h) => perHash.has(Number(h)));
const conMostro = coperti.filter((h) => eMostro(perHash.get(Number(h)).nota));
console.log(`\n=== copertura degli event.blocks ===`);
console.log(`  presenti nel foglio     : ${coperti.length}/${eventBlocks.length}  (${Math.round(coperti.length / eventBlocks.length * 100)}%)`);
console.log(`  di cui con un mostro    : ${conMostro.length}`);

// quali continenti copre il foglio
const perLand = {};
for (const v of perHash.values()) perLand[v.land] = (perLand[v.land] || 0) + 1;
console.log(`\n=== continenti nel foglio ===`);
console.log('  ' + Object.entries(perLand).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));

// elenco dei mostri annotati
const mostri = {};
for (const v of perHash.values()) {
  if (!eMostro(v.nota)) continue;
  const n = pulisci(v.nota);
  mostri[n] = (mostri[n] || 0) + 1;
}
const ord = Object.entries(mostri).sort((a, b) => b[1] - a[1]);
console.log(`\n=== mostri annotati: ${ord.length} distinti ===`);
ord.slice(0, 40).forEach(([k, v]) => console.log(`  ${k.padEnd(30)} ${v} blocchi`));

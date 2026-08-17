/*
 * Elenca i nomi mostro del foglio, per capire come sono scritte le varianti.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/list-variants.cjs [filtro]
 */
const fs = require('fs');

const filtro = (process.argv[2] || '').toLowerCase();
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

const conta = {};
const perLand = {};
for (const r of righe) {
  if (!eMostro(r.G)) continue;
  const m = pulisci(r.G);
  if (filtro && !m.includes(filtro)) continue;
  conta[m] = (conta[m] || 0) + 1;
  if (!perLand[m]) perLand[m] = new Set();
  perLand[m].add(r.B);
}

const ord = Object.entries(conta).sort((a, b) => b[1] - a[1]);
console.log(`nomi distinti${filtro ? ` contenenti "${filtro}"` : ''}: ${ord.length}\n`);
for (const [nome, n] of ord.slice(0, 60)) {
  console.log(`  ${nome.padEnd(34)} ${String(n).padStart(3)} blocchi   continenti: ${[...perLand[nome]].sort().join(',')}`);
}

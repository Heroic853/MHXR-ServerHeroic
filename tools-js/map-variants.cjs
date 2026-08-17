/*
 * Per ogni mostro, elenca le varianti presenti nel foglio: serve ad agganciare
 * i suffissi giapponesi (煉獄種, 聖夜種, 烈水種...) al nome inglese giusto.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/map-variants.cjs
 */
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
}

const BASI = ['agnaktor', 'lagombi', 'nargacuga', 'gigginox', 'uragaan', 'mizutsune',
  'rathian', 'lagiacrus', 'zinogre', 'kirin', 'brachydios', 'duramboros', 'rathalos',
  'plesioth', 'barioth', 'tigrex', 'diablos', 'volvidon', 'qurupeco', 'barroth'];

for (const b of BASI) {
  const varianti = new Map();
  for (const r of righe) {
    const n = pulisci(r.G);
    if (!n.includes(b)) continue;
    // tengo solo la parte "pulita": scarto le annotazioni fra parentesi
    const base = n.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    if (!base || /[,&>]| and | with /.test(base)) continue;
    varianti.set(base, (varianti.get(base) || 0) + 1);
  }
  if (varianti.size <= 1) continue;
  const ord = [...varianti.entries()].sort((a, b2) => b2[1] - a[1]);
  console.log(`\n${b}:`);
  ord.slice(0, 10).forEach(([k, v]) => console.log(`    ${k.padEnd(36)} ${v}`));
}

/*
 * Quali dei mostri che mi mancano esistono davvero nel foglio?
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-names.cjs
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

const note = [];
for (const r of righe) if (eMostro(r.G)) note.push({ n: pulisci(r.G), land: r.B });

const cerca = [
  'akantor', 'akura', 'gammoth', 'glavenus', 'agnaktor', 'chameleos', 'teostra',
  'nibelsnarf', 'moldomunt', 'kirin', 'khezu', 'gravios', 'basarios', 'monoblos',
  'kushala', 'lagombi', 'rajang', 'deviljho', 'brachydios', 'apypos', 'goruru',
  'ankator', 'seregios', 'shagaru', 'astalos', 'mizutsune', 'gore magala',
  'baggi', 'wroggi', 'bulldrome', 'bullfango', 'delex', 'garmat', 'garmd',
  'garudia', 'kelbi', 'aptonoth', 'velociprey', 'genprey', 'ioprey', 'cephadrome',
  'daimyo', 'shen', 'yian', 'kut-ku', 'gypceros', 'plesioth', 'tigrex', 'nargacuga',
];

console.log('mostro cercato        blocchi   continenti');
for (const c of cerca) {
  const trovati = note.filter((x) => x.n.includes(c));
  if (!trovati.length) { console.log(`  ${c.padEnd(20)} --- assente`); continue; }
  const lands = [...new Set(trovati.map((t) => t.land))].sort().join(',');
  const varianti = [...new Set(trovati.map((t) => t.n))].slice(0, 3).join(' | ');
  console.log(`  ${c.padEnd(20)} ${String(trovati.length).padStart(4)}   ${lands}`);
  console.log(`  ${''.padEnd(20)}        es: ${varianti.slice(0, 90)}`);
}

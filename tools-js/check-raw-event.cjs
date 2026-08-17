/*
 * Il boss delle quest evento e' davvero assente, o si e' perso nell'import?
 * Nel file grezzo mBossList ha la forma { mAutoDelete, classref_: { mpArray: [...] } }
 * mentre nel database e' finito come [null].
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-raw-event.cjs
 */
const fs = require('fs');
const path = require('path');
const DIR = '/app/dist/json/questDB';

const d = JSON.parse(fs.readFileSync(path.join(DIR, 'event.extended.json'), 'utf8'));
const lista = d?.rQuestSheet?.mQuestDataList || [];
console.log(`event.extended.json: ${lista.length} quest\n`);

console.log('=== mBossList grezzo delle prime quest evento ===');
for (const q of lista.slice(0, 4)) {
  console.log(`\n  ${q.mDefineId}  "${String(q.mQuestName).replace(/\n/g, ' ')}"`);
  console.log('    ' + JSON.stringify(q.mBossList));
}

// quante quest hanno un mEnemyID valorizzato dentro quella struttura?
function estraiBoss(mBossList) {
  const arr = mBossList?.classref_?.mpArray ?? mBossList?.array?.mpArray ?? (Array.isArray(mBossList) ? mBossList : null);
  if (!Array.isArray(arr)) return null;
  // la struttura e' un array di oggetti a chiave singola: [{mEnemyID}, {mAreaNo}, {mFieldSkillPackId}]
  const unito = {};
  for (const e of arr) if (e && typeof e === 'object') Object.assign(unito, e);
  return Object.keys(unito).length ? unito : null;
}

let conNemico = 0, senza = 0;
const esempi = [];
const nemici = {};
for (const q of lista) {
  const b = estraiBoss(q.mBossList);
  if (b && b.mEnemyID && b.mEnemyID !== '0') {
    conNemico++;
    nemici[b.mEnemyID] = (nemici[b.mEnemyID] || 0) + 1;
    if (esempi.length < 6) esempi.push(`  ${q.mDefineId}  enemy=${b.mEnemyID} area=${b.mAreaNo}  "${String(q.mQuestName).replace(/\n/g, ' ')}"`);
  } else senza++;
}

console.log(`\n=== risultato ===`);
console.log(`  quest evento con mEnemyID valorizzato : ${conNemico}`);
console.log(`  senza                                 : ${senza}`);

if (esempi.length) {
  console.log('\n=== esempi ===');
  esempi.forEach((e) => console.log(e));
  const ord = Object.entries(nemici).sort((a, b) => b[1] - a[1]);
  console.log(`\n  ${ord.length} nemici distinti. I piu' usati: ${ord.slice(0, 12).map(([k, v]) => `${k}(${v})`).join(' ')}`);
}

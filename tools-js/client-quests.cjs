/*
 * Legge la tabella quest del CLIENT (event.qsht estratto da rsdnt_quest.arc) e
 * la confronta con quella nel database del server.
 *
 *   docker run --rm -v "<extracted-quest>:/q:ro" -v "<tools-js>:/t:ro" apypos-dev \
 *     sh -c 'cd /q/data && node /t/client-quests.cjs "$(ls | grep questData.event.qsht)"'
 *
 * Scoperta chiave: la tabella del client NON contiene mBlocks (quelli li manda
 * solo il server) ma contiene mMapID e mBossList. Se nel database del server
 * mMapID e' 0 mentre qui ha un valore vero, allora anche quel campo si e' perso
 * nell'import — ed e' il campo che dice su quale mappa deve svolgersi la caccia.
 */
const fs = require('fs');
const { parseXfs } = require('/t/xfs-parse.cjs');

const doc = parseXfs(fs.readFileSync(process.argv[2]));
const lista = doc.root?.mQuestDataList?.mpArray || [];
console.log(`quest nella tabella del client: ${lista.length}\n`);

function boss(q) {
  const a = q.mBossList?.mpArray;
  if (!a) return [];
  return (Array.isArray(a) ? a : [a]).filter((b) => b && b.mEnemyID !== undefined);
}

console.log('=== prime 12 quest ===');
for (const q of lista.slice(0, 12)) {
  const bs = boss(q).map((b) => `em=${b.mEnemyID}/area=${b.mAreaNo}`).join(' + ') || 'nessuno';
  const nome = String(q.mQuestName || '').replace(/\n/g, ' ').slice(0, 26);
  console.log(`  id=${String(q.mQuestID).padStart(10)}  map=${String(q.mMapID).padStart(3)}  randomBlock=${q.mbRandomBlock ? 'si' : 'no'}  ${bs.padEnd(28)} "${nome}"`);
}

const mappe = {};
let conBoss = 0, randomBlock = 0;
for (const q of lista) {
  mappe[q.mMapID] = (mappe[q.mMapID] || 0) + 1;
  if (boss(q).length) conBoss++;
  if (q.mbRandomBlock) randomBlock++;
}

console.log(`\n=== statistiche ===`);
console.log(`  quest con boss definito : ${conBoss}/${lista.length}`);
console.log(`  quest con mbRandomBlock : ${randomBlock}`);
console.log(`  mMapID distinti         : ${Object.keys(mappe).length}`);
console.log(`  distribuzione (prime 15): ${Object.entries(mappe).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}:${v}`).join('  ')}`);

if (process.argv.includes('--dump')) {
  const out = lista.map((q) => ({
    mQuestID: String(q.mQuestID),
    mMapID: q.mMapID,
    mbRandomBlock: !!q.mbRandomBlock,
    boss: boss(q).map((b) => ({ mEnemyID: String(b.mEnemyID), mAreaNo: String(b.mAreaNo), mFieldSkillPackId: String(b.mFieldSkillPackId) })),
  }));
  fs.writeFileSync('/t/client-event-quests.json', JSON.stringify(out));
  console.log(`\nsalvate ${out.length} quest in tools-js/client-event-quests.json`);
}

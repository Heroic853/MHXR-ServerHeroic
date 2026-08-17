/*
 * event.extended.json contiene i mBlocks gia' calcolati?
 * Se si', il seed usa il file sbagliato (usa .blank.json) e basta ripopolare da qui.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-extended.js
 */
const fs = require('fs');
const path = require('path');
const DIR = '/app/dist/json/questDB';

for (const f of ['event.extended.json', 'event.extended.blank.json', 'ticket.extended.complete.json', 'score.extended.complete.json', 'eternal.extended.complete.json']) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log(`${f}: assente`); continue; }
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.log(`${f}: non parsabile (${e.message})`); continue; }
  const lista = d?.rQuestSheet?.mQuestDataList;
  if (!Array.isArray(lista)) { console.log(`${f}: struttura inattesa`); continue; }

  const conBlocchi = lista.filter((q) => Array.isArray(q.mBlocks) && q.mBlocks.length > 0);
  const conDefine = lista.filter((q) => q.mDefineId && String(q.mDefineId).length > 0);
  console.log(`\n${f}`);
  console.log(`  quest              : ${lista.length}`);
  console.log(`  CON mBlocks pieni  : ${conBlocchi.length}`);
  console.log(`  con mDefineId      : ${conDefine.length}`);
  if (conBlocchi.length) {
    const e = conBlocchi[0];
    console.log(`  esempio: ${e.mDefineId} "${String(e.mQuestName).replace(/\n/g, ' ')}" -> ${JSON.stringify(e.mBlocks)}`);
    const distribuzione = {};
    for (const q of conBlocchi) { const n = q.mBlocks.length; distribuzione[n] = (distribuzione[n] || 0) + 1; }
    console.log(`  blocchi per quest  : ${Object.entries(distribuzione).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join('  ')}`);
  }
}

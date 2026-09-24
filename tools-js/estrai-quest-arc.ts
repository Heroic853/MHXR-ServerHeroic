import fs from 'node:fs';
import { parseFpk } from '../src/tools/fpk/formats/fpk.js';

const fpk = parseFpk(fs.readFileSync('../src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk.jp-backup'));
for (const nome of ['/arc_cmn/resident/rsdnt_quest.arc', '/arc_cmn/resident/rsdnt_quest_block.arc', '/arc_cmn/resident/rsdnt_scenario.arc']) {
  const e = fpk.entries.find((x) => x.filePath === nome);
  if (!e) { console.log('non trovato:', nome); continue; }
  const dest = nome.split('/').pop()!;
  fs.writeFileSync(dest, e.data);
  console.log('estratto', dest, e.data.length, 'byte');
}

/*
 * Trova TUTTI i suffissi variante giapponesi usati nei titoli delle quest, per
 * scoprire quali non sto ancora mappando (es. il Purgatory Agnaktor).
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/find-variants.cjs
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

// quelli che gia' gestisco
const NOTI = ['豪火種', '凍氷種', '獄雷種', '冥晶種', '激流種', '南瓜種', '砂塵種',
  '深海種', '碧翠種', '銀嶺種', '金雷種', '亜種', '希少種'];

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const quest = await qs.find({ mDefineId: /^EVENT/ }).project({ mQuestName: 1, mMostro: 1, mMostroVoluto: 1 }).toArray();

  // tutte le sequenze che finiscono con 種
  const specie = {};
  for (const q of quest) {
    for (const m of String(q.mQuestName || '').matchAll(/([一-龯ァ-ヿ]{1,5}種)/g)) {
      specie[m[1]] = (specie[m[1]] || 0) + 1;
    }
  }
  console.log('=== suffissi "種" nei titoli ===');
  Object.entries(specie).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(3)}  ${NOTI.includes(k) ? 'gia\' gestito' : '<<< NON GESTITO'}`);
  });

  // altri marcatori fra parentesi giapponesi che potrebbero indicare varianti
  console.log('\n=== marcatori 【...】 non di difficolta\' ===');
  const DIFF = /^(初級|中級|上級|特級|極級|超極級|絶級|超絶級|測定不能|テスト|ソロ限定|マルチ限定|非常事態|財宝級|\?\?\?級)/;
  const marc = {};
  for (const q of quest) {
    for (const m of String(q.mQuestName || '').matchAll(/【([^】]+)】/g)) {
      if (DIFF.test(m[1])) continue;
      marc[m[1]] = (marc[m[1]] || 0) + 1;
    }
  }
  Object.entries(marc).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(24)} ${v}`));

  // parole che seguono direttamente il nome di un mostro
  console.log('\n=== altri modificatori ricorrenti ===');
  const mod = {};
  for (const q of quest) {
    for (const m of String(q.mQuestName || '').matchAll(/(炸裂個体|強個体|弱体化|改|真|狂|覚醒|変異|特殊個体)/g)) {
      mod[m[1]] = (mod[m[1]] || 0) + 1;
    }
  }
  Object.entries(mod).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

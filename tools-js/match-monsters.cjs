/*
 * Collega ogni quest evento al suo mostro, incrociando il nome giapponese della
 * quest con le annotazioni inglesi del foglio mst_block_ids.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/match-monsters.cjs
 *
 * Il foglio dice quale mostro c'e' in ogni blocco; il nome della quest dice quale
 * mostro promette. Unendo i due si sa quali blocchi mandare.
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

// Katakana -> nome inglese. Coprono i mostri di Monster Hunter presenti in MHXR.
const MOSTRI = {
  'リオレウス': 'rathalos', 'リオレイア': 'rathian', 'ティガレックス': 'tigrex',
  'ナルガクルガ': 'nargacuga', 'ジンオウガ': 'zinogre', 'ウラガンキン': 'uragaan',
  'ガノトトス': 'plesioth', 'ベリオロス': 'barioth', 'ラギアクルス': 'lagiacrus',
  'ギギネブラ': 'gigginox', 'クシャルダオラ': 'kushala daora', 'キリン': 'kirin',
  'タマミツネ': 'mizutsune', 'ゴア・マガラ': 'gore magala', 'ゴアマガラ': 'gore magala',
  'ラージャン': 'rajang', 'セレギオス': 'seregios', 'チャナガブル': 'nibelsnarf',
  'ドスジャギィ': 'great jaggi', 'ジャギィ': 'jaggi', 'ドスファンゴ': 'bulldrome',
  'アオアシラ': 'arzuros', 'ラングロトラ': 'lagombi', 'ウルクスス': 'volvidon',
  'ロアルドロス': 'royal ludroth', 'ルドロス': 'ludroth', 'クルペッコ': 'qurupeco',
  'ボルボロス': 'barroth', 'ドボルベルク': 'duramboros', 'ディアブロス': 'diablos',
  'ブラキディオス': 'brachydios', 'イビルジョー': 'deviljho', 'ドスイーオス': 'great iodrome',
  'ドスゲネポス': 'great gendrome', 'ドスガレオス': 'cephadrome', 'グラビモス': 'gravios',
  'バサルモス': 'basarios', 'フルフル': 'khezu', 'モノブロス': 'monoblos',
  'クックル': 'kokoto', 'ドスジャギー': 'great jaggi', 'ドスランポス': 'great velociprey',
  'ゴルル': 'goruru', 'アンカトル': 'ankator', 'アピュポス': 'apypos',
  'エオ・ガルディア': 'eo garudia', 'エオガルディア': 'eo garudia',
  'ネフ・ガルムド': 'nef garmd', 'ネフガルムド': 'nef garmd',
  'ドスグリード': 'great wroggi', 'ドスフロギィ': 'great wroggi',
};

// prefissi/varianti che compaiono nei nomi giapponesi
const VARIANTI = {
  '亜種': 'subspecies', '希少種': 'rare species', '豪火種': 'blaze', '凍氷種': 'frost',
  '獄雷種': 'thunder', '冥晶種': 'crystal', '南瓜種': 'pumpkin',
};

function pulisci(n) {
  return String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
}
function eMostro(n) {
  const s = pulisci(n);
  if (!s) return false;
  return !/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|gathering|^\?/i.test(s);
}

(async () => {
  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const blocchi = [];
  for (const r of righe) {
    const h = Number(r.F);
    if (!h || isNaN(h) || !eMostro(r.G)) continue;
    blocchi.push({ hash: h, nome: r.A, mostro: pulisci(r.G), land: r.B, map: r.C, area: r.D });
  }
  console.log(`blocchi con mostro nel foglio: ${blocchi.length}`);

  // indice mostro -> blocchi
  const perMostro = new Map();
  for (const b of blocchi) {
    if (!perMostro.has(b.mostro)) perMostro.set(b.mostro, []);
    perMostro.get(b.mostro).push(b);
  }
  console.log(`mostri distinti (normalizzati): ${perMostro.size}`);

  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');
  const eventi = await qs.find({ mDefineId: /^EVENT/ }).project({ mDefineId: 1, mQuestName: 1, mBossList: 1, mBlocks: 1 }).toArray();

  let riconosciute = 0, senzaNome = 0;
  const perEnemyId = new Map(); // mEnemyID -> conteggio nomi mostro dedotti
  const esempi = [];

  for (const q of eventi) {
    const nome = String(q.mQuestName || '');
    let trovato = null;
    for (const [jp, en] of Object.entries(MOSTRI)) {
      if (nome.includes(jp)) { trovato = en; break; }
    }
    if (!trovato) { senzaNome++; continue; }
    riconosciute++;

    // quale mEnemyID ha questa quest? cosi' si costruisce la tabella id->nome
    for (const b of q.mBossList || []) {
      const id = String(b?.mEnemyID ?? '');
      if (!id) continue;
      if (!perEnemyId.has(id)) perEnemyId.set(id, new Map());
      const m = perEnemyId.get(id);
      m.set(trovato, (m.get(trovato) || 0) + 1);
    }

    if (esempi.length < 10) {
      const disponibili = perMostro.get(trovato)?.length || 0;
      esempi.push(`  "${nome.replace(/\n/g, ' ').slice(0, 30)}" -> ${trovato}  (${disponibili} blocchi nel foglio)`);
    }
  }

  console.log(`\n=== quest evento ===`);
  console.log(`  con mostro riconosciuto dal nome : ${riconosciute}/${eventi.length}`);
  console.log(`  senza                            : ${senzaNome}`);
  console.log('\nesempi:');
  esempi.forEach((e) => console.log(e));

  // tabella mEnemyID -> mostro, dedotta
  const tabella = {};
  let solidi = 0;
  for (const [id, m] of perEnemyId) {
    const ord = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const tot = ord.reduce((t, x) => t + x[1], 0);
    if (ord[0][1] / tot >= 0.7 && tot >= 2) { tabella[id] = ord[0][0]; solidi++; }
  }
  console.log(`\n=== tabella mEnemyID -> mostro dedotta dai nomi ===`);
  console.log(`  corrispondenze solide: ${solidi}`);
  const mostraTab = Object.entries(tabella).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 30);
  mostraTab.forEach(([id, n]) => console.log(`  enemy ${String(id).padStart(4)} -> ${n}`));

  fs.writeFileSync('/app/tools/enemy-names.json', JSON.stringify(tabella, null, 1));
  console.log(`\nsalvata in tools-js/enemy-names.json`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

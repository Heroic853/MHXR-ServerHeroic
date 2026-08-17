/*
 * Assegna a ogni quest evento i blocchi che contengono il mostro giusto, con la
 * variante giusta, sulla mappa giusta. Sorgente: il foglio mst_block_ids.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fix-monsters.cjs --dry
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/fix-monsters.cjs
 *   ... --undo      rimette i blocchi salvati in mBlocksPrima
 *
 * DUE PASSAGGI, per coprire piu' quest possibile:
 *   1. quelle che nominano il mostro nel titolo -> match diretto
 *   2. da quelle si deduce mEnemyID -> mostro, e la tabella copre le altre
 *
 * SCELTA DEL BLOCCO, a punteggio:
 *   variante esatta (豪火種 = flame, 亜種 = sottospecie...) > nome base
 *   continente giusto (EVENT90xxxx -> l90)
 *   "(easy)" solo per le quest 初級
 *   penalizzate le righe "hunter X (hp: ...)" e le combinazioni "A and B"
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const DRY = process.argv.includes('--dry');
const UNDO = process.argv.includes('--undo');

// Nomi verificati uno per uno contro il foglio: ci sono solo quelli che
// hanno davvero dei blocchi. Khezu, Gravios, Basarios, Monoblos e Bulldrome
// non compaiono nel foglio e quindi non sono elencati.
const MOSTRI = {
  'リオレウス': 'rathalos', 'リオレイア': 'rathian', 'ティガレックス': 'tigrex',
  'ナルガクルガ': 'nargacuga', 'ジンオウガ': 'zinogre', 'ウラガンキン': 'uragaan',
  'ガノトトス': 'plesioth', 'ベリオロス': 'barioth', 'ラギアクルス': 'lagiacrus',
  'ギギネブラ': 'gigginox', 'クシャルダオラ': 'kushala daora', 'キリン': 'kirin',
  'タマミツネ': 'mizutsune', 'ゴア・マガラ': 'gore magala', 'ゴアマガラ': 'gore magala',
  'シャガルマガラ': 'shagaru magala', 'ラージャン': 'rajang',
  'セルレギオス': 'seregios', 'セレギオス': 'seregios',
  'ハプルボッカ': 'nibelsnarf', 'チャナガブル': 'nibelsnarf',
  'アカムトルム': 'akantor', 'ガムート': 'gammoth', 'ディノバルド': 'glavenus',
  'ライゼクス': 'astalos', 'アグナコトル': 'agnaktor', 'オオナズチ': 'chameleos',
  'テオ・テスカトル': 'teostra', 'テオテスカトル': 'teostra',
  'ドスアピポス': 'great apypos', 'アピュポス': 'apypos',
  'ゴルル': 'goruru', 'アンカトル': 'ankator',
  'エオ・ガルディア': 'eo garudia', 'エオガルディア': 'eo garudia',
  'ネフ・ガルムド': 'nef-garmat', 'ネフガルムド': 'nef-garmat',
  'ドスジャギィ': 'great jaggi', 'ジャギィ': 'jaggi',
  'ドスバギィ': 'great baggi', 'バギィ': 'baggi',
  'ドスフロギィ': 'great wroggi', 'ドスグリード': 'great wroggi', 'フロギィ': 'wroggi',
  'ドスファンゴ': 'bullfango', 'ファンゴ': 'bullfango',
  'アオアシラ': 'arzuros', 'ラングロトラ': 'lagombi', 'ウルクスス': 'volvidon',
  'ロアルドロス': 'royal ludroth', 'ルドロス': 'ludroth', 'クルペッコ': 'qurupeco',
  'ボルボロス': 'barroth', 'ドボルベルク': 'duramboros', 'ディアブロス': 'diablos',
  'ブラキディオス': 'brachydios', 'イビルジョー': 'deviljho', 'デルクス': 'delex',
  // originali MHXR e mostri minori, verificati nel foglio
  'モルドムント': 'morudomunto', 'アズガルムド': 'nef-garmat',
  'ガブル': 'gobul', 'ハプルボッカ2': 'gobul',
  'アイルー': 'melynx', 'メラルー': 'melynx', 'ドスイーオス': 'ioprey',
  'ケルビ': 'anteka', 'アプケロス': 'rhenoplos', 'ウロコトル': 'uroktor',
  'ブナハブラ': 'bnahabra', 'ランポス': 'jagras', 'ガーグァ': 'slagtoth',
};

// Il foglio e' compilato a mano e ha parecchi refusi: normalizzandoli qui, le
// righe sbagliate tornano agganciabili invece di restare inutilizzate.
const REFUSI = [
  [/\bzinorge\b/g, 'zinogre'], [/\bbarrioth\b/g, 'barioth'],
  [/\brathain\b/g, 'rathian'], [/\bchamelios\b/g, 'chameleos'],
  [/\bgolulu\b/g, 'goruru'], [/\bbulfangos?\b/g, 'bullfango'],
  [/\bjagi\b/g, 'jaggi'], [/\burgaan\b/g, 'uragaan'],
  [/\brphenlos\b/g, 'rhenoplos'], [/\bgold rath\b/g, 'gold rathian'],
  [/\bnarg green\b/g, 'green nargacuga'], [/\bsubspecies lagi\b/g, 'ivory lagiacrus'],
  [/\bazuros\b/g, 'arzuros'], [/\bjaggis\b/g, 'jaggi'], [/\bjaggia\b/g, 'jaggi'],
  // Chi ha compilato il foglio ha scritto lo stesso mostro in piu' modi. Ogni
  // grafia non riconosciuta e' un blocco che non viene mai scelto, quindi un
  // mostro che in gioco non compare: "unit 1" e "unit-01" sono la stessa Unita'
  // di Evangelion, e da sole valgono 7 blocchi in piu'.
  [/\bunit[ -]0?1\b/g, 'unit-01'], [/\bunit[ -]0?2\b/g, 'unit-02'],
  [/\bfierceawtter\b/g, 'fiercewater'],
  [/\bvolitile\b/g, 'volatile'], [/\bvolatiel\b/g, 'volatile'],
  [/\bthunderemperor\b/g, 'thunder emperor'],
];

/*
 * Suffissi variante giapponesi -> nome inglese, ricavati incrociando i titoli
 * delle quest con l'elenco ufficiale dei mostri di MHXR. Ogni voce e' stata
 * verificata contro il foglio: ci sono solo quelle che hanno blocchi veri.
 *
 * Attenzione a due coppie che si somigliano e vanno tenute distinte:
 *   烈水種 = Fiercewater (Nargacuga)   contro   激流種 = Whitewater (Plesioth)
 *   聖夜種 = Witch (Lagombi, evento di Natale)  contro  南瓜種 = Pumpkin (Halloween)
 */
const VARIANTI_ELEM = {
  '豪火種': 'flame',              // Flame Rathalos
  '凍氷種': 'frozen',             // Frozen Barioth
  '煉獄種': 'purgatory',          // Purgatory Agnaktor
  '烈水種': 'fiercewater',        // Fiercewater Nargacuga
  '激流種': 'whitewater',         // Whitewater Plesioth
  // "めで鯛種" e' un gioco di parole: medetai (di buon auspicio) scritto col
  // kanji di tai, l'orata di Capodanno. La wiki lo rende "Seabream Plesioth",
  // ma nel foglio la riga si chiama "plesioth (new year)".
  'めで鯛種': 'new year',
  '鯛種': 'new year',
  '輝岩種': 'shiningrock',        // Shiningrock Uragaan
  '劇毒種': 'virulent',           // Virulent Gigginox
  'ヨーガ種': 'yoga',             // Yoga Gigginox
  '雷泡種': 'thunderbubble',      // Thunderbubble Mizutsune
  '灼熱種': 'scorching heat',     // Scorching Heat Rathian
  '陸征種': 'landconquest',       // Landconquest Lagiacrus
  '不死種': 'immortal',           // Immortal Zinogre
  '雷帝種': 'thunder emperor',    // Thunder Emperor Kirin
  '爆氷種': 'iceblast',           // Iceblast Brachydios
  '峰爆種': 'explosive peak',     // Explosive Peak Duramboros
  '爆弾種': 'explosive peak',
  '滅竜種': 'destruction wyvern', // Destruction Wyvern Rathalos
  '聖夜種': 'witch',              // Witch Lagombi (Natale)
  '南瓜種': 'pumpkin',            // Pumpkin Uragaan (Halloween)
  '水忍種': 'fiercewater',        // altra acqua per Nargacuga
  '砂塵種': 'sand', '深海種': 'abyssal', '碧翠種': 'green',
  '銀嶺種': 'silver', '金雷種': 'gold', '獄雷種': 'stygian', '冥晶種': 'crystal',
};

// Eventi a tema e collaborazioni: nel foglio hanno un nome tutto loro
// ("christmas volvidon", "pumpkin uragaan", "unit-01 brachydios"), quindi il
// tema va riconosciuto dal titolo giapponese e anteposto al mostro.
const TEMI = {
  'クリスマス': 'christmas', 'サンタ': 'santa', 'ハロウィン': 'halloween',
  'かぼちゃ': 'pumpkin', '南瓜': 'pumpkin', 'お正月': 'new year', '正月': 'new year',
  'バレンタイン': 'valentines', '学園': 'gakuen', 'エヴァ': 'unit-01',
  'スイカ': 'watermelon', '西瓜': 'watermelon', 'チョコ': 'valentines',
  'ハロウィーン': 'halloween', 'サンクスギビング': 'thanksalot',
  // Collaborazioni: il titolo non nomina mai il mostro, nomina l'opera. Servono
  // come rete di sicurezza quando l'id nemico da solo non basta.
  '真の格闘家': 'yoga', 'ストV': 'yoga', 'ストⅤ': 'yoga',
  '鬼滅の刃': 'enma', '鬼狩り': 'enma', '鬼影': 'enma',
  'ハガレン': 'steel armor',
  'バイオハザード': 'rotten', 'バイオコラボ': 'rotten',
};

// I continenti della storia (l00-l18) hanno pochissimi blocchi evento e fra
// questi c'e' l'isola del tutorial: pescarli per una quest evento faceva
// partire la missione iniziale invece dell'evento. Si escludono.
const CONTINENTI_EVENTO = /^l(70|75|9\d)$/;

// Le arene non sono l'ambiente naturale: a parita' di mostro si preferisce la
// mappa vera (Deserted Island, Tundra, Volcano...).
const E_ARENA = /arena|battlequarters/i;

const SOTTOSPECIE = {
  rathalos: 'azure rathalos', rathian: 'pink rathian', nargacuga: 'green nargacuga',
  'royal ludroth': 'purple ludroth', lagiacrus: 'ivory lagiacrus', qurupeco: 'crimson qurupeco',
  duramboros: 'rust duramboros', zinogre: 'stygian zinogre', barioth: 'sand barioth',
  uragaan: 'steel uragaan', gigginox: 'baleful gigginox', diablos: 'black diablos',
  barroth: 'jade barroth', tigrex: 'brute tigrex', plesioth: 'green plesioth',
  agnaktor: 'glacial agnaktor', rajang: 'furious rajang', deviljho: 'savage deviljho',
};
const RARE = {
  rathalos: 'silver rathalos', rathian: 'gold rathian', nargacuga: 'lucent nargacuga',
  lagiacrus: 'abyssal lagiacrus',
};

/*
 * TABELLA AUTOREVOLE mEnemyID -> mostro.
 *
 * Ricavata da new_item_material.xlsx, che per ogni materiale indica il
 * mMonsterID e il nome giapponese ("<mostro>の甲殻"). Verificato che quel campo
 * usa lo stesso spazio di numeri di mBossList.mEnemyID delle quest: gli id
 * dedotti per altra via combaciano tutti (57=凍戈竜 Glacial Agnaktor,
 * 64=蒼火竜 Azure Rathalos, 65=銀火竜 Silver Rathalos...).
 *
 * I nomi giapponesi sono le classificazioni ufficiali, non i nomi in katakana:
 * si compongono di modificatore + specie (緑+迅竜 = green nargacuga).
 */
const ID_MOSTRO = {
  1: 'rathian', 2: 'rathalos', 3: 'qurupeco', 4: 'gigginox', 5: 'barioth',
  6: 'diablos', 7: 'deviljho', 8: 'barroth', 9: 'uragaan', 12: 'great jaggi',
  14: 'great baggi', 15: 'lagiacrus', 16: 'royal ludroth', 18: 'nibelsnarf',
  19: 'agnaktor', 41: 'zinogre', 42: 'arzuros', 43: 'lagombi', 44: 'volvidon',
  45: 'great wroggi', 46: 'duramboros', 47: 'gobul', 51: 'crimson qurupeco',
  52: 'baleful gigginox', 53: 'sand barioth', 54: 'frozen barioth',
  55: 'steel uragaan', 56: 'purple ludroth', 57: 'glacial agnaktor',
  58: 'black diablos', 59: 'nargacuga', 60: 'green nargacuga',
  61: 'lucent nargacuga', 63: 'gold rathian', 64: 'azure rathalos',
  65: 'silver rathalos', 66: 'plesioth', 67: 'green plesioth',
  68: 'ivory lagiacrus', 69: 'abyssal lagiacrus', 71: 'savage deviljho',
  72: 'stygian zinogre', 73: 'rust duramboros', 74: 'brachydios', 86: 'kirin',
  92: 'flame rathalos', 93: 'frozen barioth', 94: 'shiningrock uragaan',
  95: 'thunder emperor kirin', 96: 'whitewater plesioth',
  97: 'purgatory agnaktor', 98: 'immortal zinogre', 99: 'virulent gigginox',
  106: 'kushala daora', 109: 'explosive peak duramboros', 120: 'nef-garmat',
  132: 'iceblast brachydios', 150: 'fiercewater nargacuga',
  164: 'landconquest lagiacrus', 165: 'furious rajang', 311: 'tigrex',
  328: 'gore magala', 329: 'shagaru magala', 388: 'seregios', 523: 'rajang',
  525: 'chameleos', 527: 'teostra', 533: 'akantor', 580: 'glavenus',
  581: 'astalos', 582: 'mizutsune', 583: 'gammoth',

  // Id non presenti fra i materiali (i mostri delle collaborazioni non danno
  // materiali standard), identificati incrociando TUTTE le quest che li usano:
  90: 'goruru',              // "換金ゴルルーツアー" - tour dei Goruru
  133: 'unit-01 brachydios', // "使徒、襲来", "ニア・サードインパクト" - Evangelion
  162: 'unit-02 tigrex',     // "2号機、会敵！" - 2号機 e' letteralmente l'Unita' 02

  // Collaborazioni identificate incrociando i titoli giapponesi di TUTTE le
  // quest che usano lo stesso id. Il foglio dei blocchi ha i nomi inglesi da
  // sempre, ma nessuno li collegava a questi id, quindi i mostri non uscivano.
  140: 'yoga gigginox',      // Street Fighter: "SFV★5確定" e le sei difficolta'
                             // di "真の格闘家" (il vero artista marziale) usano
                             // il 140. Yoga e' Dhalsim.
  163: 'steel armor diablos',// Fullmetal Alchemist: "【ハガレン】異邦より来たる双刃"
                             // e "業を背負いし鋼" (l'acciaio che porta il peso
                             // della colpa) - 鋼 = acciaio, l'armatura di Alphonse.
  161: 'enma rajang',        // Demon Slayer: "【鬼滅の刃】爆裂の鬼狩り" e
                             // "月下の鬼影" (l'ombra del demone sotto la luna).
                             // 鬼 = demone, Enma e' il re degli inferi.
  155: 'rotten uragaan',     // Resident Evil: "【バイオハザードコラボ】
                             // リアル・サバイバル" e "サバイバル・ハロウィン".
                             // Prendeva steel uragaan: stessa famiglia, ma qui
                             // il tema sono gli zombie.
};

function pulisci(n) {
  let s = String(n || '').replace(/\s+/g, ' ').trim()
    .replace(/^\d+\s*x?\s*/i, '').replace(/\s*\d+$/, '').trim().toLowerCase();
  for (const [re, sub] of REFUSI) s = s.replace(re, sub);
  return s;
}
function eMostro(n) {
  const s = pulisci(n);
  if (!s) return false;
  return !/collection|node|dialog|dialolgue|treasur|tresur|coin|nothing|empty|none|gathering|^\?/i.test(s);
}

function leggiQuest(nome) {
  let base = null, lung = 0;
  // il piu' lungo vince: "ドスアピポス" prima di "アピュポス"
  for (const [jp, en] of Object.entries(MOSTRI)) {
    if (nome.includes(jp) && jp.length > lung) { base = en; lung = jp.length; }
  }
  if (!base) return null;
  let atteso = base;
  for (const [jp, en] of Object.entries(VARIANTI_ELEM)) {
    if (nome.includes(jp)) { atteso = `${en} ${base}`; break; }
  }
  if (atteso === base && nome.includes('亜種') && SOTTOSPECIE[base]) atteso = SOTTOSPECIE[base];
  if (atteso === base && nome.includes('希少種') && RARE[base]) atteso = RARE[base];

  // tema/collaborazione: ha la precedenza sulla variante elementale
  // 怒り喰らう ("che divora d'ira") e' il prefisso di Savage Deviljho: e' una
  // parola davanti al nome, non un suffisso 種, quindi va trattata a parte.
  if (nome.includes('怒り喰らう') || nome.includes('怒り喰ら')) atteso = `savage ${base}`;

  let tema = null;
  for (const [jp, en] of Object.entries(TEMI)) if (nome.includes(jp)) { tema = en; break; }
  if (tema) atteso = `${tema} ${base}`;

  return { base, atteso, tema, facile: nome.includes('初級') };
}

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  if (UNDO) {
    const docs = await qs.find({ mBlocksPrima: { $exists: true } }).project({ mBlocksPrima: 1 }).toArray();
    const ops = docs.map((d) => ({
      updateOne: { filter: { _id: d._id }, update: { $set: { mBlocks: d.mBlocksPrima }, $unset: { mBlocksPrima: '', mMostro: '', mMostroVoluto: '' } } },
    }));
    if (ops.length) await qs.bulkWrite(ops);
    console.log(`ripristinate ${ops.length} quest.`);
    await mongoose.disconnect();
    return;
  }

  const righe = JSON.parse(fs.readFileSync('/app/tools/mst-block-ids.json', 'utf8')).slice(1);
  const blocchi = [];
  const perMappa = new Map();
  for (const r of righe) {
    const h = Number(r.F);
    if (!h || isNaN(h)) continue;
    const mappa = `${r.B}_${r.C}`;
    if (!perMappa.has(mappa)) perMappa.set(mappa, []);
    perMappa.get(mappa).push({ hash: h, area: r.D, mappa });
    if (eMostro(r.G)) {
      blocchi.push({
        hash: h, nota: pulisci(r.G), land: r.B, mappa, area: r.D,
        ambiente: String(r.H || ''),           // "Deserted Island (Day)", "Land Arena"...
        arena: E_ARENA.test(String(r.H || '')),
      });
    }
  }

  function scegli(atteso, base, land, facile) {
    // Filtro sulla parola chiave finale, non sul nome base intero: la
    // sottospecie di "royal ludroth" si chiama "purple ludroth" e non contiene
    // "royal", quindi filtrando sul nome intero veniva scartata e si finiva
    // sempre sulla specie normale.
    const chiave = base.split(' ').pop();
    let migliore = null, max = -1e9;
    for (const b of blocchi) {
      // Mai blocchi dei continenti della storia: fra quei pochi c'e' l'isola
      // del tutorial, ed e' il motivo per cui partiva la missione iniziale.
      if (!CONTINENTI_EVENTO.test(b.land)) continue;
      const n = b.nota;
      if (!n.includes(chiave)) continue;
      let p = 0;
      if (n === atteso) p += 120;
      else if (n.startsWith(atteso + ' ')) p += 90;
      else if (n.includes(atteso)) p += 70;
      else if (atteso !== base) p -= 50;
      if (n === base) p += 35;
      if (/[,&]| and | with |>/.test(n)) p -= 30;
      if (/hunter .*hp:/.test(n)) p -= 70;        // versioni "hunter" con hp enormi
      if (/dead |ded /.test(n)) p -= 90;          // mostri gia' morti (scenografia)
      if (land && b.land === land) p += 55;
      if (b.arena) p -= 25;                        // habitat vero meglio dell'arena
      // Versioni depotenziate: hanno pochissima vita e il mostro muore in un
      // colpo. Vanno scelte solo per le quest 初級, mai per le altre.
      const easy = /\(easy\)|idle only|very easy|one shot|training quest/.test(n);
      if (easy && !facile) p -= 90; else if (easy && facile) p += 15;
      // "(tick: N)" e' la vita: sotto i 1000 il mostro crolla subito
      const tick = n.match(/tick:?\s*(\d+)/);
      if (tick && Number(tick[1]) < 1000 && !facile) p -= 45;
      p -= Math.min(n.length / 8, 10);
      if (p > max) { max = p; migliore = b; }
    }
    return migliore;
  }

  // Non solo EVENT: anche TICKE (quest a ticket), ETERN e SCORE sono contenuto
  // evento e hanno lo stesso problema. Restando fuori dal filtro si tenevano i
  // blocchi originali, che sono quelli dei continenti della storia — fra cui
  // l'isola del tutorial. E' il motivo per cui entrando in una quest a ticket
  // partiva la missione iniziale invece dell'evento.
  //
  // Le quest della storia (prefisso QUEST) restano escluse: funzionano, e
  // riassegnarle romperebbe 1995 missioni che vanno bene.
  const eventi = await qs.find({ mDefineId: /^(EVENT|TICKE|ETERN|SCORE)/ })
    .project({ mDefineId: 1, mQuestID: 1, mQuestName: 1, mBossList: 1, mBlocks: 1, mBlocksPrima: 1 }).toArray();

  // --- passaggio 1: match dal nome, e costruzione della tabella mEnemyID -> mostro
  const voti = new Map();
  const decisione = new Map();
  for (const q of eventi) {
    const info = leggiQuest(String(q.mQuestName || ''));
    if (!info) continue;
    decisione.set(String(q._id), info);
    for (const b of q.mBossList || []) {
      const id = String(b?.mEnemyID ?? '');
      if (!id) continue;
      if (!voti.has(id)) voti.set(id, new Map());
      const m = voti.get(id);
      m.set(info.base, (m.get(info.base) || 0) + 1);
    }
  }
  const tabellaId = {};
  for (const [id, m] of voti) {
    const ord = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const tot = ord.reduce((t, x) => t + x[1], 0);
    if (ord[0][1] / tot >= 0.7) tabellaId[id] = ord[0][0];
  }
  console.log(`passaggio 1: ${decisione.size} quest riconosciute dal nome`);
  console.log(`             ${Object.keys(tabellaId).length} corrispondenze mEnemyID -> mostro dedotte\n`);

  // --- passaggio 2: assegnazione
  let fatte = 0, senza = 0, daNome = 0, daId = 0, daPremio = 0;
  const daPremi = fs.existsSync('/app/tools/quest-monster.json')
    ? JSON.parse(fs.readFileSync('/app/tools/quest-monster.json', 'utf8')) : {};
  const ops = [];
  const esempi = [];

  for (const q of eventi) {
    const nome = String(q.mQuestName || '');
    let info = decisione.get(String(q._id));
    if (info) daNome++;
    else {
      // Prima la tabella autorevole dei materiali, che indica anche la variante
      // esatta; poi, come ripiego, quella dedotta dai titoli.
      for (const b of q.mBossList || []) {
        const id = Number(b?.mEnemyID);
        const uff = ID_MOSTRO[id];
        if (uff) {
          info = { base: uff.split(' ').pop(), atteso: uff, facile: nome.includes('初級') };
          daId++;
          break;
        }
      }
      if (!info) {
        for (const b of q.mBossList || []) {
          const t = tabellaId[String(b?.mEnemyID)];
          if (t) { info = { base: t, atteso: t, facile: nome.includes('初級') }; daId++; break; }
        }
      }
      // Ultimo ripiego: il mostro dedotto dalle RICOMPENSE della quest. I premi
      // di una caccia sono i materiali della preda, quindi il legame e' solido
      // anche quando il titolo tace e l'id nemico non e' in tabella.
      if (!info) {
        const mid = daPremi[String(q.mQuestID)];
        const uff = mid && ID_MOSTRO[Number(mid)];
        if (uff) {
          info = { base: uff.split(' ').pop(), atteso: uff, facile: nome.includes('初級') };
          daPremio++;
        }
      }
    }
    if (!info) { senza++; continue; }

    // Il continente sta nelle prime due cifre dopo il prefisso, e lo schema vale
    // per tutti e quattro i tipi. Se non si riesce a leggerlo si passa null: la
    // scelta resta comunque limitata ai continenti evento, quindi il peggio che
    // puo' capitare e' una mappa meno azzeccata, mai il tutorial.
    const ml = String(q.mDefineId || '').match(/^(?:EVENT|TICKE|ETERN|SCORE)(\d{2})/);
    const land = ml ? `l${ml[1]}` : null;
    const scelto = scegli(info.atteso, info.base, land, info.facile);
    if (!scelto) { senza++; continue; }

    const indici = (q.mBossList || []).map((b) => parseInt(b?.mAreaNo, 10)).filter((n) => !isNaN(n));
    const posizione = indici.length ? Math.max(...indici) : 1;

    /*
     * I blocchi prima del boss sono le fasi che il giocatore deve superare per
     * arrivarci. Prima si prendeva "il primo che capita" nella stessa mappa, e
     * fra quelli ci sono blocchi tutorial, di dialogo e di test: fasi che non si
     * chiudono mai. Risultato, la quest si piantava alla fase 1 e il boss —
     * che sta nell'ULTIMO blocco — non veniva mai raggiunto. Da fuori sembrava
     * un mostro sbagliato (si vedeva il riempitivo, cioe' la versione normale).
     *
     * Ora si ordinano: prima i blocchi di raccolta e i mostri piccoli, che si
     * chiudono da soli; mai quelli tutorial/dialogo/test.
     */
    const RIEMPITIVO_VIETATO = /tutorial|dialogue|dead|\btest\b|story|delete|hp:|hunter/i;
    const RIEMPITIVO_BUONO = /collection node|gathering node|mining|bug|honey|herb|jaggi|baggi|bnahabra|bullfango|anteka/i;

    const stessaMappa = (perMappa.get(scelto.mappa) || [])
      .filter((b) => b.hash !== scelto.hash && !RIEMPITIVO_VIETATO.test(b.nota || ''))
      .sort((a, b) => {
        const pa = RIEMPITIVO_BUONO.test(a.nota || '') ? 0 : 1;
        const pb = RIEMPITIVO_BUONO.test(b.nota || '') ? 0 : 1;
        return pa - pb;
      });
    // Se la mappa non offre niente di sicuro, meglio ripetere il blocco del boss
    // che infilare una fase che blocca la quest.
    const finali = [];
    const usate = new Set([scelto.area]);
    for (let i = 1; i <= posizione; i++) {
      if (i === posizione) { finali.push(scelto.hash); continue; }
      const r = stessaMappa.find((b) => !usate.has(b.area) && !finali.includes(b.hash))
        || stessaMappa.find((b) => !finali.includes(b.hash));
      finali.push(r ? r.hash : scelto.hash);
      if (r) usate.add(r.area);
    }

    if (esempi.length < 12 && info.atteso !== info.base) {
      esempi.push(`  "${nome.replace(/\n/g, ' ').slice(0, 24)}"  voluto ${info.atteso}  ->  ${scelto.nota.slice(0, 32)} [${scelto.mappa}]`);
    }
    fatte++;
    ops.push({
      updateOne: {
        filter: { _id: q._id },
        update: {
          $set: {
            mBlocks: finali, mMostro: scelto.nota, mMostroVoluto: info.atteso,
            mBlocksSource: 'foglio-mst_block_ids-v3',
            ...(q.mBlocksPrima ? {} : { mBlocksPrima: q.mBlocks || [] }),
          },
        },
      },
    });
  }

  console.log(`quest evento          : ${eventi.length}`);
  console.log(`  assegnate           : ${fatte}   (${daNome} dal nome, ${daId} dal mEnemyID, ${daPremio} dalle ricompense)`);
  console.log(`  senza corrispondenza: ${senza}`);
  console.log('\nesempi con variante:');
  esempi.forEach((e) => console.log(e));

  if (DRY) console.log('\n[dry] nessuna scrittura.');
  else if (ops.length) {
    const r = await qs.bulkWrite(ops);
    console.log(`\nsistemate ${r.modifiedCount} quest.`);
    console.log('Chiudi e riapri il gioco.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRORE:', e); process.exit(1); });

/*
 * Costruisce src/json/nyanken-categorie.json (le spedizioni dei gatti mostrate
 * nel gacha) e aggiunge l'elemento alle armi di src/json/nyanken-equip.json.
 * Tutto viene dai file del gioco, niente numeri scritti a mano:
 *
 * - le spedizioni (ID + nome) da rsdnt_property.arc :: tuning\xml\nyanken\nyankenQuest
 *   (972 voci): per ogni categoria si prende la PRIMA edizione;
 * - i banner da rsdnt_quest.arc :: bannerPath (mBannerID -> nome file). Solo
 *   dove l'abbinamento e' stato verificato a occhio sull'immagine del banner
 *   (vedi BANNER qui sotto); altrove 0 = nessun banner;
 * - l'elemento delle armi da rsdnt_weapon.arc :: weapon_*_series (mElement).
 *   Numerazione verificata sui mostri di EnemyList: 1 fuoco, 2 acqua,
 *   3 ghiaccio, 4 tuono, 5 terra. Le armature non hanno un elemento nei dati.
 *
 * Uso:  node tools-js/costruisci-nyanken-categorie.cjs <lib.cjs di apk_check/blk>
 */
const fs = require('fs');
const path = require('path');
const { parseXfs } = require('./xfs-parse.cjs');

const LIB = process.argv[2];
if (!LIB) { console.error('uso: node costruisci-nyanken-categorie.cjs <percorso lib.cjs>'); process.exit(1); }
const { parseFpk, parseArc } = require(LIB);

const REPO = path.join(__dirname, '..');
// Il pacchetto resident ORIGINALE (giapponese): i nomi delle spedizioni sono
// quelli del gioco, e la tabella banner non e' toccata dalla traduzione.
const RESIDENT = path.join(REPO, 'src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk.jp-backup');

// Le 13 categorie scelte (le piu' ricorrenti nella tabella del gioco) e il loro filtro premi.
const CATEGORIE = [
  { nome: '秘境探検クエスト', filtro: { tipo: 'tutti' } },
  { nome: '火属性装備クエスト', filtro: { tipo: 'armi', elemento: 1 } },
  { nome: '水属性装備クエスト', filtro: { tipo: 'armi', elemento: 2 } },
  { nome: '土属性装備クエスト', filtro: { tipo: 'armi', elemento: 5 } },
  { nome: '雷属性装備クエスト', filtro: { tipo: 'armi', elemento: 4 } },
  { nome: '氷属性装備クエスト', filtro: { tipo: 'armi', elemento: 3 } },
  { nome: '新武器クエスト', filtro: { tipo: 'armi' } },
  { nome: '新防具クエスト', filtro: { tipo: 'armature' } },
  { nome: '★6★7武器確定クエスト', filtro: { tipo: 'armi', rarita: [6, 7] } },
  { nome: '★6★7防具確定クエスト', filtro: { tipo: 'armature', rarita: [6, 7] } },
  { nome: '禁断の狩場クエスト', filtro: { tipo: 'tutti' } },
  { nome: '限定討伐クエスト', filtro: { tipo: 'tutti' } },
  { nome: '1周限定!限定討伐クエスト', filtro: { tipo: 'tutti' } },
];

// Banner verificati guardando le immagini (fogli generati il 29/09/2026):
// neko_10024 = "10回派遣で★6☆7武器確定", neko_10025 = "…★6☆7防具確定"
// (20 numeri banner ciascuno, come le 20 edizioni della categoria);
// neko_01209 = "限定討伐イベント 全島踏破★7武器確定".
//
// Senza banner una voce del gacha resta INVISIBILE nel gioco (visto il 29/09),
// quindi alle altre categorie va il banner piu' simile (scelta del gestore):
// per gli elementi il banner "X属性特集" dello stesso elemento (etichetta letta
// sull'immagine: …00 fuoco, …10 ghiaccio, …20 terra, …30 tuono, …40 acqua),
// per armi/armature nuove "全踏破で★7新武器確定" / "…新防具", per le generali il
// banner generale dei gatti nyan_99999 (9116, quello che il server usava prima).
const BANNER = {
  '秘境探検クエスト': 'nyan_99999',
  '火属性装備クエスト': 'neko_02003',
  '水属性装備クエスト': 'neko_01403',
  '土属性装備クエスト': 'neko_01203',
  '雷属性装備クエスト': 'neko_01303',
  '氷属性装備クエスト': 'neko_01103',
  '新武器クエスト': 'neko_01301',
  '新防具クエスト': 'neko_01302',
  '★6★7武器確定クエスト': 'neko_10024',
  '★6★7防具確定クエスト': 'neko_10025',
  '禁断の狩場クエスト': 'nyan_99999',
  '限定討伐クエスト': 'neko_01209',
  '1周限定!限定討伐クエスト': 'neko_01209',
};

(async () => {
  const fpk = parseFpk(fs.readFileSync(RESIDENT));
  const leggi = async (arcName, file) => {
    const x = fpk.find((y) => y.filePath.endsWith(arcName));
    const a = (await parseArc(x.data)).find((z) => z.name.split('\\').pop() === file);
    return parseXfs(a.data).root;
  };
  const spedizioni = (await leggi('rsdnt_property.arc', 'nyankenQuest')).mDataList.mpArray;
  const bannerPath = (await leggi('rsdnt_quest.arc', 'bannerPath')).mBannerPathList.mpArray;

  const out = CATEGORIE.map((c, idx) => {
    const edizioni = spedizioni.filter((q) => q.mQuestName === c.nome);
    if (!edizioni.length) throw new Error('categoria non trovata nel gioco: ' + c.nome);
    const b = BANNER[c.nome] ? bannerPath.find((p) => p.mBannerPath === BANNER[c.nome]) : null;
    if (BANNER[c.nome] && !b) throw new Error('banner non trovato nella tabella: ' + BANNER[c.nome]);
    return {
      mst_nyanken_id: edizioni[0].mQuestHash,
      nome: c.nome,
      mst_banner_id: b ? b.mBannerID : 0,
      ordine: idx + 1,
      filtro: c.filtro,
    };
  });
  const dest = path.join(REPO, 'src/json/nyanken-categorie.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('scritto', dest, '(' + out.length + ' categorie)');

  // Elemento delle armi e nome di ogni pezzo, dalle tabelle del gioco.
  const elemento = {};
  const nomeGioco = {};
  for (const arcName of ['rsdnt_weapon.arc', 'rsdnt_equip.arc']) {
    const ax = fpk.find((y) => y.filePath.endsWith(arcName));
    for (const a of await parseArc(ax.data)) {
      if (!/(weapon|equip)_\w+_series$/.test(a.name) || !a.data) continue;
      for (const d of parseXfs(a.data).root.mDataList.mpArray) {
        nomeGioco[d.mID] = d.mName ?? d.mNameMale;
        if (/weapon_/.test(a.name)) elemento[d.mID] = d.mElement;
      }
    }
  }
  const poolPath = path.join(REPO, 'src/json/nyanken-equip.json');
  // Fuori i segnaposto: nel gioco AD_*000 sono "腕装備無し" ecc. ("nessuna armatura").
  const SEGNAPOSTO = /装備無し|^dummy$/i;
  const tutti = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  const pool = tutti.filter((v) => !SEGNAPOSTO.test(String(nomeGioco[v.i] ?? '').trim()));
  console.log('segnaposto tolti dal pool:', tutti.length - pool.length);
  const ARMATURE = new Set(['arm', 'body', 'head', 'leg', 'waist']);
  let conElemento = 0;
  const nuovo = pool.map((v) => {
    const { e: _vecchio, ...resto } = v;
    if (ARMATURE.has(v.c)) return resto;
    if (!(v.i in elemento)) throw new Error('arma senza elemento nei dati del gioco: ' + v.n);
    conElemento++;
    return { ...resto, e: elemento[v.i] };
  });
  fs.writeFileSync(poolPath, JSON.stringify(nuovo));
  console.log('pool aggiornato:', nuovo.length, 'pezzi,', conElemento, 'armi con elemento');
})().catch((e) => { console.error(e); process.exit(1); });

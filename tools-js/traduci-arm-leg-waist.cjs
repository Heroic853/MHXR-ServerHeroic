const fs = require('fs');
const eq = JSON.parse(fs.readFileSync('equipaggiamenti.json', 'utf8'));
const manuali = JSON.parse(fs.readFileSync('radici-manuali.json', 'utf8'));

const num = (nome) => { const m = nome.match(/(\d+)$/); return m ? m[1] : null; };
const byCat = {};
for (const c of ['head', 'body', 'arm', 'leg', 'waist']) byCat[c] = eq.filter((e) => e.categoria === c);
const headByNum = new Map(byCat.head.map((e) => [num(e.nome), e]));
const bodyByNum = new Map(byCat.body.map((e) => [num(e.nome), e]));

function lcp(a, b) { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return a.slice(0, i); }

const PIECE_WORDS = ['Helm', 'Helmet', 'Head', 'Hat', 'Cap', 'Mask', 'Kasa', 'Testa', 'Ankh', 'Horn', 'Crown', 'Eboshi',
  'Hood', 'Cowl', 'Visor', 'Circlet', 'Diadem', 'Hachigane', 'Zunari', 'Kabuto', 'Mail', 'Vest', 'Suit', 'Attire',
  'Cuirass', 'Resist', 'Armor', 'Torso', 'Tronco', 'Coat', 'Robe', 'Jacket', 'Gi', 'Dummy', 'Ropos', 'Toque',
  "Col's", 'Hairpiece'];
function stripSuffixEn(en) {
  let s = en.trim();
  s = s.replace(/\s*[ⅠⅡⅢⅣⅤ]+$/, '');
  s = s.replace(/\s*\+$/, '');
  if (s.includes(' - ')) {
    const segs = s.split(' - ');
    const ultimo = segs[segs.length - 1].replace(/\s*[ⅠⅡⅢⅣⅤ]+$/, '').trim();
    const parole = ultimo.split(' ');
    if (PIECE_WORDS.includes(parole[parole.length - 1])) return segs.slice(0, -1).join(' - ');
    return s;
  }
  const parole = s.split(' ');
  const ultima = parole[parole.length - 1];
  if (PIECE_WORDS.includes(ultima)) return parole.slice(0, -1).join(' ');
  return s;
}

const radiceEn = new Map();
for (const cat of ['arm', 'leg', 'waist']) {
  for (const e of byCat[cat]) {
    const n = num(e.nome);
    const ref = headByNum.get(n) || bodyByNum.get(n);
    if (!ref) continue;
    const p = lcp(e.nomeJp, ref.nomeJp);
    if (p.length === 0 || radiceEn.has(p)) continue;
    const auto = stripSuffixEn(ref.en);
    radiceEn.set(p, manuali[p] || auto);
  }
}
console.log('radici mappate:', radiceEn.size);

const TAG = {
  '双': 'Pair', '略式': 'Simplified', '凶': 'Vicious', '炸': 'Blast', '始': 'Genesis', '深': 'Deep',
  '幻': 'Phantom', '荒': 'Wild', '鋼': 'Steel', '修': 'Reinforced', '贋': 'Fake', '皇': 'Imperial',
  '対爆氷': 'Anti-Blast Ice', '対金獅子': 'Anti-Golden Lion', '弐': 'II', '参': 'III', '極': 'Extreme',
  '宴': 'Feast', '島': 'Island', '海': 'Sea', '刃': 'Blade', '銃': 'Gun', '天': 'Heaven', '新天': 'New Heaven',
  '蒼炎': 'Azure Flame', '蒼火': 'Azure Fire', '紅': 'Crimson', '紅炎': 'Crimson Flame',
};

// dizionario parola-base pura (senza modificatori) per slot
const BASEWORD = {
  arm: {
    '篭手': 'Gauntlets', '手甲': 'Gauntlets', '大袖': 'Big Sleeve', '袂': 'Sleeve', '奏袖': 'Sleeve', '袖': 'Sleeve',
    '腕装': 'Arm Guard', '御手': 'Hand Guard', '手': 'Hand Guard', 'アーム': 'Arm', 'アームロング': 'Long Arm',
    'ガード': 'Guard', 'カフス': 'Cuffs', 'グラブ': 'Gloves', 'グローブ': 'Gloves', 'マンシュ': 'Sleeve',
    'ミトン': 'Mitts', 'ナックル': 'Knuckles', 'リスト': 'Wrist Guard', 'コテ': 'Vambrace', 'ブレス': 'Bracer',
    '腕甲': 'Vambrace', 'ハッグ': 'Hug',
    'ラーマ': 'Rama', 'アスト': 'Asto', 'マーノ': 'Mano', 'ブラッソ': 'Braccio', 'ハトゥー': 'Hatu',
    'マカーン': 'Makan', 'ノキリペ': 'Nokilipe', 'ンペ': 'Npe',
  },
  leg: {
    '具足': 'Greaves', 'グリーヴ': 'Greaves', 'レギンス': 'Leggings', 'ブーツ': 'Boots', 'フット': 'Feet',
    'シューズ': 'Shoes', 'サンダル': 'Sandals', 'タイツ': 'Tights', 'パンツ': 'Pants', 'ボトム': 'Bottoms',
    'ボトムス': 'Bottoms', '脛当': 'Shin Guard', '足袋': 'Tabi', 'ハカマ': 'Hakama', '袴': 'Hakama',
    'レガース': 'Leg Guards', 'レッグ': 'Leg', '脚着': 'Leg Wear', '足枷': 'Shackles', '脚装': 'Leg Guard',
    '脚甲': 'Leg Armor', '脚': 'Leg', '足': 'Foot', '御脚': 'Leg', '草履': 'Sandals', 'スクリ': 'Skirt',
    'スカート': 'Skirt', '華袴': 'Flower Hakama', 'ット': 'Foot', 'スパイク': 'Spikes',
    'フィン': 'Fin', 'ペイル': 'Pale', 'ハディ': 'Hadi', 'ガンバ': 'Gamba', 'フェムル': 'Femur',
    'ギンス': 'Gins', 'ライース': 'Reis', 'ヴルツェル': 'Wurzel', 'ラング': 'Lang', 'タンク': 'Tank',
  },
  waist: {
    '腰当て': 'Waist Guard', '腰当': 'Waist Guard', '腰巻': 'Loincloth', 'フォールド': 'Faulds', 'コート': 'Coat',
    'コイル': 'Coil', 'ベルト': 'Belt', 'エプロン': 'Apron', 'サロン': 'Sarong', 'チェーン': 'Chain', '帯': 'Sash',
    '丸帯': 'Round Sash', '弾帯': 'Bandolier', '鎖帯': 'Chain Sash', '腰帯': 'Waist Sash', '飾帯': 'Decorative Sash',
    '帯革': 'Sash Belt', 'オビ': 'Obi', 'フープ': 'Hoop', 'ショルト': 'Short', 'ックル': 'Buckle', 'バックル': 'Buckle',
    '錬帯': 'Forged Sash', '帯締': 'Sash Cord', 'クロス': 'Cross', 'ホルダー': 'Holder', 'バンド': 'Band',
    'オッハ': 'Oha', 'ラット': 'Rat', 'ウキワ': 'Float',
  },
};

function traduciSuffisso(suffOriginale, slot) {
  if (suffOriginale === '') return '';
  if (suffOriginale === 'dummy') return 'Dummy';
  let s = suffOriginale.trim();

  // toglie eventuale '】' decorativa di chiusura ovunque si trovi
  s = s.replace(/】/g, '');

  // stacca dalla FINE eventuale tag '・XXX'
  let tagPezzo = null;
  const mTag = s.match(/・(.+)$/);
  if (mTag) { tagPezzo = TAG[mTag[1]] || mTag[1]; s = s.slice(0, s.length - mTag[0].length); }

  // stacca numerale romano finale
  let roman = '';
  const mRoman = s.match(/[ⅠⅡⅢⅣⅤ]+$/);
  if (mRoman) { roman = mRoman[0]; s = s.slice(0, -mRoman[0].length); }

  // stacca 改/試/絶 finale
  let modPezzo = null;
  if (s.endsWith('改')) { modPezzo = 'Custom'; s = s.slice(0, -1); }
  else if (s.endsWith('試')) { modPezzo = 'Trial'; s = s.slice(0, -1); }
  else if (s.endsWith('絶')) { modPezzo = 'Absolute'; s = s.slice(0, -1); }

  // stacca 零 finale (prima di greco/numerale puo' comparire dopo la base: BASE零 o BASEα零?)
  let zero = false;
  if (s.endsWith('零')) { zero = true; s = s.slice(0, -1); }

  // stacca lettera greca finale (alpha/beta/gamma)
  let greek = null;
  const mGreek = s.match(/[αβγ]$/);
  if (mGreek) { greek = mGreek[0] === 'α' ? 'Alpha' : mGreek[0] === 'β' ? 'Beta' : 'Gamma'; s = s.slice(0, -1); }

  // quel che resta E' la parola base pura
  const base = BASEWORD[slot][s] || s; // se sconosciuta, traslitterata cosi' com'e' (segnalata a parte)
  const sconosciuta = !BASEWORD[slot][s] && s !== '';

  const pezzi = [base];
  if (greek) pezzi.push(greek);
  if (zero) pezzi.push('Zero');
  if (modPezzo) pezzi.push(modPezzo);
  if (tagPezzo) pezzi.push('-', tagPezzo);
  let risultato = pezzi.join(' ').trim();
  if (roman) risultato += ' ' + roman;
  return { testo: risultato, sconosciuta, baseGrezza: s };
}

let tradotti = 0, senzaRadice = 0;
const nonRiconosciuti = new Map();
for (const cat of ['arm', 'leg', 'waist']) {
  for (const e of byCat[cat]) {
    const n = num(e.nome);
    const ref = headByNum.get(n) || bodyByNum.get(n);
    let root, suff;
    if (ref) {
      const p = lcp(e.nomeJp, ref.nomeJp);
      root = radiceEn.get(p) || null;
      suff = e.nomeJp.slice(p.length);
    } else {
      root = null;
      suff = e.nomeJp;
    }
    const r = traduciSuffisso(suff, cat);
    if (r.sconosciuta) nonRiconosciuti.set(r.baseGrezza, (nonRiconosciuti.get(r.baseGrezza) || 0) + 1);
    if (root === null) {
      senzaRadice++;
      e.en = r.testo || e.nomeJp;
      continue;
    }
    e.en = r.testo ? (root + ' ' + r.testo) : root;
    tradotti++;
  }
}
console.log('tradotti:', tradotti, '| senza corrispondenza head/body:', senzaRadice);
const nrArr = [...nonRiconosciuti.entries()].sort((a, b) => b[1] - a[1]);
console.log('parole-base non riconosciute (' + nrArr.length + ' distinte, ' + nrArr.reduce((a, [, n]) => a + n, 0) + ' occorrenze):');
console.log(nrArr.map(([s, n]) => s + '=' + n).join(' | '));

// I pochi pezzi senza un head/body accoppiato via numero (nomi composti
// interi, non root+suffisso) si sistemano a mano: sono solo 30.
const OVERRIDE = {
  AD_ARM644: "Steamforge Lord's Vambrace - Blade Rig III",
  AD_ARM645: "Steamforge Lord's Vambrace - Gun Rig III",
  AD_ARM646: 'War Purgatory IV Carapace - Gauntlets',
  AD_ARM647: 'War Purgatory IV Garb - Gauntlets',
  AD_ARM718: 'Crystallized Explore Arm II',
  AD_ARM719: 'Crystallized Explore Guard II',
  AD_ARM850: 'Poemel Hug - Ni',
  AD_ARM851: 'Poemel Glove - Ni',
  AD_ARM852: 'Poemel Hug - San',
  AD_ARM853: 'Poemel Glove - San',
  AD_LEG646: 'War Purgatory IV Carapace - Greaves',
  AD_LEG647: 'War Purgatory IV Garb - Greaves',
  AD_LEG842: 'Dummy',
  AD_LEG843: 'Dummy',
  AD_LEG802: 'Cyanos Greaves II',
  AD_LEG803: 'Cyanos Leggings II',
  AD_LEG804: 'Cyanos Greaves III',
  AD_LEG805: 'Cyanos Leggings III',
  AD_LEG718: 'Crystallized Explore Bottoms II',
  AD_LEG719: 'Crystallized Explore Feet II',
  AD_LEG830: 'Crystallized Explore Bottoms III',
  AD_LEG831: 'Crystallized Explore Feet III',
  AD_WST718: 'Crystallized Explore Belt II',
  AD_WST719: 'Crystallized Explore Band II',
  AD_WST802: 'Cyanos Faulds II',
  AD_WST803: 'Cyanos Coat II',
  AD_WST804: 'Cyanos Faulds III',
  AD_WST805: 'Cyanos Coat III',
  AD_WST4253: 'Zieger Holder I',
  AD_WST4371: "Heaven's Prison Attire - Waist Guard I",
};
let sovrascritti = 0;
for (const e of eq) {
  if (OVERRIDE[e.nome]) { e.en = OVERRIDE[e.nome]; sovrascritti++; }
}
console.log('override manuali applicati:', sovrascritti, '/', Object.keys(OVERRIDE).length);

fs.writeFileSync('equipaggiamenti.json', JSON.stringify(eq, null, 1));
console.log('scritto equipaggiamenti.json');

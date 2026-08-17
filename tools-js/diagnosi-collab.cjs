/*
 * Diagnosi per le quest delle collaborazioni.
 *
 * Nel foglio dei blocchi esistono mostri che fix-monsters.cjs non assegna mai
 * (yoga gigginox, aberrant deviljho, steel armor diablos, enma rajang...).
 * I blocchi ci sono: manca la corrispondenza fra il titolo giapponese della
 * quest e quel nome inglese. Questo script tira fuori i titoli, cosi' le
 * tabelle si possono completare.
 *
 * Lancialo cosi' (una riga sola), poi mandami il file diagnosi.txt:
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/diagnosi-collab.cjs > diagnosi.txt
 */
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const eventi = await qs.find({ mDefineId: /^(EVENT|TICKE|ETERN|SCORE)/ })
    .project({ mDefineId: 1, mQuestName: 1, mMostro: 1, mBossList: 1 }).toArray();

  console.log(`quest evento totali: ${eventi.length}`);
  console.log(`gia' con un mostro : ${eventi.filter((q) => q.mMostro).length}`);
  console.log(`ancora senza       : ${eventi.filter((q) => !q.mMostro).length}`);

  const idDi = (q) => [...new Set((q.mBossList || []).map((b) => b && b.mEnemyID).filter(Boolean))].join(',');

  // --- 1. le quest rimaste senza mostro, raggruppate per id nemico -----------
  console.log('\n\n=== 1. QUEST SENZA MOSTRO, per id nemico ===');
  const senza = eventi.filter((q) => !q.mMostro);
  const perId = new Map();
  for (const q of senza) {
    const k = idDi(q) || '(nessun boss)';
    if (!perId.has(k)) perId.set(k, []);
    perId.get(k).push(pulisci(q.mQuestName));
  }
  for (const [id, titoli] of [...perId.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const unici = [...new Set(titoli)];
    console.log(`\n  enemy ${id}  (${titoli.length} quest, ${unici.length} titoli distinti)`);
    unici.slice(0, 6).forEach((t) => console.log(`      ${t.slice(0, 60)}`));
    if (unici.length > 6) console.log(`      ... altri ${unici.length - 6}`);
  }

  // --- 2. caccia ai temi delle collaborazioni -------------------------------
  // Cerco per parole giapponesi plausibili. Anche gli zeri sono informativi:
  // dicono che quel termine non e' quello usato dal gioco.
  console.log('\n\n=== 2. TITOLI CHE NOMINANO UNA COLLABORAZIONE ===');
  const TEMI = [
    ['STREET FIGHTER / yoga', /ヨガ|ダルシム|リュウ|春麗|ストリート|ストファイ|格闘/],
    ['ATTACK ON TITAN',       /進撃|巨人|エレン|リヴァイ|超大型|鎧の/],
    ['EVANGELION',            /エヴァ|ヱヴァ|初号機|弐号機|使徒|サードインパクト/],
    ['FFBE / FF',             /FFBE|ファイナルファンタジー|エフエフ|ビジョンズ/],
    ['ENMA / demoni',         /閻魔|えんま|鬼|地獄|魔王/],
    ['NATALE / HALLOWEEN',    /聖夜|クリスマス|サンタ|ハロウィン|南瓜|かぼちゃ/],
    ['ALTRE COLLAB',          /コラボ|マギ|BASARA|学園|スイーツ|感謝祭/],
  ];
  for (const [nome, re] of TEMI) {
    const hit = eventi.filter((q) => re.test(String(q.mQuestName || '')));
    console.log(`\n  --- ${nome}: ${hit.length} quest ---`);
    const visti = new Set();
    for (const q of hit) {
      const t = pulisci(q.mQuestName);
      if (visti.has(t)) continue;
      visti.add(t);
      if (visti.size > 12) { console.log(`      ... altri ${hit.length - 12}`); break; }
      console.log(`      "${t.slice(0, 44)}"  enemy=${idDi(q) || '-'}  ora=${q.mMostro || 'NESSUNO'}`);
    }
  }

  // --- 3. ogni id nemico, con il mostro che gli e' stato dato ---------------
  // Se lo stesso id risulta assegnato a mostri diversi, li' c'e' un errore.
  console.log('\n\n=== 3. TUTTI GLI ID NEMICO E IL MOSTRO ASSEGNATO ===');
  const mappa = new Map();
  for (const q of eventi) {
    for (const b of q.mBossList || []) {
      if (!b || !b.mEnemyID) continue;
      const k = String(b.mEnemyID);
      if (!mappa.has(k)) mappa.set(k, { n: 0, mostri: new Map(), titolo: pulisci(q.mQuestName) });
      const e = mappa.get(k);
      e.n += 1;
      const m = q.mMostro || '(nessuno)';
      e.mostri.set(m, (e.mostri.get(m) || 0) + 1);
    }
  }
  const righe = [...mappa.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [id, e] of righe) {
    const lista = [...e.mostri.entries()].sort((a, b) => b[1] - a[1])
      .map(([m, n]) => `${m} x${n}`).join(' , ');
    console.log(`  ${String(id).padStart(4)}  (${String(e.n).padStart(4)} quest)  ${lista.slice(0, 90)}`);
    console.log(`        es. "${e.titolo.slice(0, 50)}"`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

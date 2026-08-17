/*
 * IPOTESI: il blocco all'indice mAreaNo deve essere un'area che ha uno SLOT per
 * il mostro bersaglio. Se il server manda li' un'area senza slot, il boss non ha
 * dove apparire.
 *
 * Verifica sulle 1995 quest della storia, che funzionano.
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/check-slot-rule.cjs
 */
const fs = require('fs');
const mongoose = require('mongoose');

const {
  DB_USER = 'root', DB_PASSWORD = 'example',
  DB_IP = 'mongo', DB_PORT = '27017', DB_NAME = 'apypos',
} = process.env;

(async () => {
  await mongoose.connect(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_IP}:${DB_PORT}`, { dbName: DB_NAME });
  const qs = mongoose.connection.db.collection('questsheets');

  const aree = JSON.parse(fs.readFileSync('/app/tools/aree-nemici.json', 'utf8'));

  const csv = fs.readFileSync('/app/dist/csv/blocks.csv', 'utf8').split('\n').slice(1);
  const nomePerHash = new Map();
  for (const r of csv) {
    const [nome, hash] = r.trim().split(',');
    if (nome && hash) nomePerHash.set(Number(hash), nome);
  }

  // dal nome blocco l90_m12_a01_0011 alla chiave area l90_m12_a01
  function chiaveArea(hash) {
    const nome = nomePerHash.get(Number(hash));
    if (!nome) return null;
    const m = nome.match(/^(l\d+_m\d+_a\d+)_/);
    return m ? m[1] : null;
  }

  function valuta(q, criterio) {
    const indici = (q.mBossList || []).map((b) => parseInt(b?.mAreaNo, 10)).filter((n) => !isNaN(n));
    if (!indici.length) return null;
    const blocchi = q.mBlocks || [];
    for (const i of indici) {
      const h = blocchi[i - 1]; // block_idx parte da 1
      if (h === undefined) return false;
      const k = chiaveArea(h);
      const info = k && aree[k];
      if (!info) return false;
      if (criterio === 'qualsiasi' && info.bersagli.length === 0) return false;
      if (criterio === 'grande' && !info.bersagli.some((b) => b >= 1)) return false;
    }
    return true;
  }

  for (const criterio of ['qualsiasi', 'grande']) {
    console.log(`\n### criterio: il blocco all'indice del boss ha uno slot ${criterio === 'grande' ? 'per mostro GRANDE (mEmClass>=1)' : 'bersaglio qualsiasi'} ###`);
    for (const [etichetta, filtro] of [
      ['STORIA (funzionano)', { mDefineId: /^QUEST/, 'mBlocks.0': { $exists: true }, mBlocksSource: { $exists: false } }],
      ['EVENTO', { mDefineId: /^EVENT/, 'mBlocks.0': { $exists: true } }],
    ]) {
      const docs = await qs.find(filtro).project({ mDefineId: 1, mBossList: 1, mBlocks: 1 }).toArray();
      let si = 0, no = 0, boh = 0;
      for (const q of docs) {
        const r = valuta(q, criterio);
        if (r === null) boh++; else if (r) si++; else no++;
      }
      const tot = si + no;
      console.log(`  ${etichetta.padEnd(22)} rispetta=${String(si).padStart(5)}  viola=${String(no).padStart(5)}  (${tot ? Math.round(si / tot * 100) : 0}%)`);
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

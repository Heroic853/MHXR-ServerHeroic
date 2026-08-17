// Analisi dei dati eventi. Gira dentro il container:
//   docker compose -f docker-compose.prod.yml exec -T server node /app/dist/public/analyze-events.js
const fs = require('fs');
const path = require('path');
const JSON_DIR = '/app/dist/json';
const load = (f) => JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf8'));

const nodes = load('event_nodes.json');
const nodeById = new Map(nodes.map((n) => [String(n.mEventNodeHash), n]));

// 1) qual e' la regola che lega un nodo al suo middle_node_banner_id?
console.log('=== regola middle_node_banner_id (dai file gia\' convertiti) ===');
for (const f of ['easy_events.json', 'norm_events.json', 'hard_events.json', 'forb_events.json']) {
  const a = load(f);
  console.log(`\n--- ${f} (big_node=${a[0].big_node_banner_id}) ---`);
  const rows = a.map((e) => {
    const n = nodeById.get(String(e.mst_event_node_id));
    return {
      path: n ? n.mBannerPath : '?',
      bannerID: n ? n.mEventBannerID : '?',
      middle: e.middle_node_banner_id,
      sched: e.schedule_category,
      type: e.schedule_type,
      state: e.state,
      rank: e.recommended_flag,
    };
  });
  for (const r of rows.slice(0, 10)) {
    console.log(`   path=${String(r.path).padEnd(12)} bannerID=${String(r.bannerID).padEnd(7)} middle=${r.middle}  sched=${r.sched} type=${r.type} state=${r.state} rec=${r.rank}`);
  }
  // il middle e' costante per gruppo o varia col path?
  const distinct = [...new Set(rows.map((r) => r.middle))];
  console.log(`   middle distinti: ${distinct.join(', ')}`);
  // correlazione path -> middle
  const map = {};
  for (const r of rows) { (map[r.middle] ??= new Set()).add(String(r.path).replace(/\d+$/, '')); }
  for (const [m, paths] of Object.entries(map)) {
    console.log(`     middle ${m} <- path ${[...paths].join(',')}`);
  }
}

// 2) come sono fatti i gruppi che ci servono
console.log('\n\n=== gruppi candidati per le collection vuote ===');
const byPrefix = {};
for (const n of nodes) {
  const p = String(n.mBannerPath || '?').split('_')[0];
  (byPrefix[p] ??= []).push(n);
}
for (const p of ['tour', 'kako', 'raid', 'gild', 'inte', 'seev', 'asev', 'evol']) {
  const list = byPrefix[p] || [];
  console.log(`\n--- ${p} : ${list.length} nodi ---`);
  const banners = [...new Set(list.map((n) => n.mEventBannerID))].sort((a, b) => a - b);
  console.log(`   mEventBannerID: ${banners.slice(0, 12).join(', ')}${banners.length > 12 ? ' ...' : ''}  (${banners.length} distinti)`);
  const paths = [...new Set(list.map((n) => n.mBannerPath))].sort();
  console.log(`   mBannerPath   : ${paths.slice(0, 8).join(', ')}${paths.length > 8 ? ' ...' : ''}  (${paths.length} distinti)`);
  for (const n of list.slice(0, 3)) {
    const nome = String(n.mEventNodeName).replace(/\n/g, ' / ');
    console.log(`     "${nome}"  quest=${(n.mEventQuestList || []).length}`);
  }
}

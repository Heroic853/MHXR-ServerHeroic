/*
 * Costruisce src/json/progressione-storia.json: la struttura della storia
 * (arcipelaghi -> isole -> nodi, nell'ordine del gioco) usata dalla
 * progressione vera della mappa (src/services/progressioneStoria.ts).
 *
 * Tutto dai file del gioco (resident.00.fpk originale, giapponese):
 * - rsdnt_map.arc :: ocean_info (isole di ogni arcipelago, mPartIndex)
 * - rsdnt_map.arc :: part_info  (nodi di ogni isola, in ordine)
 * - rsdnt_map.arc :: node_info  (tipo di nodo e sue missioni)
 * - rsdnt_property.arc :: explore_note_content + item_collection
 *   (la nota del tesoro dell'isola: l'unico manufatto di categoria 1)
 *
 * Le REGOLE di apertura non sono nei file (le decideva il server Capcom):
 * qui si salvano solo i dati; la regola sta nel servizio ed e' documentata li'.
 *
 * Uso:  node tools-js/costruisci-progressione-storia.cjs <lib.cjs di apk_check/blk>
 */
const fs = require('fs');
const path = require('path');
const { parseXfs } = require('./xfs-parse.cjs');

const LIB = process.argv[2];
if (!LIB) { console.error('uso: node costruisci-progressione-storia.cjs <percorso lib.cjs>'); process.exit(1); }
const { parseFpk, parseArc } = require(LIB);

const REPO = path.join(__dirname, '..');
const RESIDENT = path.join(REPO, 'src/public/res/download/android/v0282/stdDL/cmn/resident.00.fpk.jp-backup');
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

(async () => {
  const fpk = parseFpk(fs.readFileSync(RESIDENT));
  const tabelle = {};
  for (const x of fpk) {
    if (!/rsdnt_(map|property)\.arc$/.test(x.filePath)) continue;
    for (const a of await parseArc(x.data)) {
      const n = a.name.split(/[\\/]/).pop();
      if (['ocean_info', 'part_info', 'node_info', 'explore_note_content', 'item_collection'].includes(n) && a.data) tabelle[n] = parseXfs(a.data).root;
    }
  }
  const oceani = lista(tabelle.ocean_info.mDataList.mpArray);
  const parti = new Map(lista(tabelle.part_info.mDataList.mpArray).map((p) => [p.mPartHash, p]));
  const nodi = new Map(lista(tabelle.node_info.mDataList.mpArray).map((n) => [n.mNodeHash, n]));
  const categoria = new Map(lista(tabelle.item_collection.mDataList.mpArray).map((c) => [c.mCollectionID, c.mCategory]));
  const note = lista(tabelle.explore_note_content.mDataList.mpArray);

  const out = oceani.sort((a, b) => a.mID - b.mID).map((o) => ({
    mst_ocean_id: o.mOceanHash,
    nome: o.mOceanName,
    isole: lista(o.mIslandList.mpArray).sort((a, b) => a.mPartIndex - b.mPartIndex).map((i) => {
      const p = parti.get(i.mPartHash);
      if (!p) throw new Error('isola senza part_info: ' + i.mPartHash);
      const tesoro = note.filter((n) => n.mPartID === p.mPartHash && categoria.get(n.mCollectionID) === 1);
      if (tesoro.length !== 1) throw new Error(`isola ${p.mPartName}: ${tesoro.length} tesori`);
      const nodiIsola = lista(p.mNodeList.mpArray).map((x) => {
        const n = nodi.get(x.mNodeHash);
        if (!n) throw new Error('nodo senza node_info: ' + x.mNodeHash);
        return { mst_node_id: n.mNodeHash, tipo: n.mNodeType, nome: n.mNodeName, missioni: lista(n.mQuestList.mpArray).map((q) => q.mQuestHash) };
      });
      if (nodiIsola.filter((n) => n.tipo === 4).length !== 1) throw new Error(`isola ${p.mPartName}: non ha una sola costa di uscita (tipo 4)`);
      return { mst_part_id: p.mPartHash, nome: p.mPartName, nota_tesoro: tesoro[0].mNoteID, nodi: nodiIsola };
    }),
  }));
  const dest = path.join(REPO, 'src/json/progressione-storia.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
  console.log('scritto', dest, out.map((o) => `${o.nome}: ${o.isole.length} isole, ${o.isole.reduce((t, i) => t + i.nodi.length, 0)} nodi`).join(' | '));
})().catch((e) => { console.error(e); process.exit(1); });

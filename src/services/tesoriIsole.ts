import tesori from '../json/tesori-isole.json' with { type: 'json' };

/*
 * Il tesoro (秘宝) nel forziere alla fine della storia di ogni isola.
 *
 * Tutto dai file del gioco (tabella generata in src/json/tesori-isole.json):
 * - i blocchi con il forziere sono quelli con un oggetto mSerialType=3,
 *   mSubID=9 in mBlockSerialList (quest/table): esattamente 2 per isola,
 *   giorno e notte, da l01 a l18;
 * - il tesoro dell'isola NN e' COLLECTIONNN001 (collection_define), l'unico
 *   manufatto di categoria 1 dell'isola in explore_note_content.
 *
 * Il gioco trova cosa c'e' nel forziere cosi' (sQuestNew::getItemCollectionFromInstanceID):
 * instance_id del blocco -> block_instance_list -> serial_no -> drop_list ->
 * item_list.collections. E' lo stesso formato che il tutorial usa gia' per
 * 成長の古代碑 (tutorial.controller TutorialQuestStart), che funziona.
 */
type Tesoro = { blocco: string; serial_no: number; mst_collection_id: number; nome: string };
const TESORI = tesori as Record<string, Tesoro>;

export function tesoroDelBlocco(mstBlockId: number): Tesoro | null {
  return TESORI[String(mstBlockId)] ?? null;
}

const itemListCon = (mstCollectionId: number) => ({
  collections: [{ mst_collection_id: mstCollectionId }],
  equipments: [],
  growth_items: [],
  limiteds: [],
  matatabis: [],
  materials: [],
  monument: { augite: [], hr: 0, mlv: { atk: 0, def: 0, hp: 0, sp: 0 } },
  otomos: [],
  partners: [],
  payments: [],
  pcoins: [],
  points: [],
  powers: [],
  stamp_sets: [],
  zenny: 0,
});

/**
 * I campi del blocco per l'avvio della quest: vuoti se il blocco non ha un
 * forziere, altrimenti il forziere con il tesoro dell'isola. `instanceId` deve
 * essere diverso da 0 e unico nella quest (il tutorial usa il numero del blocco).
 */
export function campiTesoro(mstBlockId: number, instanceId: number) {
  const t = tesoroDelBlocco(mstBlockId);
  if (!t) return { instance_id: 0, block_instance_list: [], drop_list: [], repop_list: [] };
  return {
    instance_id: instanceId,
    block_instance_list: [{ instance_id: instanceId, serial_no: t.serial_no }],
    drop_list: [{ serial_no: t.serial_no, item_list: itemListCon(t.mst_collection_id) }],
    repop_list: [{ amount: 1, serial_no: t.serial_no }],
  };
}

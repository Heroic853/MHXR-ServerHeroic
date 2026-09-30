import punti from '../json/punti-raccolta.json' with { type: 'json' };
import catalogo from '../json/catalogo-ricompense.json' with { type: 'json' };
import { campiTesoro } from './tesoriIsole.js';

/*
 * Punti di raccolta nelle quest (scavare, pescare, insetti, raccogliere).
 *
 * Nei file del gioco (quest/table, mBlockSerialList) un punto di raccolta e' un
 * oggetto con mSerialType=3 (lo stesso del forziere del tesoro e del manufatto del
 * tutorial); mSubID ne dice il tipo (1 raccolta, 4 scavo, 6 insetti, 8 pesca...).
 * src/json/punti-raccolta.json: i blocchi con UN solo punto (2025), gli unici per
 * cui il formato e' quello gia' verificato del tutorial. Quelli con due punti (176)
 * restano come prima.
 *
 * Cosa esce: un materiale dai premi di raccolta della quest (se non ne ha, dai
 * premi principali di tipo 0: vedi materialiDiRaccolta), mRewardType=1 della
 * sua mRewardItemList (su tutte le quest i premi di tipo 1 non vengono quasi mai
 * dai mostri: 6 su 28143 in item_material_search_em), pesato con mProbScale.
 *
 * Il server ricorda cosa c'e' in ogni punto (user.raccolta_avviata) e a fine
 * quest accredita solo i punti che il gioco dice di aver usato (blocks[].instance_ids).
 */
const PUNTI = punti as unknown as Record<string, [number, number]>;
const MATERIALI = new Set((catalogo as { id: number; f: string }[]).filter((v) => v.f === 'materiale').map((v) => v.id));

type Premio = { mItemHash?: string | null; mProbScale?: string | null; mRewardType?: string | null } | null;
export type PuntoAvviato = { instance_id: number; mst_material_id: number; amount: number };

function scegli(lista: { id: number; peso: number }[], seme: string): number | null {
  if (!lista.length) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < seme.length; i++) h = Math.imul(h ^ seme.charCodeAt(i), 0x01000193) >>> 0;
  const tot = lista.reduce((t, v) => t + v.peso, 0);
  let n = (h / 0x100000000) * tot;
  for (const v of lista) { n -= v.peso; if (n < 0) return v.id; }
  return lista[lista.length - 1]!.id;
}

function materialiDiTipo(premi: readonly Premio[] | null | undefined, tipo: string) {
  return (premi ?? [])
    .filter((p): p is NonNullable<Premio> => !!p && String(p.mRewardType) === tipo)
    .map((p) => ({ id: Number(p.mItemHash), peso: Math.max(1, Number(p.mProbScale) || 1) }))
    .filter((v) => MATERIALI.has(v.id));
}

/**
 * I materiali di raccolta della quest: i premi di tipo 1 che sono materiali veri.
 * Se la quest non ne ha (292 quest, quasi tutte ticket-premio), per scelta del
 * gestore del server (30/09) si usano i suoi materiali di tipo 0, i premi principali.
 */
export function materialiDiRaccolta(premi: readonly Premio[] | null | undefined) {
  const raccolta = materialiDiTipo(premi, '1');
  return raccolta.length ? raccolta : materialiDiTipo(premi, '0');
}

const itemListMateriale = (id: number, amount: number) => ({
  collections: [], equipments: [], growth_items: [], limiteds: [], matatabis: [],
  materials: [{ amount, mst_material_id: id }],
  monument: { augite: [], hr: 0, mlv: { atk: 0, def: 0, hp: 0, sp: 0 } },
  otomos: [], partners: [], payments: [], pcoins: [], points: [], powers: [], stamp_sets: [], zenny: 0,
});

/**
 * I campi di un blocco all'avvio: il forziere del tesoro, oppure il punto di
 * raccolta con il suo materiale, oppure null (il controller lascia il blocco
 * com'era). `seme` rende la scelta ripetibile (es. sessione+quest).
 */
export function campiBlocco(mstBlockId: number, instanceId: number, premi: readonly Premio[] | null | undefined, seme: string) {
  const tesoro = campiTesoro(mstBlockId, instanceId);
  if (tesoro.drop_list.length) return { campi: tesoro, punto: null as PuntoAvviato | null };
  const p = PUNTI[String(mstBlockId)];
  if (!p) return null;
  const [serial] = p;
  const id = scegli(materialiDiRaccolta(premi), `${seme}:${instanceId}`);
  if (id == null) return null;
  const amount = 1;
  return {
    campi: {
      instance_id: instanceId,
      block_instance_list: [{ instance_id: instanceId, serial_no: serial }],
      drop_list: [{ serial_no: serial, item_list: itemListMateriale(id, amount) }],
      repop_list: [{ amount: 1, serial_no: serial }],
    },
    punto: { instance_id: instanceId, mst_material_id: id, amount } as PuntoAvviato | null,
  };
}

type BloccoFine = { block_instance_id?: unknown; instance_ids?: unknown };

/** A fine quest: i materiali dei punti davvero usati (ognuno una volta sola). */
export function raccoltoDaiBlocchi(avviati: PuntoAvviato[] | null | undefined, blocks: unknown): Map<number, number> {
  const usati = new Set<number>();
  for (const b of Array.isArray(blocks) ? (blocks as BloccoFine[]) : []) {
    for (const id of Array.isArray(b?.instance_ids) ? b.instance_ids : []) usati.add(Number(id));
  }
  const presi = new Map<number, number>();
  for (const p of avviati ?? []) {
    if (!usati.has(Number(p.instance_id))) continue;
    presi.set(p.mst_material_id, (presi.get(p.mst_material_id) ?? 0) + p.amount);
  }
  return presi;
}

type VoceBlocco = { mst_block_id: number; instance_id: number; block_instance_list: unknown[]; drop_list: unknown[]; repop_list: unknown[] };

/**
 * Da chiamare dopo aver costruito block_list all'avvio: mette forzieri e punti di
 * raccolta nei blocchi che li hanno (gli altri restano come il controller li ha
 * fatti) e restituisce i punti da ricordare per la fine della quest.
 */
export function applicaRaccolta(blockList: VoceBlocco[], premi: readonly Premio[] | null | undefined, seme: string): PuntoAvviato[] {
  const avviati: PuntoAvviato[] = [];
  blockList.forEach((b, i) => {
    const r = campiBlocco(Number(b.mst_block_id), i + 1, premi, seme);
    if (!r) return;
    Object.assign(b, r.campi);
    if (r.punto) avviati.push(r.punto);
  });
  return avviati;
}

/** Ricorda i punti dell'ultima quest avviata (sostituisce quelli di prima). */
export async function salvaRaccolta(
  aggiorna: (filtro: object, modifica: object) => Promise<unknown>,
  sessione: string,
  mstQuestId: unknown,
  avviati: PuntoAvviato[],
) {
  if (!sessione) return;
  await aggiorna({ current_session: sessione }, { $set: { raccolta_avviata: { mst_quest_id: Number(mstQuestId), punti: avviati } } });
}

import { fileURLToPath } from 'node:url';
import path from 'path';
import { Request, Response } from 'express';

const __dirname = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
const log = createLogger('quest');

import full_island from '../../../json/full_enabled_state.json' with { type: 'json' };
import catalogoRicompense from '../../../json/catalogo-ricompense.json' with { type: 'json' };

import { readFile } from 'fs/promises';

import QuestSheet from '../../../model/questSheet.js';
import { aggiungiKaridama, saldoKaridama, KARIDAMA_A_MISSIONE, KARIDAMA_PRINCIPALE } from '../../../services/karidamaService.js';
import type { IslandStartInput, IslandEndInput, IslandMapAllInput } from './quest.schema.js';

interface BlockListItem {
  block_idx: number;
  block_instance_list: { instance_id: number; serial_no: number }[];
  drop_list: never[];
  instance_id: number;
  is_insert: number;
  is_raid: number;
  mst_block_id: number;
  repop_list: { amount: number; serial_no: number }[];
}

// --- Types ---
type QuestRow = {
  mQuestID: string;
  mDayNight: string;
  [key: string]: string;
};

type NodeQuestRow = {
  mNodeHash: string;
  mQuestHash: string;
  isCollectionQuest: string;
  isKeyQuest: string;
  [key: string]: string;
};

type QuestSubtargetRow = {
  mQuestID: string;
  mSubTargetID: string;
  mDifficulty: string;
  mFixedItemTableID: string;
  [key: string]: string;
};

// Adjust based on your actual ocean/part/node structure
type QuestObject = {
  clear_time: number;
  is_collection_quest: 0 | 1;
  is_key_quest: 0 | 1;
  mst_quest_id: number;
  quest_subtargets: [];
  state: number;
};

type Node = {
  mst_node_id: number;
  day_quest_list?: QuestObject[];
  night_quest_list?: QuestObject[];
  is_collection_node?: number;
  mst_story_id?: number;
  state?: number;
};

type Part = {
  node_list?: Node[];
  mst_part_id?: number;
  campaign?: { mst_campaign_id: number; remain_time: number }[];
  exploration_note?: {
    note_contents: { mst_note_content_id: number; state: number }[];
    progress: number;
  };
  gingira_node_id?: number;
  object_list?: { mst_object_id: number; state: number }[];
  raid_info?: {
    end_remain: number;
    mst_node_id: number;
    start_remain: number;
  }[];
  silver_bonus?: number;
  state?: number;
};

type Ocean = {
  mst_ocean_id: number;
  part_list: Part[];
};

// --- CSV Parser ---
function parseCsv<T = Record<string, string>>(csv: string): T[] {
  const lines = csv.trim().split('\n');
  const headers = lines.shift()!.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]])) as T;
  });
}

// --- Main Function ---
export async function enrichOceanData(
  oceanData: Ocean[],
  cleared_quests: { mst_quest_id: number; clear_time?: number }[],
): Promise<Ocean[]> {
  // Load CSVs in parallel
  const [nodeQuestCsv, questDataCsv, questSubtargetCsv] = await Promise.all([
    readFile(path.resolve(__dirname, '../../../csv/oceans/parts/nodes/2-node-quests.csv'), 'utf8'),
    readFile(path.resolve(__dirname, '../../../csv/questData.csv'), 'utf8'),
    readFile(path.resolve(__dirname, '../../../csv/questSubtargetSet.csv'), 'utf8'),
  ]);

  // Parse CSVs
  const nodeQuests = parseCsv<NodeQuestRow>(nodeQuestCsv);
  const questRows = parseCsv<QuestRow>(questDataCsv);
  const subtargetRows = parseCsv<QuestSubtargetRow>(questSubtargetCsv);

  // Index quest data by quest ID
  const questMap = new Map<number, QuestRow>();
  for (const row of questRows) {
    const questID = Number(row.mQuestID);
    if (!isNaN(questID)) questMap.set(questID, row);
  }

  // Index subtargets by quest ID
  const subtargetMap = new Map<number, QuestSubtargetRow[]>();
  for (const row of subtargetRows) {
    const questID = Number(row.mQuestID);
    if (!isNaN(questID)) {
      if (!subtargetMap.has(questID)) subtargetMap.set(questID, []);
      subtargetMap.get(questID)!.push(row);
    }
  }

  // Index node quests by node hash
  const nodeQuestMap = new Map<number, NodeQuestRow[]>();
  for (const row of nodeQuests) {
    const nodeHash = Number(row.mNodeHash);
    if (!isNaN(nodeHash)) {
      if (!nodeQuestMap.has(nodeHash)) nodeQuestMap.set(nodeHash, []);
      nodeQuestMap.get(nodeHash)!.push(row);
    }
  }
  // Enrich ocean data
  const enrichedOcean = oceanData.map((ocean) => {
    const enrichedParts = ocean.part_list.map((part) => {
      if (!part.node_list) return { ...part };

      const enrichedNodes = part.node_list.map((node) => {
        const nodeID = node.mst_node_id;
        if (isNaN(nodeID)) return { ...node };

        const nodeQuests = nodeQuestMap.get(nodeID) || [];
        const day_quest_list: QuestObject[] = [];
        const night_quest_list: QuestObject[] = [];

        for (const nq of nodeQuests) {
          const questID = Number(nq.mQuestHash);
          const quest = questMap.get(questID);
          if (!quest) continue;

          const clearedQuest = cleared_quests.find((q) => q.mst_quest_id === questID);

          let state = 1; // default = NEW
          if (clearedQuest) {
            state = clearedQuest.clear_time != null ? 3 : 0; //clear 3 / 0 nothing
          }

          const clearTime = clearedQuest?.clear_time ?? 0;

          const isCollectionQuestFlag = nq.isCollectionQuest === 'true' ? 1 : 0;

          const is_collection_quest = clearTime
            ? isCollectionQuestFlag === 1
              ? 0
              : 1 // invert if clearTime is truthy
            : isCollectionQuestFlag;

          const questObj: QuestObject = {
            clear_time: clearTime,
            is_collection_quest,
            is_key_quest: nq.isKeyQuest === 'true' ? 1 : 0,
            mst_quest_id: questID,
            quest_subtargets: [],
            state: state,
          };

          const timeType = Number(quest.mDayNight);
          if (timeType === 1) {
            day_quest_list.push(questObj);
          } else if (timeType === 2) {
            night_quest_list.push(questObj);
          }
        }

        return {
          ...node,
          day_quest_list,
          night_quest_list,
        };
      });

      return {
        ...part,
        node_list: enrichedNodes,
      };
    });
    return {
      ...ocean,
      part_list: enrichedParts,
    };
  });
  return enrichedOcean;
}

export const islandStart = async (req: Request, res: Response) => {
  try {
    const { mst_quest_id, session_id } = req.body as IslandStartInput;
    const startedQuest = mst_quest_id;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);

    const quest = await QuestSheet.findOne({ mQuestID: String(startedQuest) });

    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const cleared_quests = doc.cleared_quests;

    const questExists = cleared_quests.some((q) => q.mst_quest_id === startedQuest);

    if (!questExists) {
      log.debug('Inserted Quest as seen');
      cleared_quests.push({ mst_quest_id: startedQuest });
    }

    const update = { cleared_quests: cleared_quests };

    // Await the update so you know it completed
    await User.findOneAndUpdate(filter, update, { new: true });
    const data = {
      instance_data: {
        block_list: [] as BlockListItem[],
        bomb_lot_no: [
          {
            bomb_lottery: [{ bomb_id: 0, weight: 0 }],
          },
        ],
        enable_limited_skill_id_list: [],
        enable_partner_limited_skill_id_list: [],
        enable_talisman: 0,
        enable_talisman_partner: 0,
        enemy_point_list: [
          // {
          //   mst_enemy_id: 1618895799,
          //   point: 0,
          // },
        ],
        instance_id: 0,
        mission_message: 'start',
        mst_quest_id: startedQuest,
        multi_leave_check_time: 0,
        point_info: {
          armor_skill_value: 0,
          campaign_value: 0,
          get_point: 0,
          guild_bingo_bonus: 0,
          guild_total_point: 0,
          m16_get_point: 0,
          mst_event_info_id: 2740334662,
          mst_event_point_id: 2992123464,
          now_point: 0,
          total_point: 0,
        },
        power_up: 0,
        select_fix_equipment_idx: 0,
        subtargets: [{ instance_id: 0, mst_subtarget_id: 0 }],
      },
    };

    const blocks = quest?.mBlocks || [];
    if (blocks.length === 0) {
      return encryptAndSend({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    }
    blocks.forEach((block, index) => {
      data.instance_data.block_list.push({
        block_idx: index + 1,
        block_instance_list: [
          // { instance_id: 0, serial_no: 1 }
        ],
        drop_list: [],
        instance_id: 0,
        is_insert: 0,
        is_raid: 0,
        mst_block_id: block,
        repop_list: [
          // { amount: 0, serial_no: 0 }
        ],
      });
    });
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandStart:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island start failed');
  }
};

const MATERIALE_DI_RIPIEGO = 1714092880; // verificato: e' un materiale vero

/*
 * I 5 輝石 (augite) della pietra HR, dalla tabella del gioco
 * rsdnt_property.arc :: item_augite (mAugiteID, mItemNo). mst_monument_type_id
 * e' mItemNo: coincide col 体力の輝石 gia' salvato dalla storia (id 2047024966, tipo 3).
 * Nei dati del gioco non c'e' da dove arrivassero in origine; per scelta del
 * gestore del server (29/09) se ne da' un po' a ogni fine missione.
 */
export const AUGITE = [
  { mst_augite_id: 2483912298, mst_monument_type_id: 1 }, // 攻撃の輝石
  { mst_augite_id: 218378192, mst_monument_type_id: 2 }, // 防御の輝石
  { mst_augite_id: 2047024966, mst_monument_type_id: 3 }, // 体力の輝石
  { mst_augite_id: 3831991013, mst_monument_type_id: 4 }, // 武技Pの輝石
  { mst_augite_id: 2472589939, mst_monument_type_id: 5 }, // 自動の輝石
] as const;

type VoceAugite = { amount?: number | null; mst_augite_id?: number | null; mst_monument_type_id?: number | null };

/** 1-3 輝石 di un tipo a caso, sommati a quelli gia' posseduti (mai doppioni di tipo). */
export function daiAugite(monument: { augite?: VoceAugite[] } | undefined | null) {
  const tipo = AUGITE[Math.floor(Math.random() * AUGITE.length)]!;
  const premio = { amount: 1 + Math.floor(Math.random() * 3), ...tipo };
  if (!monument) return null;
  if (!Array.isArray(monument.augite)) monument.augite = [];
  const gia = monument.augite.find((a) => Number(a.mst_augite_id) === tipo.mst_augite_id);
  if (gia) gia.amount = Number(gia.amount ?? 0) + premio.amount;
  else monument.augite.push({ ...premio });
  return premio;
}

/*
 * SMISTAMENTO DELLE RICOMPENSE PER FAMIGLIA.
 *
 * mRewardItemList non dice di che tipo sia un premio: c'e' un campo
 * mRewardType, ma analizzando le 2635 quest si e' visto che NON serve a questo
 * (il tipo 1 contiene 13970 materiali e 13936 equipaggiamenti insieme).
 * L'unico criterio affidabile e' in quale tabella del gioco cade l'id, e le
 * tabelle sono disgiunte: zero id in comune, verificato.
 *
 * Le ricompense usano quattro famiglie, non una:
 *   materiale       -> box.materials      mst_material_id
 *   equipaggiamento -> box.equipments      mst_equipment_id   (506 quest!)
 *   crescita        -> box.growth_items    mst_growth_item_id (POTENTIAL_*)
 *   limitato        -> box.limiteds        mst_limited_id     (LIMITED*)
 *
 * Prima il codice trattava tutto come materiale e scartava il resto: per
 * questo le armi e le armature promesse da 506 quest non arrivavano mai.
 *
 * Un id che non sta nel catalogo va SEMPRE scartato. Non e' teoria: scriverne
 * uno in box mette nell'inventario un oggetto che il client non sa disegnare, e
 * da quel momento il login crasha a ogni tentativo perche' /api/box/get lo
 * rimanda ogni volta — e' successo con l'id 1277724242.
 */
type Famiglia = 'materiale' | 'equipaggiamento' | 'crescita' | 'limitato';

const CATALOGO = new Map<number, Famiglia>(
  (catalogoRicompense as ReadonlyArray<{ id: number; f: string }>)
    .filter((v) => v.f === 'materiale' || v.f === 'equipaggiamento' || v.f === 'crescita' || v.f === 'limitato')
    .map((v) => [v.id, v.f as Famiglia]),
);

// null ammesso oltre a undefined: e' cosi' che Mongoose tipizza i campi
// facoltativi dei sottodocumenti, e senza il null la compilazione fallisce.
interface VoceRicompensa {
  mItemHash?: string | null;
  mProbScale?: string | null;
}

/** La forma di un equipaggiamento che il client accetta: 16 campi esatti. */
function nuovoEquipaggiamento(idIstanza: string, mstId: number) {
  return {
    auto_potential_composite: 0,
    awaked: 0,
    created: Math.floor(Date.now() / 1000),
    elv: 1,
    endAwakeCount: 0,
    endAwakeRemain: 0,
    end_remain: 0,
    equipment_id: idIstanza,
    evolve_start_time: 0,
    favorite: 0,
    is_awake: 0,
    is_complete_auto_potential_composite: 0,
    mst_equipment_id: mstId,
    potential: 0,
    slv: 1,
    start_remain: 0,
  };
}

/**
 * Pesca le ricompense UNA VOLTA SOLA e restituisce due cose: i quattro riquadri
 * per la risposta e la lista di cio' che e' stato pescato, da mettere in
 * inventario.
 *
 * Sono la stessa estrazione di proposito. Prima la funzione pescava solo per la
 * risposta e nessuno scriveva niente: il giocatore vedeva la ricompensa a fine
 * caccia e nell'inventario non arrivava. Pescare due volte, una per lo schermo e
 * una per l'inventario, sarebbe stato peggio: avrebbe mostrato un materiale e
 * consegnato un altro.
 */
function buildRewardSlots(lista?: readonly VoceRicompensa[] | null) {
  const voci = (lista ?? [])
    .filter((r) => r && r.mItemHash)
    .map((r) => ({ id: Number(r.mItemHash), peso: Math.max(1, Number(r.mProbScale) || 1) }))
    // Solo id presenti nel catalogo: qualunque altro numero verrebbe scritto in
    // inventario come oggetto inesistente e bloccherebbe il login.
    .filter((r) => Number.isFinite(r.id) && r.id > 0 && CATALOGO.has(r.id));

  const pescaUno = () => {
    if (!voci.length) return MATERIALE_DI_RIPIEGO;
    const totale = voci.reduce((t, v) => t + v.peso, 0);
    let n = Math.random() * totale;
    for (const v of voci) {
      n -= v.peso;
      if (n <= 0) return v.id;
    }
    return voci[voci.length - 1]!.id;
  };

  const vinti = new Map<number, { quanti: number; famiglia: Famiglia }>();

  /**
   * Una fila di quattro riquadri. `fila` distingue le casse fra loro: entra
   * nell'id istanza di un equipaggiamento, che deve restare unico anche fra
   * casse diverse della stessa caccia.
   */
  const costruisciFila = (fila: number, conPuntiEvento: boolean) => [1, 2, 3, 4].map((idx) => {
    const id = pescaUno();
    const famiglia = CATALOGO.get(id) ?? 'materiale';
    // Un'arma o un'armatura si vince a pezzo singolo, non a mucchietti: solo
    // materiali, oggetti di crescita e limitati hanno una quantita'.
    const quanti = famiglia === 'equipaggiamento' ? 1 : 1 + Math.floor(Math.random() * 3);

    const gia = vinti.get(id);
    vinti.set(id, { quanti: (gia?.quanti ?? 0) + quanti, famiglia });

    let itemList: Record<string, unknown>;
    switch (famiglia) {
      case 'equipaggiamento':
        // "equipments" al plurale: e' la chiave che il client si aspetta dentro
        // item_list, la stessa usata da questTraining e questForest. Al
        // singolare il client non trova la lista e si chiude alla schermata
        // delle ricompense, senza che il server registri nessun errore.
        // L'id istanza porta fila, riquadro e momento della vittoria: due pezzi
        // con lo stesso equipment_id sono il modo classico di rompere la box in
        // modo permanente.
        itemList = { equipments: [nuovoEquipaggiamento(`Q${id}_${fila}_${idx}_${Date.now()}`, id)] };
        break;
      case 'crescita':
        itemList = { growth_items: [{ amount: quanti, mst_growth_item_id: id }] };
        break;
      case 'limitato':
        itemList = { limiteds: [{ amount: quanti, mst_limited_id: id }] };
        break;
      default:
        itemList = { materials: [{ amount: quanti, mst_material_id: id }] };
    }

    const slot: Record<string, unknown> = {
      idx,
      is_katamari: 0,
      zeny: 1,
      value: 1,
      item_list: itemList,
    };
    // il primo riquadro porta anche i punti evento, come faceva prima
    if (conPuntiEvento && idx === 1) {
      slot.extend = {
        item_list: { points: [{ amount: 5, mst_event_point_id: 3994654250 }] },
        zeny: 0,
      };
    }
    return slot;
  });

  /*
   * Tre file: quella principale piu' le due casse bonus (add_list.line2 e
   * line3). Anche quelle erano rimaste al materiale fisso 1714092880 e, come
   * la fila principale prima del fix, non venivano accreditate: si vedevano a
   * schermo e in inventario non arrivava niente. Pescando qui dentro finiscono
   * tutte e tre nella stessa mappa `vinti`, quindi cio' che il giocatore vede
   * e' esattamente cio' che riceve.
   */
  return {
    slots: costruisciFila(1, true),
    bonus2: costruisciFila(2, false),
    bonus3: costruisciFila(3, false),
    vinti,
  };
}

interface VoceQuantita {
  amount?: number | null;
}

interface BoxPremi {
  materials?: (VoceQuantita & { mst_material_id?: number | null })[];
  growth_items?: (VoceQuantita & { mst_growth_item_id?: number | null })[];
  limiteds?: (VoceQuantita & { mst_limited_id?: number | null })[];
  equipments?: { equipment_id?: string | null; mst_equipment_id?: number | null }[];
}

/**
 * Accredita i premi vinti, ognuno nell'array giusto della box.
 * Restituisce un riepilogo per il log.
 */
function accreditaPremi(box: BoxPremi, vinti: Map<number, { quanti: number; famiglia: Famiglia }>) {
  const conteggio = { materiale: 0, crescita: 0, limitato: 0, equipaggiamento: 0 };

  /** Somma una quantita' a un array "a mucchietto" (materiali/crescita/limitati). */
  const somma = <T extends VoceQuantita>(
    arr: T[], trovato: (v: T) => boolean, crea: () => T, quanti: number,
  ) => {
    const v = arr.find(trovato);
    if (v) v.amount = Number(v.amount ?? 0) + quanti;
    else arr.push(crea());
  };

  for (const [id, { quanti, famiglia }] of vinti) {
    switch (famiglia) {
      case 'materiale':
        if (!box.materials) box.materials = [];
        somma(box.materials, (m) => Number(m?.mst_material_id) === id,
          () => ({ mst_material_id: id, amount: quanti }), quanti);
        conteggio.materiale++;
        break;

      case 'crescita':
        if (!box.growth_items) box.growth_items = [];
        somma(box.growth_items, (m) => Number(m?.mst_growth_item_id) === id,
          () => ({ mst_growth_item_id: id, amount: quanti }), quanti);
        conteggio.crescita++;
        break;

      case 'limitato':
        if (!box.limiteds) box.limiteds = [];
        somma(box.limiteds, (m) => Number(m?.mst_limited_id) === id,
          () => ({ mst_limited_id: id, amount: quanti }), quanti);
        conteggio.limitato++;
        break;

      case 'equipaggiamento': {
        if (!box.equipments) box.equipments = [];
        /*
         * Un equipaggiamento e' un'istanza, non una quantita': due spade uguali
         * sono due righe con lo stesso mst_equipment_id ma equipment_id diversi
         * — se coincidessero il client le considererebbe lo stesso oggetto e ne
         * mostrerebbe una sola. Si cerca quindi un identificativo libero.
         */
        const usati = new Set(box.equipments.map((e) => String(e?.equipment_id)));
        for (let n = 0; n < quanti; n++) {
          let idIstanza = `Q${id}`;
          let contatore = 2;
          while (usati.has(idIstanza)) idIstanza = `Q${id}_${contatore++}`;
          usati.add(idIstanza);
          box.equipments.push(nuovoEquipaggiamento(idIstanza, id));
        }
        conteggio.equipaggiamento++;
        break;
      }
    }
  }
  return conteggio;
}

export const islandEnd = async (req: Request, res: Response) => {
  try {
    const { mst_quest_id, clear_time, session_id } = req.body as IslandEndInput;
    const cleared_quest = mst_quest_id;
    const clearTime = clear_time;
    const filter = { current_session: session_id };
    const quest = await QuestSheet.findOne({ mQuestID: String(cleared_quest) });
    log.debug('Rewards: %o', quest?.mRewardItemList);
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const cleared_quests = doc.cleared_quests;

    const questIndex = cleared_quests.findIndex((q) => q.mst_quest_id === cleared_quest);

    if (questIndex === -1) {
      log.debug('Inserted Quest as seen');
      cleared_quests.push({ mst_quest_id: cleared_quest, clear_time: clearTime });
    } else {
      log.debug('Updated clear_time...');
      cleared_quests[questIndex]!.clear_time = clearTime;
    }

    /*
     * Le ricompense si pescano QUI, prima di scrivere, e vengono accreditate
     * nella stessa operazione che segna la quest come completata.
     *
     * Prima venivano costruite solo dentro la risposta, piu' in basso: il
     * client le mostrava a fine caccia e nell'inventario non arrivava niente.
     * Era il bug piu' visibile del server — si cacciava per nulla.
     */
    const premi = buildRewardSlots(quest?.mRewardItemList);

    const update: Record<string, unknown> = { cleared_quests: cleared_quests };

    let augite: ReturnType<typeof daiAugite> = null;
    if (doc.box) {
      const c = accreditaPremi(doc.box as unknown as BoxPremi, premi.vinti);
      augite = daiAugite(doc.box.monument as { augite?: VoceAugite[] } | undefined);
      if (augite) log.info('輝石 | %s riceve %d x tipo %d', doc.character_name ?? '?', augite.amount, augite.mst_monument_type_id);
      // 狩玉 guadagnati giocando (niente microtransazioni): servono per il gacha dei gatti.
      aggiungiKaridama(doc.box as { payments?: { mst_payment_id?: number | null; amount?: number | null }[] }, KARIDAMA_A_MISSIONE);
      log.info('狩玉 | %s riceve %d, saldo %d', doc.character_name ?? '?', KARIDAMA_A_MISSIONE, saldoKaridama(doc.box.payments));
      update.box = doc.box;
      log.info(
        'ricompense accreditate | quest=%s materiali=%d crescita=%d limitati=%d equipaggiamenti=%d',
        String(cleared_quest), c.materiale, c.crescita, c.limitato, c.equipaggiamento,
      );
    }

    // Await the update so you know it completed
    await User.findOneAndUpdate(filter, update, { new: true });
    const data = {
    advance_bingo_mission_ids: [],
    campaign_info: [
      //{mst_campaign_type_id:0,value:0}
    ],
    clear_bingo_mission_ids: [],
    clear_subtarget_ids: [],
    final_reward_info: {
      multiplier: 5, //Multiplyer on all rewards
      value: 2,
    },
    get_accum_reward_ids: [],
    get_guild_accum_reward_ids: [],
    get_loop_random_reward_ids: [],
    get_loop_reward_ids: [],
    get_mst_otomo_id: 2092467563,
    get_mst_partner_id: 507850012,
    increase_value: 7,
    is_pop_not_enough_zeny: 0, // could not auto synth due to lack of zeny?
    katamari_content_list: [
      // {
      //   elv:0,
      //   end_remain:0,
      //   is_awake:0,
      //   mst_equipment_id:0,
      //   prob_type_id:0,
      //   slv:0,
      //   start_remain:0,
      // }
    ],
    max_potential_equipments: [
      //"stingval"
    ],
    mst_part_id: 3815380063, //current
    open_list: {
      open_ocean: [
        /*{"mst_ocean_id":0}*/
      ],
      open_node: [
        /*{"mst_node_id":0}*/
      ],
      open_part: [
        //{mst_part_id:2053326309}
      ],
    },
    otomo_result: [
      //unk
      // {
      //   get_exp:10,
      //   mst_otomo_subskill_id:1355115484,
      //   otomo_id:"OT_OTOMO_CHAR_ID_001"
      // }
    ],
    partner_cap_list: [
      //unk
      // {
      //   level_cap_tier:0,
      //   mst_partner_id:0
      // }
    ],
    // Finestra dopo i premi. Prima mostrava 6 materiali finti mai accreditati;
    // ora i 輝石 davvero dati, nello stesso formato della storia (story.controller).
    pop_list: [{
      pop_id: 1,
      item_list: {
        ...(augite ? { monument: { augite: [augite], hr: 0, mlv: { atk: 0, def: 0, hp: 0, sp: 0 } } } : {}),
        payments: [{ mst_payment_id: KARIDAMA_PRINCIPALE, amount: KARIDAMA_A_MISSIONE }],
      },
    }],
    ranking_num: 1, //unk
    rewards: {
      luck_value: 4,
      upper_luck_value: 10,
      multi_reward: {
        item_list: {
          materials: [{ amount: 14, mst_material_id: 1714092880 }],
        },
      },
      pick_reward: {
        item_list: {
          materials: [{ amount: 10, mst_material_id: 1714092880 }],
        },
      },
      break_reward: {
        item_list: {
          materials: [{ amount: 3, mst_material_id: 1714092880 }],
        },
      },
      bingo_reward: {
        item_list: {
          materials: [{ amount: 22, mst_material_id: 1714092880 }],
        },
      },
      friend_reward: {
        //Hunting Friend and Hunting Group Reward
        item_list: {
          materials: [{ amount: 5, mst_material_id: 1714092880 }],
        },
      },
      lucky_reward: {
        item_list: {
          materials: [{ amount: 12, mst_material_id: 1714092880 }],
        },
      },
      gold_reward: {
        //Money Luck Skill
        item_list: {
          materials: [{ amount: 6, mst_material_id: 1714092880 }],
        },
      },
      enemy_drop_reward: {
        item_list: {
          materials: [{ amount: 4, mst_material_id: 1714092880 }],
        },
      },
      break_drop_reward: {
        item_list: {
          materials: [{ amount: 2, mst_material_id: 1714092880 }],
        },
      },

      //DOUBLE CHECK BELOW START
      //This is the main reward screen
      normal_reward: {
        // Prima qui c'erano quattro voci fisse, tutte con lo stesso materiale
        // 1714092880: qualunque caccia dava sempre gli stessi premi. Ora si
        // pescano dalla lista della quest (mRewardItemList), con mProbScale
        // come peso, cosi' ogni battuta da' materiali diversi e coerenti con
        // la preda. Se la quest non ha premi si torna al vecchio valore fisso.
        // Gli stessi riquadri pescati sopra: cio' che si vede e' cio' che e'
        // stato messo in inventario, non una seconda estrazione.
        other_list_add: premi.slots,
        add_list: {
          /*
           * Le due casse bonus. Esistevano gia' nel client (con il loro
           * prezzo in diamanti) ma erano ferme al materiale fisso
           * 1714092880, e nessuno le accreditava: erano decorazione.
           * Ora pescano dalla stessa lista della quest e finiscono in
           * inventario insieme alla fila principale.
           *
           * is_open resta 1, cioe' gia' aperte: il client scala i diamanti
           * da solo e non esiste nessuna rotta con cui il server possa
           * verificare il pagamento (/quest/result/end risponde vuoto, come
           * nell'originale). Meglio regalarle che mostrarle a pagamento e
           * non riuscire a consegnarle: sarebbe di nuovo il bug di prima.
           */
          line2: {
            is_open: 1,
            other_list: premi.bonus2,
            price: 5,
          },
          line3: {
            is_open: 1,
            other_list: premi.bonus3,
            price: 5,
          },
        },
      },
      raid_reward: {
        item_list: {
          materials: [{ amount: 1, mst_material_id: 1714092880 }],
        },
      },
      point_info: {
        armor_skill_value: 2,
        campaign_value: 2,
        get_point: 2,
        guild_bingo_bonus: 2,
        guild_total_point: 2,
        m16_get_point: 2,
        mst_event_info_id: 2,
        mst_event_point_id: 2,
        now_point: 2,
        total_point: 2,
      },

      score_enemy_list: [
        //unk
      ],
      zeny: 30,
    },

    view_collection_list: [], ////unk
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandEnd:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island end failed');
  }
};

export const islandMapAll = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as IslandMapAllInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }

    const plainDoc = doc.toObject();
    const oceanPlain = plainDoc.tutorial_step == 0xffff
      ? full_island
      : plainDoc.ocean_list;
    const clearedPlain = plainDoc.cleared_quests;

    const final_ocean = await enrichOceanData(oceanPlain, clearedPlain);
    log.debug('FINAL ocean data: %o', final_ocean);
    const data = {
      ocean_list: final_ocean,
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandMapAll:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island map all failed');
  }
};

import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import { calcMstId as _calcMstId } from '../../../services/defineService.js';
import prezziVendita from '../../../json/prezzi-vendita.json' with { type: 'json' };
import type { BoxGetInput, StorageGetInput, EquipLevelupInput, EquipAwakeInput, PotentialupAutoSetInput, SaleInput, FavoriteSetInput, MonumentLevelupInput } from './box.schema.js';
const log = createLogger('box');

export const get = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const data = {
      box: doc.box,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in box get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get box failed');
  }
};
export const storageInfo = (req: Request, res: Response) => {
  const data = {
    storage_info: {
      storage_details: [
        {
          max: 200,
          name: '装備倉庫1',
          now: 0,
          storage_idx: 1,
        },
      ],
      storage_limit: 5,
      storage_num: 1,
    },
  };
  encryptAndSend(data, res, req);
};

export const storageGet = (req: Request, res: Response) => {
  const { target_idx: _target_idx } = req.body as StorageGetInput;

  const data = {
    storage_info: {
      storage_details: [
        {
          max: 200,
          name: '装備倉庫1',
          now: 0,
          storage_idx: 1,
        },
      ],
      storage_limit: 5,
      storage_num: 1,
    },

    storages: [
      {
        awaked: 1,
        created: 1625155200,
        elv: 5,
        endAwakeCount: 3,
        endAwakeRemain: 1,
        end_remain: 10,
        equipment_id: 'EQP123456',
        favorite: 0,
        is_awake: 1,
        mst_equipment_id: 2006810019,
        potential: 120,
        slv: 4,
        start_remain: 15,
        storage_idx: 1,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const otomoGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }
    const data = {
      otomos: doc.box.otomos,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in otomoGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get otomo box failed');
  }
};

// Analoga a otomoGet sopra: la "get" per i gatti Partner (nekojara) non
// era mai stata scritta (box.router.ts la aveva solo commentata), quindi il
// client non poteva nemmeno elencare quali Partner possiede il giocatore —
// box.partners esiste gia' sul modello (vedi model/user.ts) e viene
// popolato da tutorial/quest, semplice passthrough di dati reali, nessun id
// inventato.
export const partnerGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }
    const data = {
      partners: doc.box.partners,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in partnerGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get partner box failed');
  }
};

export const equipCapacityInfo = (req: Request, res: Response) => {
  const data = {
    max: 10000,
    now: 0,
    price: 0,
  };
  encryptAndSend(data, res, req);
};

export const equipCapacityExpand = (req: Request, res: Response) => {
  const data = {
    max: 10000,
    now: 0,
    price: 0,
  };
  encryptAndSend(data, res, req);
};

export const stampGet = (req: Request, res: Response) => {
  const data = {
    stamp_sets: [
      {
        created: 0,
        mst_stamp_set_id: 67667029,
      },
    ],
  };
  encryptAndSend(data, res, req);
};
export const stampHoldGet = (req: Request, res: Response) => {
  const data = {
    hold_stamp_ids: [
      //numbers
    ],
  };
  encryptAndSend(data, res, req);
};
export const stampShopList = (req: Request, res: Response) => {
  const data = {
    stamp_shop_list: [
      {
        end: 0,
        mst_stamp_set_id: 67667029,
        remain_id: 0,
        start: 0,
        type: 0,
        value: 0,
      },
    ],
  };
  encryptAndSend(data, res, req);
};
export const paymentLimitGet = (req: Request, res: Response) => {
  const data = {
    payment_limits: [
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 1573159746,
      },
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 3301823224,
      },
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 3016417902,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

// Tipi di valuta premium noti, con la quantita' di partenza usata quando
// l'utente non ne possiede affatto. Serve tenerli tutti nella risposta: il
// client si aspetta l'elenco completo, non solo quelli che il giocatore ha.
const PAYMENT_DEFAULTS = [
  { amount: 99999, mst_payment_id: 1573159746 },
  { amount: 25, mst_payment_id: 3301823224 },
  { amount: 5, mst_payment_id: 3016417902 },
  { amount: 3, mst_payment_id: 766408653 },
  { amount: 2, mst_payment_id: 1521043291 },
  { amount: 1, mst_payment_id: 3282048737 },
];

export const PaymentGet = async (req: Request, res: Response) => {
  try {
    // Prima restituiva la lista qui sopra fissa, senza mai guardare il database:
    // qualunque cosa si scrivesse in box.payments veniva ignorata, e il giocatore
    // vedeva sempre e solo i valori di partenza. Ora vince il salvataggio vero.
    const { session_id } = req.body as { session_id: string };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const posseduti = new Map<number, number>();
    for (const p of doc.box?.payments ?? []) {
      if (typeof p?.mst_payment_id === 'number') {
        posseduti.set(p.mst_payment_id, p.amount ?? 0);
      }
    }

    // Ogni tipo noto con la quantita' dell'utente se ce l'ha, altrimenti il default.
    const payments = PAYMENT_DEFAULTS.map((d) => ({
      mst_payment_id: d.mst_payment_id,
      amount: posseduti.has(d.mst_payment_id) ? posseduti.get(d.mst_payment_id)! : d.amount,
    }));

    // Eventuali valute possedute che non sono nell'elenco noto: le aggiungo in coda.
    for (const [id, amount] of posseduti) {
      if (!PAYMENT_DEFAULTS.some((d) => d.mst_payment_id === id)) {
        payments.push({ mst_payment_id: id, amount });
      }
    }

    encryptAndSend({ payments }, res, req);
  } catch (error) {
    log.error('Error in payment get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get payments failed');
  }
};

export const equipLevelup = async (req: Request, res: Response) => {
  try {
    // Authenticate by session
    const { session_id, eqp_obj_id, num } = req.body as EquipLevelupInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }

    const equipmentId: string = eqp_obj_id;
    const steps: number = Math.max(1, num || 1);

    // Find equipment in user's box
    const equipmentIndex = doc.box.equipments!.findIndex((eq) => eq.equipment_id === equipmentId);

    if (equipmentIndex === -1) {
      // Equipment not found
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }

    // Apply level up
    const equipment = doc.box.equipments?.[equipmentIndex];
    if (!equipment) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }
    const currentLevel = equipment.elv || 0;
    const newLevel = currentLevel + steps;
    equipment.elv = newLevel;

    // Optional: handle zenny/material consumption when is_use_reinforcement == 2
    // Not fully implemented due to pricing tables/material ids pending in repo

    // Persist
    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    const data = {
      levelup: {
        equipment: equipment,
      },
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipLevelup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment level up failed');
  }
};
// TODO: Equipment awakening is not implemented. Requires knowledge of awakening
// mechanics (karidama consumption, resource equipment merging, stat changes).
// Currently returns the session-authenticated user's equipment unchanged.
export const awake = async (req: Request, res: Response) => {
  try {
    const { session_id, base_equipment_id } = req.body as EquipAwakeInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }
    const equipment = doc.box.equipments!.find((eq) => eq.equipment_id === base_equipment_id);

    const data = {
      equipment: equipment ?? {},
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in awake:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment awake failed');
  }
};

export const potentialupAutoSet = (req: Request, res: Response) => {
  try {
    const { eqp_obj_infos: _eqp_obj_infos } = req.body as PotentialupAutoSetInput;
    //todo make real data
    const data = {
      base_equipment: {
        auto_potential_composite: 12345,
        awaked: 1,
        created: 1700000000,
        elv: 5,
        endAwakeCount: 10,
        endAwakeRemain: 3,
        end_remain: 100,
        equipment_id: 'EQP_ABC123',
        evolve_start_time: 1700001234,
        favorite: 0,
        is_awake: 1,
        is_complete_auto_potential_composite: 0,
        mst_equipment_id: 987654,
        potential: 222,
        slv: 3,
        start_remain: 200,
      },
      payments: [
        {
          amount: 500,
          mst_payment_id: 1001,
        },
      ],
      resource_equipments: [
        {
          auto_potential_composite: 123,
          awaked: 0,
          created: 1699999999,
          elv: 2,
          endAwakeCount: 5,
          endAwakeRemain: 1,
          end_remain: 50,
          equipment_id: 'EQP_XYZ999',
          evolve_start_time: 1700001111,
          favorite: 1,
          is_awake: 1,
          is_complete_auto_potential_composite: 0,
          mst_equipment_id: 444444,
          potential: 333,
          slv: 2,
          start_remain: 75,
        },
      ],
      resource_materials: [
        {
          amount: 20,
          mst_material_id: 3001,
        },
        {
          amount: 50,
          mst_material_id: 3002,
        },
      ],
      zeny: 999999,
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in potentialupAutoSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Potential up auto set failed');
  }
};

/*
 * Vendita e preferiti. Formati letti dal gioco (libMHS.so, Ghidra):
 * - box/equipment/sale: richiesta { eqp_obj_ids }, risposta
 *   { equip_sell: { zeny, point: { amount, mst_event_point_id }, eqp_obj_ids } }.
 *   sServer::setupBoxEquipmentSaleResponse toglie dalla box ogni pezzo di
 *   eqp_obj_ids e IMPOSTA gli zeny al valore ricevuto (totale, non guadagno).
 * - box/material/sell: richiesta { material: { amount, mst_material_id } },
 *   risposta { zeny, material: { amount, mst_material_id } }. Il gioco cerca
 *   material.mst_material_id nella sua box SENZA controllare che esista: con la
 *   vecchia risposta vuota {} cercava il materiale 0 e andava in crash.
 * - box/equipment/favorite/set: richiesta { is_favorite, eqp_obj_id }, risposta
 *   { favorite_set: { equipment } } col pezzo aggiornato (prima vuoto: crash).
 * Prezzi da prezzi-vendita.json (tools-js/costruisci-prezzi-vendita.cjs, dai
 * file del gioco: mSellValue degli equipaggiamenti, mTradePoint dei materiali).
 */
const PREZZO_EQUIP = (prezziVendita as { e: Record<string, number> }).e;
const PREZZO_MATERIALE = (prezziVendita as { m: Record<string, number> }).m;

function sessioneDa(body: unknown): string | null {
  const s = (body as { session_id?: unknown } | undefined)?.session_id;
  return typeof s === 'string' && s ? s : null;
}

/** equipment_id usati in un set equipaggiamento: non si vendono, il set resterebbe rotto. */
function pezziIndossati(equipset: unknown): Set<string> {
  const usati = new Set<string>();
  for (const m of JSON.stringify(equipset ?? {}).matchAll(/"equipment_id":"([^"]+)"/g)) usati.add(m[1]!);
  return usati;
}

/** Il gioco IMPOSTA l'importo del punto ricevuto: si rimanda un punto gia' posseduto, invariato. */
function puntoInvariato(points: unknown): { amount: number; mst_event_point_id: number } {
  const lista = Array.isArray(points) ? (points as { amount?: number; mst_event_point_id?: number }[]) : [];
  const p = lista.find((x) => x?.mst_event_point_id);
  return p ? { amount: Number(p.amount ?? 0), mst_event_point_id: Number(p.mst_event_point_id) } : { amount: 0, mst_event_point_id: 0 };
}

export const sale = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const ids = (req.body as SaleInput).eqp_obj_ids;
    const richiesti = new Set((Array.isArray(ids) ? ids : []).map(String));
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    const indossati = pezziIndossati(doc.equipset);
    const venduti: string[] = [];
    let guadagno = 0;
    const restano = (doc.box.equipments ?? []).filter((p) => {
      const id = String(p.equipment_id);
      if (!richiesti.has(id) || p.favorite || indossati.has(id)) return true;
      venduti.push(id);
      guadagno += PREZZO_EQUIP[String(p.mst_equipment_id)] ?? 0;
      return false;
    });
    const zeny = Number(doc.box.zeny ?? 0) + guadagno;
    if (venduti.length) {
      await User.updateOne({ _id: doc._id }, { $set: { 'box.equipments': restano, 'box.zeny': zeny } });
    }
    log.info('vendita equip | %s vende %d pezzi (%d chiesti) per %d zeny, totale %d',
      doc.character_name ?? '?', venduti.length, richiesti.size, guadagno, zeny);
    encryptAndSend({ equip_sell: { zeny, point: puntoInvariato(doc.box.points), eqp_obj_ids: venduti } }, res, req);
  } catch (error) {
    log.error('Error in sale:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment sale failed');
  }
};

export const materialSell = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const richiesta = (req.body as { material?: { amount?: unknown; mst_material_id?: unknown } }).material ?? {};
    const idMateriale = Number(richiesta.mst_material_id);
    const quanti = Math.max(0, Math.floor(Number(richiesta.amount) || 0));
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    // Le righe doppie dello stesso materiale (nate dal tutorial) vengono unite in una.
    const materiali = doc.box.materials ?? [];
    const suoi = materiali.filter((m) => Number(m.mst_material_id) === idMateriale);
    if (!Number.isFinite(idMateriale) || !suoi.length) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Material not found');
    }
    const posseduti = suoi.reduce((t, m) => t + Number(m.amount ?? 0), 0);
    const venduti = Math.min(quanti, posseduti);
    const rimasti = posseduti - venduti;
    const guadagno = venduti * (PREZZO_MATERIALE[String(idMateriale)] ?? 0);
    const zeny = Number(doc.box.zeny ?? 0) + guadagno;
    const altri = materiali.filter((m) => Number(m.mst_material_id) !== idMateriale);
    const nuovi = rimasti > 0 ? [...altri, { mst_material_id: idMateriale, amount: rimasti }] : altri;
    await User.updateOne({ _id: doc._id }, { $set: { 'box.materials': nuovi, 'box.zeny': zeny } });
    log.info('vendita materiale | %s vende %d x %d per %d zeny, ne restano %d',
      doc.character_name ?? '?', venduti, idMateriale, guadagno, rimasti);
    encryptAndSend({ zeny, material: { amount: rimasti, mst_material_id: idMateriale } }, res, req);
  } catch (error) {
    log.error('Error in materialSell:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Material sale failed');
  }
};

export const favoriteSet = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const { is_favorite, eqp_obj_id } = req.body as FavoriteSetInput;
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const indice = (doc.box.equipments ?? []).findIndex((p) => String(p.equipment_id) === String(eqp_obj_id));
    if (indice === -1) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment not found');
    }
    const valore = Number(is_favorite) ? 1 : 0;
    await User.updateOne({ _id: doc._id }, { $set: { [`box.equipments.${indice}.favorite`]: valore } });
    const pezzo = doc.box.equipments![indice] as unknown as { toObject?: () => Record<string, unknown> } & Record<string, unknown>;
    const equipment: Record<string, unknown> = { ...(typeof pezzo.toObject === 'function' ? pezzo.toObject() : pezzo), favorite: valore };
    delete equipment._id;
    encryptAndSend({ favorite_set: { equipment } }, res, req);
  } catch (error) {
    log.error('Error in favoriteSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set favorite failed');
  }
};

export const leveupAuto = async (req: Request, res: Response) => {
  try {
    const { session_id, type } = req.body as MonumentLevelupInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    if (!doc.box?.monument?.mlv) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Monument data not found');
    }
    /*
     * Ogni livello consuma 10 輝石 del tipo giusto (la schermata mostra "x N / 10").
     * ID dalla tabella del gioco item_augite. Prima solo 'hp' li consumava e
     * atk/def/sp salivano gratis a ogni chiamata.
     */
    const AUGITE_PER_TIPO: Record<string, number> = { atk: 2483912298, def: 218378192, hp: 2047024966, sp: 3831991013 };
    const NECESSARI = 10;
    const idAugite = AUGITE_PER_TIPO[String(type)];
    const mlv = doc.box.monument.mlv as Record<string, number>;
    if (idAugite === undefined || !(String(type) in mlv)) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Unknown monument type');
    }
    const voce = (doc.box.monument.augite ?? []).find((item) => item.mst_augite_id === idAugite);
    if (!voce || (voce.amount ?? 0) < NECESSARI) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Not enough augite');
    }
    voce.amount = (voce.amount ?? 0) - NECESSARI;
    mlv[String(type)] = (mlv[String(type)] ?? 0) + 1;
    doc.box.monument.hr = doc.box.monument.hr + 1;
    const update = { box: doc.box };

    await User.findByIdAndUpdate(doc.id, update);
    const data = {
      monument_levelup: {
        capacity: doc.box.capacity,
        monument: doc.box.monument,
      },
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in leveupAuto:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Monument level up failed');
  }
};

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { progress, islandInfoGet, historyGet, QuestList, result, start, returnHome } from './nyanken.controller.js';
import User from '../../../model/user.js';
import pool from '../../../json/nyanken-equip.json' with { type: 'json' };
import categorie from '../../../json/nyanken-categorie.json' with { type: 'json' };
import userDefaults from '../../../json/user-defaults.json' with { type: 'json' };
import { ERROR_CODE } from '../../../constants/error.codes.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('nyanken.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('progress', () => {
    it('without an expedition answers "none" (no fixed fake data)', async () => {
      const { req, res } = mockReqRes({});
      await progress(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ mst_nyanken_id: 0, return_time: 0, currency_ammount: 0 }), res, req);
    });
  });

  describe('islandInfoGet', () => {
    it('returns island info with area rewards', () => {
      const { req, res } = mockReqRes({});
      islandInfoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          area_info_list: expect.any(Array),
          area_reward_list: expect.arrayContaining([
            expect.objectContaining({ reward_id: 0 }),
          ]),
          mst_nyanken_id: 9116,
        }),
        res,
        req,
      );
    });
  });

  describe('historyGet', () => {
    it('returns history data with zeroed values', () => {
      const { req, res } = mockReqRes({});
      historyGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          mst_nyanken_id: 9116,
          balloon_color_id: 0,
          message_leaving: 'message_leaving',
          message_waiting: 'message_waiting',
        }),
        res,
        req,
      );
    });
  });

  describe('QuestList', () => {
    it('lists the 13 real expeditions, one entry each, in order', () => {
      const { req, res } = mockReqRes({});
      QuestList(req, res);

      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      const lista = (data as { questDataList: Record<string, unknown>[] }).questDataList;
      expect(lista).toHaveLength(13);
      expect(lista.map((q) => q.mst_nyanken_id)).toEqual(categorie.map((c) => c.mst_nyanken_id));
      expect(new Set(lista.map((q) => q.mst_nyanken_id)).size).toBe(13);
      expect(lista[0]).toEqual(expect.objectContaining({ mst_nyanken_id: 2022298312, name: '秘境探検クエスト', sort_key: 1 }));
      // Tutti i campi di nResponse::Questdatalist che il gioco legge.
      const campi = ['beginner_flag', 'close', 'currency_ammount', 'currency_type', 'discount_currency_ammount', 'end',
        'mst_banner_id', 'mst_nyanken_id', 'open', 'play_limit', 'play_now', 'quest_state', 'quest_time',
        'sequence_no', 'sort_key', 'start', 'time_display_flag', 'name', 'island_info'];
      for (const q of lista) for (const k of campi) expect(q).toHaveProperty(k);
    });
  });
});

describe('nyanken result (spedizione)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Spedizione gia' tornata (fine nel passato): i premi si possono ritirare.
  const tornata = (id = 2022298312) => ({ mst_nyanken_id: id, inizio: 1000, fine: 2000 });
  const utente = (equipments: { equipment_id: string }[], eqp_box = 200) => ({
    _id: 'u1', character_name: 'Heroic69', nyanken_cooldown: tornata(), box: { equipments, capacity: { eqp_box }, payments: [] },
  });

  it('gives 3 real, not-yet-owned pieces shaped exactly like DEFAULT_EQUIPMENT', async () => {
    const posseduto = pool[0]!.n;
    vi.mocked(User.findOne).mockResolvedValue(utente([{ equipment_id: posseduto }]) as never);
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);

    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    const pezzi = (data as { result_list: { equipments: Record<string, unknown>[] } }).result_list.equipments;
    const campiDefault = Object.keys(userDefaults.DEFAULT_EQUIPMENT[0]!).sort();
    const codiciPool = new Map(pool.map((v) => [v.n, v.i]));
    expect(pezzi).toHaveLength(3);
    for (const p of pezzi) {
      expect(Object.keys(p).sort()).toEqual(campiDefault);
      expect(codiciPool.get(p.equipment_id as string)).toBe(p.mst_equipment_id);
      expect(p.equipment_id).not.toBe(posseduto);
    }
    expect(new Set(pezzi.map((p) => p.equipment_id)).size).toBe(3);
    // Prima si chiude la spedizione (una volta sola), poi si consegna.
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1', 'nyanken_cooldown.fine': 2000 }, { $set: { 'nyanken_cooldown.fine': 0 } });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, expect.objectContaining({ $push: { 'box.equipments': { $each: pezzi } } }));
  });

  it('gives nothing when the box is full', async () => {
    vi.mocked(User.findOne).mockResolvedValue(utente([{ equipment_id: 'A' }, { equipment_id: 'B' }], 2) as never);
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    expect((data as { result_list: { equipments: unknown[] } }).result_list.equipments).toEqual([]);
    expect(User.updateOne).not.toHaveBeenCalledWith({ _id: 'u1' }, expect.objectContaining({ $push: expect.anything() }));
  });

  it('rejects an unknown session', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    const { req, res } = mockReqRes({ session_id: 'nope' });
    await result(req, res);
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  });
});

describe('nyanken result senza sessione', () => {
  it('never looks up a user when session_id is missing', async () => {
    vi.resetAllMocks();
    const { req, res } = mockReqRes({});
    await result(req, res);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  });
});

describe('nyanken: premi filtrati per spedizione', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const ARMATURE = new Set(['arm', 'body', 'head', 'leg', 'waist']);
  type Voce = { n: string; r: number; c: string; e?: number };
  const voci = new Map((pool as Voce[]).map((v) => [v.n, v]));
  const idDi = (nome: string) => categorie.find((c) => c.nome === nome)!.mst_nyanken_id;
  // La categoria dei premi e' quella della spedizione partita (salvata allo start).
  const spedisci = async (salvato: number) => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'u1', character_name: 'Heroic69', nyanken_cooldown: { mst_nyanken_id: salvato, inizio: 1000, fine: 2000 },
      box: { equipments: [], capacity: { eqp_box: 200 }, payments: [] },
    } as never);
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls.at(-1)!;
    return (data as { result_list: { equipments: { equipment_id: string }[] } }).result_list.equipments.map((p) => voci.get(p.equipment_id)!);
  };

  it('fire expedition gives only fire weapons', async () => {
    for (let k = 0; k < 5; k++) {
      const pezzi = await spedisci(idDi('火属性装備クエスト'));
      expect(pezzi).toHaveLength(3);
      for (const v of pezzi) {
        expect(ARMATURE.has(v.c)).toBe(false);
        expect(v.e).toBe(1);
      }
    }
  });

  it('★6★7 weapon expedition gives only rarity 6-7 weapons', async () => {
    for (let k = 0; k < 5; k++) {
      for (const v of await spedisci(idDi('★6★7武器確定クエスト'))) {
        expect(ARMATURE.has(v.c)).toBe(false);
        expect([6, 7]).toContain(v.r);
      }
    }
  });

  it('armor expedition gives only armor', async () => {
    const pezzi = await spedisci(idDi('新防具クエスト'));
    expect(pezzi).toHaveLength(3);
    for (const v of pezzi) expect(ARMATURE.has(v.c)).toBe(true);
  });

  it('an unknown saved id falls back to the general expedition instead of failing', async () => {
    expect(await spedisci(9116)).toHaveLength(3);
  });

  it('the pool has no "no equipment" placeholders (AD_*000)', () => {
    expect((pool as Voce[]).some((v) => /^AD_[A-Z]+000$/.test(v.n))).toBe(false);
  });
});

describe('nyanken: spedizione con il timer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const ORA = new Date('2026-09-30T12:00:00Z').getTime();
  const KARIDAMA = 3301823224;
  const giocatore = (cooldown: Record<string, number>, gemme = 50) => ({
    _id: 'u1', character_name: 'Heroic69', nyanken_cooldown: cooldown,
    box: { equipments: [], capacity: { eqp_box: 200 }, payments: [{ mst_payment_id: KARIDAMA, amount: gemme }] },
  });
  const ID_ARMI67 = categorie.find((c) => c.nome === '★6★7武器確定クエスト')!.mst_nyanken_id;

  it('start is free and sets the return time from the expedition duration', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: 0, fine: 0 }) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: ID_ARMI67 });
    await start(req, res);
    const fine = ORA + 480 * 60_000;
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'nyanken_cooldown.mst_nyanken_id': ID_ARMI67, 'nyanken_cooldown.inizio': ORA, 'nyanken_cooldown.fine': fine } });
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ mst_nyanken_id: ID_ARMI67, return_time: 480 * 60, currency_ammount: 15, discount_currency_ammount: 15 }), res, req);
  });

  it('a repeated start while the cats are out does not restart the timer', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: ID_ARMI67, inizio: ORA - 60_000, fine: ORA + 3_600_000 }) as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: 2022298312 });
    await start(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ mst_nyanken_id: ID_ARMI67, return_time: 3600 }), res, req);
  });

  it('progress shows the remaining time and a price that drops as time passes', async () => {
    // A meta' strada: 15 * 1/2 -> 8 狩玉.
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: ID_ARMI67, inizio: ORA - 3_600_000, fine: ORA + 3_600_000 }) as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await progress(req, res);
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ mst_nyanken_id: ID_ARMI67, return_time: 3600, currency_ammount: 8, discount_currency_ammount: 8 }), res, req);
  });

  it('result before the cats are back is refused with a normal message, and gives nothing', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: ID_ARMI67, inizio: ORA, fine: ORA + 600_000 }) as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, 2, expect.stringContaining('10 min'));
  });

  it('result without an expedition gives nothing (no more free draws)', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: 0, fine: 0 }) as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    expect((data as { result_list: { equipments: unknown[] } }).result_list.equipments).toEqual([]);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('return pays the current price and brings the cats back now', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: ID_ARMI67, inizio: ORA - 3_600_000, fine: ORA + 3_600_000 }, 20) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: ID_ARMI67 });
    await returnHome(req, res);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.payments': [{ mst_payment_id: KARIDAMA, amount: 12 }], 'nyanken_cooldown.fine': ORA } });
    expect(encryptAndSend).toHaveBeenCalledWith({ mst_nyanken_id: ID_ARMI67, payments: [{ mst_payment_id: KARIDAMA, amount: 12 }], return_time: 0 }, res, req);
  });

  it('return without enough karidama: normal message, nothing changes', async () => {
    vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: ID_ARMI67, inizio: ORA, fine: ORA + 3_600_000 }, 3) as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: ID_ARMI67 });
    await returnHome(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, 2, expect.stringContaining('3/15'));
  });

  it('the cats bring 3 or 5 karidama, shown as a normal reward (never the whole balance)', async () => {
    const ID_BREVE = categorie.find((c) => c.nome === '秘境探検クエスト')!.mst_nyanken_id;
    for (const [id, attese] of [[ID_BREVE, 3], [ID_ARMI67, 5]] as const) {
      vi.mocked(encryptAndSend).mockClear();
      vi.mocked(User.findOne).mockResolvedValue(giocatore({ mst_nyanken_id: id, inizio: ORA - 7_200_000, fine: ORA - 1000 }, 10_000) as never);
      vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
      const { req, res } = mockReqRes({ session_id: 's1' });
      await result(req, res);
      const [data] = vi.mocked(encryptAndSend).mock.calls.at(-1)!;
      const d = data as { disp_last_one_result: unknown; last_one_result: unknown; payments: { amount: number }[]; result_list: { payments: unknown[] } };
      expect(d.result_list.payments).toEqual([{ mst_payment_id: KARIDAMA, amount: attese }]);
      expect(d.disp_last_one_result).toEqual({});
      expect(d.last_one_result).toEqual({});
      expect(d.payments[0]!.amount).toBe(10_000 + attese);
    }
  });

  it('questlist shows the duration of each expedition and the full return price', () => {
    const { req, res } = mockReqRes({});
    QuestList(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls.at(-1)!;
    const lista = (data as { questDataList: { name: string; currency_ammount: number; quest_time: number }[] }).questDataList;
    for (const q of lista) {
      expect(q.currency_ammount).toBe(15);
      // uguale al prezzo: niente sconto finto "15 -> 0"
      expect((q as unknown as { discount_currency_ammount: number }).discount_currency_ammount).toBe(15);
    }
    expect(lista.find((q) => q.name === '秘境探検クエスト')!.quest_time).toBe(60);
    expect(lista.find((q) => q.name === '★6★7武器確定クエスト')!.quest_time).toBe(480);
  });
});

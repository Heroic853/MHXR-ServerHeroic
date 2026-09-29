import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { progress, islandInfoGet, historyGet, QuestList, result, start } from './nyanken.controller.js';
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
    it('returns nyanken progress data', () => {
      const { req, res } = mockReqRes({});
      progress(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          balloon_color_id: 3,
          mst_nyanken_id: 2022298312,
          currency_ammount: 5,
        }),
        res,
        req,
      );
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

  const utente = (equipments: { equipment_id: string }[], eqp_box = 200) => ({
    _id: 'u1', character_name: 'Heroic69', box: { equipments, capacity: { eqp_box }, payments: [] },
  });

  it('gives 3 real, not-yet-owned pieces shaped exactly like DEFAULT_EQUIPMENT', async () => {
    const posseduto = pool[0]!.n;
    vi.mocked(User.findOne).mockResolvedValue(utente([{ equipment_id: posseduto }]) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
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
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, expect.objectContaining({
      $push: { 'box.equipments': { $each: pezzi } },
    }));
  });

  it('gives nothing and writes nothing when the box is full', async () => {
    vi.mocked(User.findOne).mockResolvedValue(utente([{ equipment_id: 'A' }, { equipment_id: 'B' }], 2) as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await result(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    expect((data as { result_list: { equipments: unknown[] } }).result_list.equipments).toEqual([]);
    expect(User.updateOne).not.toHaveBeenCalled();
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
  const utente = (salvato = 0) => ({
    _id: 'u1', character_name: 'Heroic69', nyanken_cooldown: { mst_nyanken_id: salvato },
    box: { equipments: [], capacity: { eqp_box: 200 }, payments: [] },
  });
  const spedisci = async (body: Record<string, unknown>, salvato = 0) => {
    vi.mocked(User.findOne).mockResolvedValue(utente(salvato) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1', ...body });
    await result(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls.at(-1)!;
    return (data as { result_list: { equipments: { equipment_id: string }[] } }).result_list.equipments.map((p) => voci.get(p.equipment_id)!);
  };

  it('fire expedition gives only fire weapons', async () => {
    for (let k = 0; k < 5; k++) {
      const pezzi = await spedisci({ mst_nyanken_id: idDi('火属性装備クエスト') });
      expect(pezzi).toHaveLength(3);
      for (const v of pezzi) {
        expect(ARMATURE.has(v.c)).toBe(false);
        expect(v.e).toBe(1);
      }
    }
  });

  it('★6★7 weapon expedition gives only rarity 6-7 weapons', async () => {
    for (let k = 0; k < 5; k++) {
      for (const v of await spedisci({ mst_nyanken_id: idDi('★6★7武器確定クエスト') })) {
        expect(ARMATURE.has(v.c)).toBe(false);
        expect([6, 7]).toContain(v.r);
      }
    }
  });

  it('uses the expedition saved at start when the client does not send one', async () => {
    const pezzi = await spedisci({}, idDi('新防具クエスト'));
    expect(pezzi).toHaveLength(3);
    for (const v of pezzi) expect(ARMATURE.has(v.c)).toBe(true);
  });

  it('an unknown expedition id falls back to the general one instead of failing', async () => {
    expect(await spedisci({ mst_nyanken_id: 9116 })).toHaveLength(3);
  });

  it('the pool has no "no equipment" placeholders (AD_*000)', () => {
    expect((pool as Voce[]).some((v) => /^AD_[A-Z]+000$/.test(v.n))).toBe(false);
  });

  const conKaridama = (amount: number, pagata = false, id = 0) => ({
    _id: 'u1', character_name: 'Heroic69', nyanken_cooldown: { mst_nyanken_id: id, pagata },
    box: { equipments: [], capacity: { eqp_box: 200 }, payments: [{ mst_payment_id: 1573159746, amount }] },
  });

  it('start saves only an expedition that is in the list, and charges its 15 karidama', async () => {
    vi.mocked(User.findOne).mockResolvedValue(conKaridama(20) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: 123456 });
    await start(req, res);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, {
      $set: { 'nyanken_cooldown.mst_nyanken_id': 2022298312, 'nyanken_cooldown.pagata': true, 'box.payments': [{ mst_payment_id: 1573159746, amount: 5 }] },
    });
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ currency_ammount: 15 }), res, req);
  });

  it('with too few karidama answers with a normal error dialog (no crash, no 404) and charges nothing', async () => {
    vi.mocked(User.findOne).mockResolvedValue(conKaridama(3) as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: 2022298312 });
    await start(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, 2, expect.stringContaining('3/15'));
  });

  it('a repeated start for the same expedition is not charged twice', async () => {
    vi.mocked(User.findOne).mockResolvedValue(conKaridama(20, true, 2022298312) as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_nyanken_id: 2022298312 });
    await start(req, res);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'nyanken_cooldown.mst_nyanken_id': 2022298312, 'nyanken_cooldown.pagata': true } });
  });

  it('questlist shows the real cost of each expedition', () => {
    const { req, res } = mockReqRes({});
    QuestList(req, res);
    const [data] = vi.mocked(encryptAndSend).mock.calls.at(-1)!;
    for (const q of (data as { questDataList: { currency_ammount: number }[] }).questDataList) expect(q.currency_ammount).toBe(15);
  });
});

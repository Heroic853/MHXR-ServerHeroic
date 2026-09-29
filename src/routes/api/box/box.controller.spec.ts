import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../model/user');
vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../services/defineService');
vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import User from '../../../model/user.js';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { get, otomoGet, partnerGet, equipLevelup, storageInfo, sale, favoriteSet, leveupAuto, materialSell } from './box.controller.js';
import prezzi from '../../../json/prezzi-vendita.json' with { type: 'json' };

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('box.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('get', () => {
    it('returns box data for authenticated user', async () => {
      const mockBox = { equipments: [], monument: { hr: 1 } };
      vi.mocked(User.findOne).mockResolvedValue({
        box: mockBox,
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ box: mockBox }),
        res,
        req,
      );
    });

    it('returns 2004 when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad-sess' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('returns error on DB failure', async () => {
      vi.mocked(User.findOne).mockRejectedValue(new Error('DB error'));

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get box failed');
    });
  });

  describe('otomoGet', () => {
    it('returns otomos from user box', async () => {
      const mockOtomos = [{ otomo_id: 'OT_001', mst_otomo_id: 123 }];
      vi.mocked(User.findOne).mockResolvedValue({
        box: { otomos: mockOtomos },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await otomoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ otomos: mockOtomos }),
        res,
        req,
      );
    });

    it('returns error when box is missing', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ box: null } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await otomoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    });
  });

  describe('partnerGet', () => {
    it('returns partners from user box', async () => {
      const mockPartners = [{ partner_id: 'PT_001', mst_partner_id: 507850012 }];
      vi.mocked(User.findOne).mockResolvedValue({
        box: { partners: mockPartners },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ partners: mockPartners }),
        res,
        req,
      );
    });

    it('returns error when box is missing', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ box: null } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    });

    it('returns NOT_AUTHENTICATED when the session is unknown', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });
  });

  describe('equipLevelup', () => {
    it('levels up equipment by the specified amount', async () => {
      const mockEquipments = [{ equipment_id: 'EQP_001', elv: 3, mst_equipment_id: 123 }];
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'user-1',
        box: { equipments: mockEquipments },
      } as never);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        eqp_obj_id: 'EQP_001',
        num: 5,
      });

      await equipLevelup(req, res);

      expect(mockEquipments[0]!.elv).toBe(8);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          levelup: { equipment: expect.objectContaining({ elv: 8 }) },
        }),
        res,
        req,
      );
    });

    it('returns error when equipment not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'user-1',
        box: { equipments: [] },
      } as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        eqp_obj_id: 'MISSING',
      });

      await equipLevelup(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, 2001, 0, 'equipment not found');
    });
  });

  describe('storageInfo', () => {
    it('returns static storage info', () => {
      const { req, res } = mockReqRes();

      storageInfo(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          storage_info: expect.objectContaining({
            storage_limit: 5,
            storage_num: 1,
          }),
        }),
        res,
        req,
      );
    });
  });

  // Prezzi veri dai file del gioco (prezzi-vendita.json).
  const [ID_EQUIP, PREZZO_EQUIP] = Object.entries(prezzi.e)[0]!;
  const [ID_MAT, PREZZO_MAT] = Object.entries(prezzi.m)[0]!;
  const pezzo = (equipment_id: string, favorite = 0) => ({ equipment_id, mst_equipment_id: Number(ID_EQUIP), favorite });

  describe('sale', () => {
    it('removes the sold pieces, adds their game price and returns the NEW zeny total', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1', equipset: {}, box: { zeny: 1000, points: [], equipments: [pezzo('A'), pezzo('B'), pezzo('C')] },
      } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', eqp_obj_ids: ['A', 'C', 'NON_ESISTE'] });
      await sale(req, res);

      const totale = 1000 + 2 * PREZZO_EQUIP;
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.equipments': [pezzo('B')], 'box.zeny': totale } });
      expect(encryptAndSend).toHaveBeenCalledWith(
        { equip_sell: { zeny: totale, point: { amount: 0, mst_event_point_id: 0 }, eqp_obj_ids: ['A', 'C'] } }, res, req,
      );
    });

    it('never sells favorites or pieces worn in an equip set', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1', equipset: { sets: [{ weapon: { equipment_id: 'W' } }] },
        box: { zeny: 5, points: [], equipments: [pezzo('F', 1), pezzo('W')] },
      } as never);
      const { req, res } = mockReqRes({ session_id: 's1', eqp_obj_ids: ['F', 'W'] });
      await sale(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ equip_sell: expect.objectContaining({ zeny: 5, eqp_obj_ids: [] }) }), res, req);
    });
  });

  describe('materialSell', () => {
    it('sells from all duplicate rows, merges them and returns zeny total + remaining amount', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1',
        box: { zeny: 100, materials: [{ mst_material_id: Number(ID_MAT), amount: 3 }, { mst_material_id: 7, amount: 1 }, { mst_material_id: Number(ID_MAT), amount: 4 }] },
      } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', material: { mst_material_id: Number(ID_MAT), amount: 5 } });
      await materialSell(req, res);

      const totale = 100 + 5 * PREZZO_MAT;
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, {
        $set: { 'box.materials': [{ mst_material_id: 7, amount: 1 }, { mst_material_id: Number(ID_MAT), amount: 2 }], 'box.zeny': totale },
      });
      expect(encryptAndSend).toHaveBeenCalledWith({ zeny: totale, material: { amount: 2, mst_material_id: Number(ID_MAT) } }, res, req);
    });

    it('refuses a material the player does not have (the client would crash looking it up)', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { zeny: 1, materials: [] } } as never);
      const { req, res } = mockReqRes({ session_id: 's1', material: { mst_material_id: 123, amount: 1 } });
      await materialSell(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Material not found');
    });
  });

  describe('favoriteSet', () => {
    it('saves the flag and returns the real piece', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { equipments: [pezzo('X'), pezzo('Y')] } } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', is_favorite: 1, eqp_obj_id: 'Y' });
      await favoriteSet(req, res);
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.equipments.1.favorite': 1 } });
      expect(encryptAndSend).toHaveBeenCalledWith({ favorite_set: { equipment: { ...pezzo('Y'), favorite: 1 } } }, res, req);
    });

    it('refuses an unknown piece instead of inventing one', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { equipments: [] } } as never);
      const { req, res } = mockReqRes({ session_id: 's1', is_favorite: 1, eqp_obj_id: 'Z' });
      await favoriteSet(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment not found');
    });
  });
});

describe("monument leveupAuto (pietra HR)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  const utente = (augite: { amount: number; mst_augite_id: number; mst_monument_type_id: number }[]) => ({
    id: "u1",
    box: { capacity: {}, monument: { hr: 10, mlv: { atk: 1, def: 1, hp: 1, sp: 1 }, augite } },
  });

  it("attack level-up spends 10 攻撃の輝石 and raises atk and HR", async () => {
    const doc = utente([{ amount: 25, mst_augite_id: 2483912298, mst_monument_type_id: 1 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "atk" });
    await leveupAuto(req, res);
    expect(doc.box.monument.augite[0]!.amount).toBe(15);
    expect(doc.box.monument.mlv.atk).toBe(2);
    expect(doc.box.monument.hr).toBe(11);
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
  });

  it("refuses when the right augite is missing (hp augite does not pay for atk)", async () => {
    const doc = utente([{ amount: 9999, mst_augite_id: 2047024966, mst_monument_type_id: 3 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "atk" });
    await leveupAuto(req, res);
    expect(doc.box.monument.mlv.atk).toBe(1);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, "Not enough augite");
  });

  it("refuses with fewer than 10", async () => {
    const doc = utente([{ amount: 9, mst_augite_id: 2047024966, mst_monument_type_id: 3 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "hp" });
    await leveupAuto(req, res);
    expect(doc.box.monument.augite[0]!.amount).toBe(9);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

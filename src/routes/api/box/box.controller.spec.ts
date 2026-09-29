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
import { get, otomoGet, partnerGet, equipLevelup, storageInfo, sale, favoriteSet, leveupAuto } from './box.controller.js';

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

  describe('sale', () => {
    it('returns sale response data', () => {
      const { req, res } = mockReqRes({
        eqp_obj_ids: ['EQP_001'],
      });

      sale(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          equip_sell: expect.objectContaining({
            zeny: 750000,
          }),
        }),
        res,
        req,
      );
    });
  });

  describe('favoriteSet', () => {
    it('returns equipment with favorite flag set', () => {
      const { req, res } = mockReqRes({
        is_favorite: 1,
        eqp_obj_id: 'EQP_001',
      });

      favoriteSet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          favorite_set: expect.objectContaining({
            equipment: expect.objectContaining({
              equipment_id: 'EQP_001',
              favorite: 1,
            }),
          }),
        }),
        res,
        req,
      );
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

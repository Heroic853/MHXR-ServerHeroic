import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import {
  karidamaInfo,
  karidamaList,
  info,
  list,
  buy,
} from './shop.controller.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

// Un materiale vero preso dal catalogo (src/json/materiali.json), non
// inventato: lo stesso file da cui shop.controller.ts costruisce PER_ID, cosi'
// il test resta valido qualunque sia il campione mostrato in vetrina.
const MATERIALE_REALE = materiali[0]!;

describe('shop.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('karidamaInfo', () => {
    it('returns karidama shop info list', () => {
      const { req, res } = mockReqRes();
      karidamaInfo(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          karidama_shop_infos: expect.arrayContaining([
            expect.objectContaining({
              mst_karidama_shop_id: 1,
              name: 'karidama_shop',
            }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('karidamaList', () => {
    it('returns karidama shop items and type list', () => {
      const { req, res } = mockReqRes();
      karidamaList(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          karidama_shop_items: expect.arrayContaining([
            expect.objectContaining({
              mst_shop_item_id: 0,
              name: 'name',
              shop_type: 0,
            }),
          ]),
          type_list: expect.arrayContaining([
            expect.objectContaining({ name: 'test name', type: 0 }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('info', () => {
    it('returns shop infos with high/low upper shops', () => {
      const { req, res } = mockReqRes();
      info(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          high_upper_shop_info: expect.objectContaining({
            mst_shop_id: 1,
            name: 'test1',
          }),
          low_upper_shop_info: expect.objectContaining({
            mst_shop_id: 2,
            name: 'test2',
          }),
          shop_infos: expect.arrayContaining([
            expect.objectContaining({ mst_shop_id: 3, name: 'test3' }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('list', () => {
    it('returns real materials from materiali.json at 1 zeny each, on all three shelves', () => {
      const { req, res } = mockReqRes();
      list(req, res);

      const idsReali = new Set(materiali.map((m) => m.id));
      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      const shopItems = (data as { shop_items: { mst_shop_item_id: number; price: number }[] }).shop_items;

      expect(shopItems.length).toBeGreaterThan(0);
      for (const item of shopItems) {
        expect(idsReali.has(item.mst_shop_item_id)).toBe(true);
        expect(item.price).toBe(1);
      }
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          high_upper_shop_items: shopItems,
          low_upper_shop_items: shopItems,
          shop_items: shopItems,
        }),
        res,
        req,
      );
    });
  });

  describe('buy', () => {
    it('debits zeny, credits the material and saves the box', async () => {
      const box = { zeny: 10, materials: [] as { mst_material_id: number; amount: number }[] };
      const doc = { box, markModified: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 3,
        mst_shop_id: 3,
        mst_shop_item_id: MATERIALE_REALE.id,
      });
      await buy(req, res);

      expect(box.zeny).toBe(7);
      expect(box.materials).toEqual([{ mst_material_id: MATERIALE_REALE.id, amount: 3 }]);
      expect(doc.markModified).toHaveBeenCalledWith('box');
      expect(doc.save).toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(
        {
          item_contents: { materials: [{ amount: 3, mst_material_id: MATERIALE_REALE.id }] },
          payments: [],
          zeny: 7,
        },
        res,
        req,
      );
    });

    it('rejects an id that is not a real material, without touching the box', async () => {
      const box = { zeny: 10, materials: [] };
      const doc = { box, markModified: vi.fn(), save: vi.fn() };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 1,
        mst_shop_id: 3,
        mst_shop_item_id: 999999999,
      });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      expect(box.zeny).toBe(10);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        expect.any(Number),
        expect.anything(),
        'Oggetto non disponibile',
      );
    });

    it('rejects when the player does not have enough zeny', async () => {
      const box = { zeny: 0, materials: [] };
      const doc = { box, markModified: vi.fn(), save: vi.fn() };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 1,
        mst_shop_id: 3,
        mst_shop_item_id: MATERIALE_REALE.id,
      });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        expect.any(Number),
        expect.anything(),
        'Zeny insufficienti',
      );
    });
  });
});

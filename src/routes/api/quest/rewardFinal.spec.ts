import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import { rewardFinal, PREMIO_FINALE } from './questIsland.controller.js';
import { ERROR_CODE } from '../../../constants/error.codes.js';

const KARIDAMA = 3301823224;
const MATERIALE = 1714092880;
const req = { body: { session_id: 's1' }, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
const res = {} as Response;
const utente = (gemme: number, ultimi: unknown) => ({
  _id: 'u1', character_name: 'Heroic69',
  box: { payments: [{ mst_payment_id: KARIDAMA, amount: gemme }], materials: [{ mst_material_id: MATERIALE, amount: 2 }], growth_items: [], limiteds: [], equipments: [] },
  ultimi_premi: ultimi,
});

describe('quest/reward/final (tutti i premi x5)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('charges the price and adds the other 4 times of the last quest rewards', async () => {
    const doc = utente(10, { mst_quest_id: 42, vinti: [[MATERIALE, 2, 'materiale']] });
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    await rewardFinal(req, res);
    expect(doc.box.payments[0]!.amount).toBe(10 - PREMIO_FINALE.prezzo);
    expect(doc.box.materials[0]!.amount).toBe(2 + 2 * 4);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1', 'ultimi_premi.mst_quest_id': 42 }, { $set: { box: doc.box, ultimi_premi: null } });
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ payments: [{ mst_payment_id: KARIDAMA, amount: 8 }] }), res, req);
  });

  it('without enough karidama answers a normal error dialog and changes nothing', async () => {
    const doc = utente(1, { mst_quest_id: 42, vinti: [[MATERIALE, 2, 'materiale']] });
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    await rewardFinal(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(doc.box.payments[0]!.amount).toBe(1);
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, 2, expect.stringContaining('1/2'));
  });

  it('a second press (nothing left to multiply) costs nothing', async () => {
    const doc = utente(10, null);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    await rewardFinal(req, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(doc.box.payments[0]!.amount).toBe(10);
    expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ payments: [{ mst_payment_id: KARIDAMA, amount: 10 }] }), res, req);
  });
});

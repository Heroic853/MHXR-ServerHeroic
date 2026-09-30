import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import { questContinue, PREZZO_CONTINUA } from './quest.controller.js';
import { ERROR_CODE } from '../../../constants/error.codes.js';

const KARIDAMA = 3301823224;
const res = {} as Response;
const req = (body: Record<string, unknown>) => ({ body: { session_id: 's1', ...body }, ip: '1', get: vi.fn() } as unknown as Request);
const utente = (gemme: number, continua: unknown = null) => ({ _id: 'u1', character_name: 'Heroic69', box: { payments: [{ mst_payment_id: KARIDAMA, amount: gemme }] }, continua });

describe('quest/continue', () => {
  beforeEach(() => vi.resetAllMocks());

  it('costs the game price (continuePrice = 5) and counts the continues of that quest', async () => {
    expect(PREZZO_CONTINUA).toBe(5);
    vi.mocked(User.findOne).mockResolvedValue(utente(12, { mst_quest_id: 7, quest_instance_id: 99, num: 1 }) as never);
    const r = req({ mst_quest_id: 7, quest_instance_id: 99 });
    await questContinue(r, res);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.payments': [{ mst_payment_id: KARIDAMA, amount: 7 }], continua: { mst_quest_id: 7, quest_instance_id: 99, num: 2 } } });
    expect(encryptAndSend).toHaveBeenCalledWith({ continue_num: 2, payments: [{ mst_payment_id: KARIDAMA, amount: 7 }] }, res, r);
  });

  it('a different quest starts counting again from 1', async () => {
    vi.mocked(User.findOne).mockResolvedValue(utente(5, { mst_quest_id: 7, quest_instance_id: 99, num: 3 }) as never);
    const r = req({ mst_quest_id: 8, quest_instance_id: 100 });
    await questContinue(r, res);
    expect(encryptAndSend).toHaveBeenCalledWith({ continue_num: 1, payments: [{ mst_payment_id: KARIDAMA, amount: 0 }] }, res, r);
  });

  it('without enough karidama: a normal error dialog, nothing charged', async () => {
    vi.mocked(User.findOne).mockResolvedValue(utente(4) as never);
    const r = req({ mst_quest_id: 7, quest_instance_id: 99 });
    await questContinue(r, res);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, r, ERROR_CODE.GENERIC_ERROR, 2, expect.stringContaining('4/5'));
  });
});

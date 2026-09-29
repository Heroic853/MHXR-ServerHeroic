import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../model/user');

import User from '../model/user.js';
import { vociNavigazione, conteggiNavigazione, riscattaNavigazioni, NAVIGAZIONI } from './navigazioneService.js';
import { KARIDAMA_PRINCIPALE } from './karidamaService.js';

const BONUS = NAVIGAZIONI[0]!.mst_navigation_id;

describe('navigazioneService (探検ナビ)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('the welcome bonus is 200 karidama, already cleared, to claim until taken', () => {
    const [voce] = vociNavigazione({});
    expect(voce).toEqual(expect.objectContaining({
      mst_navigation_id: BONUS, is_clear: 1, is_reward: 0, progress: 1, progress_max: 1, limited_flag: 0,
      item_list: { payments: [{ amount: 200, mst_payment_id: KARIDAMA_PRINCIPALE }] },
    }));
    expect(vociNavigazione({ navigazioni_riscattate: [BONUS] })[0]!.is_reward).toBe(1);
    // Date in secondi che stanno in un int32.
    expect(voce!.end_at).toBeLessThan(2 ** 31);
  });

  it('the red badge counts only what is still to claim', () => {
    expect(conteggiNavigazione({})).toEqual({ notClearNum: 0, notClearNumLimited: 0, notReceivedNum: 1, notReceivedNumLimited: 0 });
    expect(conteggiNavigazione({ navigazioni_riscattate: [BONUS] }).notReceivedNum).toBe(0);
  });

  it('claims once: marks it with a $ne guard, then adds 200 to the existing row', async () => {
    vi.mocked(User.updateOne)
      .mockResolvedValueOnce({ modifiedCount: 1 } as never)
      .mockResolvedValueOnce({ matchedCount: 1 } as never);
    expect(await riscattaNavigazioni('u1', [BONUS, BONUS])).toEqual([{ mst_navigation_id: BONUS, karidama: 200 }]);
    expect(User.updateOne).toHaveBeenNthCalledWith(1, { _id: 'u1', navigazioni_riscattate: { $ne: BONUS } }, { $push: { navigazioni_riscattate: BONUS } });
    expect(User.updateOne).toHaveBeenNthCalledWith(2,
      { _id: 'u1', 'box.payments.mst_payment_id': KARIDAMA_PRINCIPALE },
      { $inc: { 'box.payments.$.amount': 200 } });
    expect(User.updateOne).toHaveBeenCalledTimes(2);
  });

  it('adds the karidama row when the player has none yet', async () => {
    vi.mocked(User.updateOne)
      .mockResolvedValueOnce({ modifiedCount: 1 } as never)
      .mockResolvedValueOnce({ matchedCount: 0 } as never)
      .mockResolvedValueOnce({} as never);
    await riscattaNavigazioni('u1', [BONUS]);
    expect(User.updateOne).toHaveBeenNthCalledWith(3, { _id: 'u1' },
      { $push: { 'box.payments': { mst_payment_id: KARIDAMA_PRINCIPALE, amount: 200 } } });
  });

  it('already claimed or unknown ids give nothing and add nothing', async () => {
    vi.mocked(User.updateOne).mockResolvedValueOnce({ modifiedCount: 0 } as never);
    expect(await riscattaNavigazioni('u1', [BONUS, 424242])).toEqual([]);
    expect(User.updateOne).toHaveBeenCalledTimes(1);
  });
});

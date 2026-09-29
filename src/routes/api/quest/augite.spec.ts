import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import { AUGITE, daiAugite } from './questIsland.controller.js';

describe('daiAugite (premio 輝石 a fine missione)', () => {
  it('gives 1-3 of one of the 5 real augite types', () => {
    for (let k = 0; k < 50; k++) {
      const m = { augite: [] as { amount?: number; mst_augite_id?: number; mst_monument_type_id?: number }[] };
      const p = daiAugite(m)!;
      expect(p.amount).toBeGreaterThanOrEqual(1);
      expect(p.amount).toBeLessThanOrEqual(3);
      expect(AUGITE.map((a) => a.mst_augite_id)).toContain(p.mst_augite_id);
      expect(m.augite).toHaveLength(1);
    }
  });

  it('adds to the existing row of the same type instead of duplicating it', () => {
    const m = { augite: AUGITE.map((a) => ({ amount: 100, ...a })) };
    const p = daiAugite(m)!;
    expect(m.augite).toHaveLength(5);
    expect(m.augite.find((a) => a.mst_augite_id === p.mst_augite_id)!.amount).toBe(100 + p.amount);
  });

  it('does nothing (and does not crash) without a monument', () => {
    expect(daiAugite(undefined)).toBeNull();
  });
});

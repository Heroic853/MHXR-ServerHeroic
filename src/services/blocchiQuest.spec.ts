import { describe, it, expect } from 'vitest';
import { blocchiPerAvvio } from './blocchiQuest.js';

const ORA = 60 * 60 * 1000;

describe('blocchiPerAvvio', () => {
  it('without random lists it sends mBlocks as they are', () => {
    expect(blocchiPerAvvio({ mQuestID: '1', mBlocks: [10, 20] })).toEqual([10, 20]);
    expect(blocchiPerAvvio(null)).toEqual([]);
    expect(blocchiPerAvvio({ mQuestID: '1', mBlocks: [10], mBlocchiCasuali: [] })).toEqual([10]);
  });

  it('picks one block per area, always among that area candidates', () => {
    const q = { mQuestID: '935504', mBlocks: [1, 2], mBlocchiCasuali: [[1], [2, 3]] };
    for (let h = 0; h < 48; h++) {
      const b = blocchiPerAvvio(q, h * ORA);
      expect(b).toHaveLength(2);
      expect(b[0]).toBe(1);
      expect([2, 3]).toContain(b[1]);
    }
  });

  it('is the same for every player in the same hour, and both alternatives come out over a day', () => {
    const q = { mQuestID: '935504', mBlocchiCasuali: [[1], [2, 3]] };
    expect(blocchiPerAvvio(q, 5 * ORA + 10)).toEqual(blocchiPerAvvio(q, 5 * ORA + 3_500_000));
    const visti = new Set(Array.from({ length: 24 }, (_, h) => blocchiPerAvvio(q, h * ORA)[1]));
    expect(visti).toEqual(new Set([2, 3]));
  });

  it('an empty area list falls back to mBlocks instead of sending a hole', () => {
    expect(blocchiPerAvvio({ mQuestID: '1', mBlocks: [7, 8], mBlocchiCasuali: [[1], []] })).toEqual([7, 8]);
  });
});

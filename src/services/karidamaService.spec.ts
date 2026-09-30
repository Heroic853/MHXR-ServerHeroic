import { describe, it, expect } from 'vitest';
import { saldoKaridama, aggiungiKaridama, spendiKaridama, karidamaConBonus, KARIDAMA_PRINCIPALE } from './karidamaService.js';

describe('karidamaService (狩玉)', () => {
  it('the balance is the sum of the 6 karidama types, other payments ignored', () => {
    expect(saldoKaridama([{ mst_payment_id: 1573159746, amount: 10 }, { mst_payment_id: 3016417902, amount: 5 }, { mst_payment_id: 42, amount: 999 }])).toBe(15);
    expect(saldoKaridama(undefined)).toBe(0);
  });

  it('adds to the main type row instead of duplicating it', () => {
    const box = { payments: [{ mst_payment_id: KARIDAMA_PRINCIPALE, amount: 4 }] };
    aggiungiKaridama(box, 3);
    expect(box.payments).toEqual([{ mst_payment_id: KARIDAMA_PRINCIPALE, amount: 7 }]);
    const vuoto: { payments?: { mst_payment_id?: number | null; amount?: number | null }[] } = {};
    aggiungiKaridama(vuoto, 3);
    expect(vuoto.payments).toEqual([{ mst_payment_id: KARIDAMA_PRINCIPALE, amount: 3 }]);
  });

  it('spends across types, never below zero, and touches nothing when not enough', () => {
    const box = { payments: [{ mst_payment_id: 3016417902, amount: 10 }, { mst_payment_id: KARIDAMA_PRINCIPALE, amount: 8 }] };
    expect(spendiKaridama(box, 15)).toBe(true);
    expect(saldoKaridama(box.payments)).toBe(3);
    expect(box.payments.every((p) => p.amount >= 0)).toBe(true);
    expect(spendiKaridama(box, 4)).toBe(false);
    expect(saldoKaridama(box.payments)).toBe(3);
  });
});

describe('karidamaConBonus (bonus donatori)', () => {
  it('no bonus: always 3, nothing accumulated', () => {
    expect(karidamaConBonus(3, 0, 0)).toEqual({ gemme: 3, frazione: 0 });
    expect(karidamaConBonus(3, undefined, undefined)).toEqual({ gemme: 3, frazione: 0 });
  });

  it('+10% gives one extra gem every 10 missions, without losing decimals', () => {
    let f = 0, tot = 0;
    for (let i = 0; i < 10; i++) { const r = karidamaConBonus(3, 10, f); f = r.frazione; tot += r.gemme; }
    expect(tot).toBe(33);
    expect(f).toBe(0);
  });

  it('+30% over 10 missions gives 39', () => {
    let f = 0, tot = 0;
    for (let i = 0; i < 10; i++) { const r = karidamaConBonus(3, 30, f); f = r.frazione; tot += r.gemme; }
    expect(tot).toBe(39);
  });

  it('the percentage is clamped to 0-100', () => {
    expect(karidamaConBonus(3, 500, 0).gemme).toBe(6);
    expect(karidamaConBonus(3, -20, 0).gemme).toBe(3);
  });
});

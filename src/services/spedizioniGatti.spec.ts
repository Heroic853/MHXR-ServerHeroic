import { describe, it, expect } from 'vitest';
import { durataMinuti, prezzoRientro, statoSpedizione, secondiAlRientro, gemmePremio, DURATA_PREDEFINITA } from './spedizioniGatti.js';

describe('spedizioniGatti', () => {
  it('each expedition has its own duration, unknown ones use the default', () => {
    expect(durataMinuti('秘境探検クエスト')).toBe(60);
    expect(durataMinuti('★6★7防具確定クエスト')).toBe(480);
    expect(durataMinuti('???')).toBe(DURATA_PREDEFINITA);
  });

  it('return price: full at start, proportional to the time left, never below 1', () => {
    expect(prezzoRientro(15, 0, 1000, 0)).toBe(15);
    expect(prezzoRientro(15, 0, 1000, 500)).toBe(8);
    expect(prezzoRientro(15, 0, 1000, 999)).toBe(1);
  });

  it('return price is 0 when the cats are already back or the price is 0', () => {
    expect(prezzoRientro(15, 0, 1000, 1000)).toBe(0);
    expect(prezzoRientro(15, 0, 1000, 5000)).toBe(0);
    expect(prezzoRientro(0, 0, 1000, 10)).toBe(0);
  });

  it('state: none without an end time, in progress before it, back after it', () => {
    expect(statoSpedizione(undefined, 10)).toBe('nessuna');
    expect(statoSpedizione({ fine: 0 }, 10)).toBe('nessuna');
    expect(statoSpedizione({ fine: 20 }, 10)).toBe('in_corso');
    expect(statoSpedizione({ fine: 20 }, 20)).toBe('tornata');
  });
});

describe('spedizioniGatti: tempo e gemme', () => {
  it('return_time is the seconds left, 0 once back', () => {
    expect(secondiAlRientro(10_000, 0)).toBe(10);
    expect(secondiAlRientro(10_001, 0)).toBe(11);
    expect(secondiAlRientro(10_000, 10_000)).toBe(0);
  });
  it('3 karidama for short expeditions, 5 for the others', () => {
    expect(gemmePremio('秘境探検クエスト')).toBe(3);
    expect(gemmePremio('火属性装備クエスト')).toBe(3);
    expect(gemmePremio('新武器クエスト')).toBe(5);
    expect(gemmePremio('★6★7武器確定クエスト')).toBe(5);
  });
});

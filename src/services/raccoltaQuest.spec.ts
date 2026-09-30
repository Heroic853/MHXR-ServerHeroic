import { describe, it, expect } from 'vitest';
import { applicaRaccolta, campiBlocco, materialiDiRaccolta, raccoltoDaiBlocchi } from './raccoltaQuest.js';
import punti from '../json/punti-raccolta.json' with { type: 'json' };
import tesori from '../json/tesori-isole.json' with { type: 'json' };

// l92_m02_a10_7401: la fase di scavo di 【第1エリア】禁断の狩場 モルドムント (un punto, tipo 4 = scavo).
const SCAVO = 1;
const BLOCCO_SCAVO = Number(Object.keys(punti).find((h) => (punti as Record<string, number[]>)[h]![1] === 4)!);
// Premi di quella missione (EVENT9274001): tipo 1 = raccolta.
const PREMI = [
  { mItemHash: '1714092880', mProbScale: '2', mRewardType: '0' },
  { mItemHash: '1714092880', mProbScale: '3', mRewardType: '1' },
  { mItemHash: '116224693', mProbScale: '1', mRewardType: '2' },
];

const vuoto = (mst: number) => ({ mst_block_id: mst, instance_id: 0, block_instance_list: [], drop_list: [], repop_list: [] });

describe('raccoltaQuest', () => {
  it('only type-1 rewards that are real materials are gatherable', () => {
    expect(materialiDiRaccolta(PREMI)).toEqual([{ id: 1714092880, peso: 3 }]);
    expect(materialiDiRaccolta([{ mItemHash: '999', mProbScale: '1', mRewardType: '1' }])).toEqual([]);
  });

  it('a quest without gathering rewards falls back to its type-0 materials', () => {
    expect(materialiDiRaccolta([{ mItemHash: '1714092880', mProbScale: '2', mRewardType: '0' }, { mItemHash: '116224693', mProbScale: '1', mRewardType: '2' }]))
      .toEqual([{ id: 1714092880, peso: 2 }]);
  });

  it('a gathering block gets its point filled in the tutorial shape', () => {
    const r = campiBlocco(BLOCCO_SCAVO, 1, PREMI, 's:q')!;
    const [serial] = (punti as Record<string, number[]>)[String(BLOCCO_SCAVO)]!;
    expect(r.campi.instance_id).toBe(SCAVO);
    expect(r.campi.block_instance_list).toEqual([{ instance_id: 1, serial_no: serial }]);
    expect(r.campi.repop_list).toEqual([{ amount: 1, serial_no: serial }]);
    expect(r.campi.drop_list[0]!.item_list.materials).toEqual([{ amount: 1, mst_material_id: 1714092880 }]);
    expect(r.punto).toEqual({ instance_id: 1, mst_material_id: 1714092880, amount: 1 });
  });

  it('the same session and quest always give the same material (start and end agree)', () => {
    const tanti = [{ mItemHash: '1714092880', mProbScale: '1', mRewardType: '1' }, { mItemHash: '116224693', mProbScale: '1', mRewardType: '1' }];
    const a = campiBlocco(BLOCCO_SCAVO, 1, tanti, 'sess:42');
    const b = campiBlocco(BLOCCO_SCAVO, 1, tanti, 'sess:42');
    expect(a!.punto).toEqual(b!.punto);
  });

  it('blocks without a point, or quests without gathering rewards, stay exactly as before', () => {
    expect(campiBlocco(12345, 1, PREMI, 's')).toBeNull();
    expect(campiBlocco(BLOCCO_SCAVO, 1, [], 's')).toBeNull();
    const lista = [vuoto(12345)];
    expect(applicaRaccolta(lista, PREMI, 's')).toEqual([]);
    expect(lista[0]).toEqual(vuoto(12345));
  });

  it('treasure chests still come out of the same path', () => {
    const tesoro = Number(Object.keys(tesori)[0]);
    const lista = [vuoto(tesoro)];
    applicaRaccolta(lista, PREMI, 's');
    expect((lista[0]!.drop_list[0] as { item_list: { collections: unknown[] } }).item_list.collections).toHaveLength(1);
  });

  it('at quest end only the points the game says were used are given, once', () => {
    const avviati = [{ instance_id: 1, mst_material_id: 10, amount: 1 }, { instance_id: 3, mst_material_id: 10, amount: 1 }, { instance_id: 4, mst_material_id: 20, amount: 1 }];
    const presi = raccoltoDaiBlocchi(avviati, [{ block_instance_id: 1, instance_ids: [1, 1] }, { block_instance_id: 3, instance_ids: [3] }]);
    expect(presi).toEqual(new Map([[10, 2]]));
    expect(raccoltoDaiBlocchi(avviati, undefined).size).toBe(0);
  });
});

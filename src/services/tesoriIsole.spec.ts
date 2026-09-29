import { describe, it, expect } from 'vitest';
import { campiTesoro, tesoroDelBlocco } from './tesoriIsole.js';
import tesori from '../json/tesori-isole.json' with { type: 'json' };

// l01_m15_a04_9910: la stanza del tesoro di 6-8 空の王者降臨 (isola 1, マラクジャ島).
const BLOCCO_6_8 = Number(Object.entries(tesori).find(([, t]) => t.blocco === 'l01_m15_a04_9910')![0]);

describe('tesoriIsole', () => {
  it('has the two treasure rooms (day/night) of each of the 18 islands', () => {
    const voci = Object.values(tesori);
    expect(voci).toHaveLength(36);
    for (let i = 1; i <= 18; i++) {
      const isola = String(i).padStart(2, '0');
      const qui = voci.filter((t) => t.blocco.startsWith(`l${isola}_`));
      expect(qui).toHaveLength(2);
      expect(new Set(qui.map((t) => t.mst_collection_id)).size).toBe(1);
    }
  });

  it('the 6-8 room holds the island 1 treasure 竜爪の銀円環', () => {
    expect(tesoroDelBlocco(BLOCCO_6_8)).toEqual(expect.objectContaining({ nome: '竜爪の銀円環', mst_collection_id: 2245466522, serial_no: 1 }));
  });

  it('fills the chest in the same shape the tutorial uses', () => {
    const c = campiTesoro(BLOCCO_6_8, 5);
    expect(c.instance_id).toBe(5);
    expect(c.block_instance_list).toEqual([{ instance_id: 5, serial_no: 1 }]);
    expect(c.repop_list).toEqual([{ amount: 1, serial_no: 1 }]);
    expect(c.drop_list).toHaveLength(1);
    expect(c.drop_list[0]!.serial_no).toBe(1);
    expect(c.drop_list[0]!.item_list.collections).toEqual([{ mst_collection_id: 2245466522 }]);
  });

  it('any other block stays exactly as before (all empty, instance 0)', () => {
    expect(campiTesoro(12345, 3)).toEqual({ instance_id: 0, block_instance_list: [], drop_list: [], repop_list: [] });
  });
});

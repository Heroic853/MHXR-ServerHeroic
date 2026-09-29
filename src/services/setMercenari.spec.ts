import { describe, it, expect, vi } from 'vitest';
import { completaSetMercenari, sistemaMercenari } from './setMercenari.js';

const SIEL = 507850012, ELEMIA = 2269936806, RAKORIS = 4031466544;
const pezzo = (equipment_id: string, mst_equipment_id: number) => ({ equipment_id, mst_equipment_id });

describe('setMercenari', () => {
  it('gives every owned mercenary a set with its default weapon, adding the weapon to the box if missing', () => {
    const box = { equipments: [pezzo('WD_LBOWGUN001', 3125656021), pezzo('WD_SWORD001', 2006810019)], partners: [{ mst_partner_id: SIEL }, { mst_partner_id: ELEMIA }, { mst_partner_id: RAKORIS }] };
    const sets = [{ index: 1, partner_equip_sets: [] }];
    const r = completaSetMercenari(box, sets);
    expect(r.aggiunti.map((p) => p.equipment_id)).toEqual(['WD_HAMMER001']);
    expect(box.equipments.some((p) => p.equipment_id === 'WD_HAMMER001')).toBe(true);
    expect(r.setCambiati).toBe(true);
    const ps = sets[0]!.partner_equip_sets as { mst_partner_id: number; weapon: { equipment_id: string }; head: { equipment_id: string } }[];
    expect(ps.map((s) => [s.mst_partner_id, s.weapon.equipment_id])).toEqual([[SIEL, 'WD_LBOWGUN001'], [ELEMIA, 'WD_SWORD001'], [RAKORIS, 'WD_HAMMER001']]);
    expect(ps[0]!.head.equipment_id).toBe('NO_EQUIP');
  });

  it('keeps a valid set chosen by the player, and is idempotent', () => {
    const box = { equipments: [pezzo('WD_LBOWGUN001', 3125656021), pezzo('WD_X', 1), pezzo('AD_H', 2)], partners: [{ mst_partner_id: SIEL }] };
    const scelto = { mst_partner_id: SIEL, weapon: { equipment_id: 'WD_X' }, head: { equipment_id: 'AD_H' } };
    const sets = [{ index: 1, partner_equip_sets: [scelto] }];
    expect(completaSetMercenari(box, sets)).toEqual({ aggiunti: [], setCambiati: false });
    expect(sets[0]!.partner_equip_sets[0]).toEqual(scelto);
  });

  it('a weapon or armor no longer in the box (sold) is replaced, not left dangling', () => {
    const box = { equipments: [pezzo('WD_LBOWGUN001', 3125656021)], partners: [{ mst_partner_id: SIEL }] };
    const sets = [{ index: 1, partner_equip_sets: [{ mst_partner_id: SIEL, weapon: { equipment_id: 'VENDUTA' }, body: { equipment_id: 'VENDUTO' } }] }];
    expect(completaSetMercenari(box, sets).setCambiati).toBe(true);
    const s = sets[0]!.partner_equip_sets[0]! as { weapon: { equipment_id: string }; body: { equipment_id: string } };
    expect(s.weapon.equipment_id).toBe('WD_LBOWGUN001');
    expect(s.body.equipment_id).toBe('NO_EQUIP');
  });

  it('saves only when something changed', async () => {
    const aggiorna = vi.fn().mockResolvedValue({});
    const utente = { _id: 'u1', box: { equipments: [pezzo('WD_LBOWGUN001', 3125656021)], partners: [{ mst_partner_id: SIEL }] }, equipset: { equip_sets: [{ index: 1, partner_equip_sets: [] }] } };
    await sistemaMercenari(utente, aggiorna);
    expect(aggiorna).toHaveBeenCalledTimes(1);
    expect(aggiorna.mock.calls[0]![1]).toEqual({ $set: { 'equipset.equip_sets': utente.equipset.equip_sets } });
    aggiorna.mockClear();
    await sistemaMercenari(utente, aggiorna);
    expect(aggiorna).not.toHaveBeenCalled();
  });
});

/*
 * Set di equipaggiamento dei mercenari (partner_equip_sets).
 *
 * Crash del menu equipaggiamento (uGUIMenuEquipMySet::updatePlayerStatus, chiamata
 * da changeMysetPartner): il gioco prende l'arma del mercenario con
 * sPartnerWorkspace::getEquipWeapon(mercenario, set), che restituisce nullo se il
 * mercenario non ha un set per quel set di equipaggiamento o se l'arma non e' nel
 * box, e updatePlayerStatus la usa senza controllare. Sul server partner_equip_sets
 * era vuoto per tutti, e dei 5 mercenari solo i primi due avevano l'arma nel box.
 *
 * Qui, per ogni mercenario posseduto senza un set valido, si mette il set con la
 * sua arma predefinita (rsdnt_property.arc :: partnerParam, mDefaultWeaponID) e
 * armature vuote, aggiungendo l'arma al box se manca. I set gia' validi scelti dal
 * giocatore non si toccano.
 */
const ARMA_PREDEFINITA: Record<number, { mst_equipment_id: number; codice: string }> = {
  507850012: { mst_equipment_id: 3125656021, codice: 'WD_LBOWGUN001' }, // シエル
  2269936806: { mst_equipment_id: 2006810019, codice: 'WD_SWORD001' }, // エレーミア
  4031466544: { mst_equipment_id: 786752644, codice: 'WD_HAMMER001' }, // ラコリス
  1848629651: { mst_equipment_id: 1682088580, codice: 'WD_LSWORD001' }, // ヴァルト
  422111493: { mst_equipment_id: 3014007215, codice: 'WD_HBOWGUN001' }, // ベルク
};
const PEZZI = ['arm', 'body', 'leg', 'head', 'secret_weapon', 'talisman', 'waist'] as const;
const VUOTO = 'NO_EQUIP';

type Pezzo = { equipment_id?: string | null; mst_equipment_id?: number | null; [k: string]: unknown };
type SetMercenario = { mst_partner_id?: number | null; weapon?: Pezzo | null; [k: string]: unknown };
type SetEquip = { partner_equip_sets?: SetMercenario[] | null; [k: string]: unknown };
type Box = { equipments?: Pezzo[] | null; partners?: { mst_partner_id?: number | null }[] | null };

function pezzoNuovo(codice: string, mst: number): Pezzo {
  // Stessa forma dei pezzi di DEFAULT_EQUIPMENT (user-defaults.json).
  return {
    auto_potential_composite: 0, awaked: 0, created: Math.floor(Date.now() / 1000), elv: 1,
    endAwakeCount: 0, endAwakeRemain: 0, end_remain: 0, equipment_id: codice, evolve_start_time: 0,
    favorite: 0, is_awake: 0, is_complete_auto_potential_composite: 0, mst_equipment_id: mst,
    potential: 0, slv: 1, start_remain: 0,
  };
}

/**
 * Completa i set dei mercenari (modifica `box` e `sets` sul posto).
 * Restituisce i pezzi aggiunti al box e se i set sono cambiati.
 */
export function completaSetMercenari(box: Box, sets: SetEquip[]): { aggiunti: Pezzo[]; setCambiati: boolean } {
  const pezzi = Array.isArray(box.equipments) ? box.equipments : (box.equipments = []);
  const aggiunti: Pezzo[] = [];
  let setCambiati = false;
  const nelBox = (id: unknown) => typeof id === 'string' && pezzi.some((p) => p.equipment_id === id);

  for (const partner of box.partners ?? []) {
    const mst = Number(partner?.mst_partner_id);
    const arma = ARMA_PREDEFINITA[mst];
    if (!arma) continue;
    let pezzoArma = pezzi.find((p) => Number(p.mst_equipment_id) === arma.mst_equipment_id);
    if (!pezzoArma && !nelBox(arma.codice)) {
      pezzoArma = pezzoNuovo(arma.codice, arma.mst_equipment_id);
      pezzi.push(pezzoArma);
      aggiunti.push(pezzoArma);
    }
    if (!pezzoArma) continue;
    const armaDelSet = { created: 0, equipment_id: pezzoArma.equipment_id, level: 0, mst_equipment_id: arma.mst_equipment_id, potential: 0, skill_level: 0 };

    for (const set of sets) {
      const lista = Array.isArray(set.partner_equip_sets) ? set.partner_equip_sets : (set.partner_equip_sets = []);
      const esistente = lista.find((s) => Number(s.mst_partner_id) === mst);
      if (!esistente) {
        lista.push({ mst_partner_id: mst, weapon: armaDelSet, ...Object.fromEntries(PEZZI.map((k) => [k, { equipment_id: VUOTO }])) });
        setCambiati = true;
        continue;
      }
      if (!nelBox(esistente.weapon?.equipment_id)) {
        esistente.weapon = armaDelSet;
        setCambiati = true;
      }
      // Un'armatura che non e' piu' nel box (venduta) torna vuota invece di puntare a niente.
      for (const k of PEZZI) {
        const p = esistente[k] as Pezzo | undefined;
        if (p && p.equipment_id && p.equipment_id !== VUOTO && !nelBox(p.equipment_id)) {
          esistente[k] = { equipment_id: VUOTO };
          setCambiati = true;
        }
      }
    }
  }
  return { aggiunti, setCambiati };
}

// Tipo largo apposta: arriva un utente mongoose .toObject().
type DocUtente = { _id: unknown; box?: unknown; equipset?: unknown };

/**
 * Su un utente letto con .toObject(): completa i set dei mercenari e, se serve,
 * salva (arma aggiunta al box con $push, set con $set). Restituisce box e set
 * aggiornati da mandare al gioco. `setDaSalvare` sostituisce i set dell'utente
 * (equipset/set, dove li manda il gioco).
 */
export async function sistemaMercenari(
  utente: DocUtente,
  aggiorna: (filtro: object, modifica: object) => Promise<unknown>,
  setDaSalvare?: SetEquip[],
) {
  const box = (utente.box ?? { equipments: [], partners: [] }) as Box;
  const sets: SetEquip[] = setDaSalvare ?? (utente.equipset as { equip_sets?: SetEquip[] } | undefined)?.equip_sets ?? [];
  const { aggiunti, setCambiati } = completaSetMercenari(box, sets);
  const modifica: Record<string, object> = {};
  if (aggiunti.length) modifica.$push = { 'box.equipments': { $each: aggiunti } };
  if (setCambiati || setDaSalvare) modifica.$set = { 'equipset.equip_sets': sets };
  if (Object.keys(modifica).length) await aggiorna({ _id: utente._id }, modifica);
  return { box, sets, aggiunti, setCambiati };
}

import type { Types } from 'mongoose';
import User from '../model/user.js';
import { KARIDAMA_PRINCIPALE } from './karidamaService.js';

/*
 * 探検ナビ (la bussola in home): obiettivi con un premio da riscattare.
 *
 * Nel gioco originale il premio poteva essere qualunque oggetto (la risposta di
 * user/navigation/reward/receive, letta con Ghidra, ha un additional_box con
 * equipaggiamenti, materiali, augite, gatti, 狩玉...). Qui per ora c'e' solo il
 * bonus di benvenuto in 狩玉: gia' "completato" per tutti, riscattabile una volta
 * per account (user.navigazioni_riscattate), vecchi e nuovi giocatori allo stesso modo.
 */
export type Navigazione = {
  mst_navigation_id: number;
  nome: string;
  spiegazione: string;
  karidama: number;
  /** 0 = scheda 通常, 1 = scheda 期間限定 */
  limited_flag: number;
};

export const NAVIGAZIONI: Navigazione[] = [
  {
    mst_navigation_id: 1001,
    nome: 'Welcome bonus!',
    spiegazione: 'A gift of 200 karidama for every hunter. It can be claimed only once.',
    karidama: 200,
    limited_flag: 0,
  },
];

// Secondi unix, come li legge il gioco. Fine entro il 2037 per stare in un int32.
const INIZIO = 1790640000; // 29/09/2026
const FINE = 2145830400; // 31/12/2037

type ConRiscatti = { navigazioni_riscattate?: number[] | null };

function riscattata(doc: ConRiscatti, id: number): boolean {
  return (doc.navigazioni_riscattate ?? []).map(Number).includes(id);
}

export function vociNavigazione(doc: ConRiscatti) {
  return NAVIGAZIONI.map((n) => ({
    close_at: FINE,
    end_at: FINE,
    explain: n.spiegazione,
    is_clear: 1,
    is_reward: riscattata(doc, n.mst_navigation_id) ? 1 : 0,
    item_list: { payments: [{ amount: n.karidama, mst_payment_id: KARIDAMA_PRINCIPALE }] },
    limited_flag: n.limited_flag,
    mst_navigation_id: n.mst_navigation_id,
    name: n.nome,
    progress: 1,
    progress_max: 1,
    start_at: INIZIO,
  }));
}

/** navigationNum di notice/get e del riscatto: il numerino rosso sulla bussola. */
export function conteggiNavigazione(doc: ConRiscatti) {
  const daRiscattare = NAVIGAZIONI.filter((n) => !riscattata(doc, n.mst_navigation_id));
  return {
    notClearNum: 0,
    notClearNumLimited: 0,
    notReceivedNum: daRiscattare.filter((n) => n.limited_flag === 0).length,
    notReceivedNumLimited: daRiscattare.filter((n) => n.limited_flag !== 0).length,
  };
}

/**
 * Riscatta le voci richieste. Ogni voce si prende UNA volta sola: il segno di
 * riscatto si scrive con una condizione ($ne), quindi due richieste insieme non
 * accreditano due volte. Voci sconosciute o gia' prese vengono saltate, niente errore.
 */
export async function riscattaNavigazioni(userId: Types.ObjectId | string, ids: number[]) {
  const premi: { mst_navigation_id: number; karidama: number }[] = [];
  for (const id of [...new Set(ids.map(Number))]) {
    const n = NAVIGAZIONI.find((x) => x.mst_navigation_id === id);
    if (!n) continue;
    const presa = await User.updateOne(
      { _id: userId, navigazioni_riscattate: { $ne: id } },
      { $push: { navigazioni_riscattate: id } },
    );
    if (presa.modifiedCount !== 1) continue;
    const somma = await User.updateOne(
      { _id: userId, 'box.payments.mst_payment_id': KARIDAMA_PRINCIPALE },
      { $inc: { 'box.payments.$.amount': n.karidama } },
    );
    if (somma.matchedCount === 0) {
      await User.updateOne(
        { _id: userId },
        { $push: { 'box.payments': { mst_payment_id: KARIDAMA_PRINCIPALE, amount: n.karidama } } },
      );
    }
    premi.push({ mst_navigation_id: id, karidama: n.karidama });
  }
  return premi;
}

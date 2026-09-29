/*
 * 狩玉 (karidama), la valuta premium. Nel gioco sono 6 voci di item_payment
 * (rsdnt_property.arc), tutte chiamate 狩玉: il saldo e' la loro somma.
 * Nel gioco originale si compravano; qui niente microtransazioni: si guadagnano
 * giocando (KARIDAMA_A_MISSIONE a fine missione) e si spendono nel gacha dei gatti.
 */
export const KARIDAMA_IDS = [1573159746, 3301823224, 3016417902, 766408653, 1521043291, 3282048737] as const;
// Il tipo in cui si accredita (lo stesso che Heroic69 ha gia' e che il gioco mostra).
export const KARIDAMA_PRINCIPALE = 1573159746;
export const KARIDAMA_A_MISSIONE = 3;

type Voce = { mst_payment_id?: number | null; amount?: number | null };

export function saldoKaridama(payments: Voce[] | undefined | null): number {
  return (payments ?? []).reduce(
    (t, p) => t + ((KARIDAMA_IDS as readonly number[]).includes(Number(p.mst_payment_id)) ? Math.max(0, Number(p.amount ?? 0)) : 0),
    0,
  );
}

/** Aggiunge n 狩玉 al tipo principale (una sola riga per tipo). */
export function aggiungiKaridama(box: { payments?: Voce[] }, n: number): void {
  if (!Array.isArray(box.payments)) box.payments = [];
  const riga = box.payments.find((p) => Number(p.mst_payment_id) === KARIDAMA_PRINCIPALE);
  if (riga) riga.amount = Number(riga.amount ?? 0) + n;
  else box.payments.push({ mst_payment_id: KARIDAMA_PRINCIPALE, amount: n });
}

/** Scala n 狩玉 (prima dal tipo principale, poi dagli altri). false se non bastano: non tocca niente. */
export function spendiKaridama(box: { payments?: Voce[] }, n: number): boolean {
  if (n <= 0) return true;
  const payments = box.payments ?? [];
  if (saldoKaridama(payments) < n) return false;
  let resto = n;
  const ordine = [...payments].sort((a, b) =>
    Number(Number(b.mst_payment_id) === KARIDAMA_PRINCIPALE) - Number(Number(a.mst_payment_id) === KARIDAMA_PRINCIPALE));
  for (const p of ordine) {
    if (!(KARIDAMA_IDS as readonly number[]).includes(Number(p.mst_payment_id)) || resto === 0) continue;
    const preso = Math.min(Math.max(0, Number(p.amount ?? 0)), resto);
    p.amount = Number(p.amount ?? 0) - preso;
    resto -= preso;
  }
  return true;
}

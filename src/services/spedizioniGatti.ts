/*
 * Spedizione dei gatti (ニャン検) con il timer vero.
 *
 * Dal codice del gioco (libMHS.so):
 *   - la durata e' quest_time della lista, in MINUTI (getQuestTimeMessage: <60 minuti,
 *     <1440 ore, oltre giorni);
 *   - il tempo che manca e' return_time (secondi Unix, letto con getS64) meno l'ora
 *     attuale (sNyankenWorkspace::getRemainProgressTime);
 *   - il prezzo per far rientrare subito i gatti e' currency_ammount (getReturnKaridamaNum);
 *     la partenza e' gratis. Nel tutorial il gioco usa 24 ore e 15 狩玉.
 *
 * Durate e prezzo decrescente: scelte del gestore del server (30/09), perche' nei
 * file del gioco ci sono solo il prezzo base (15, nyankenQuest) e il tutorial.
 *
 * Niente timer che gira sul server: si salvano solo l'ora di partenza e di rientro,
 * e a ogni richiesta si fa la differenza con l'ora attuale.
 */
export const DURATA_MINUTI: Record<string, number> = {
  '秘境探検クエスト': 60,
  '火属性装備クエスト': 120,
  '水属性装備クエスト': 120,
  '土属性装備クエスト': 120,
  '雷属性装備クエスト': 120,
  '氷属性装備クエスト': 120,
  '新武器クエスト': 180,
  '新防具クエスト': 180,
  '禁断の狩場クエスト': 240,
  '限定討伐クエスト': 240,
  '1周限定!限定討伐クエスト': 240,
  '★6★7武器確定クエスト': 480,
  '★6★7防具確定クエスト': 480,
};
export const DURATA_PREDEFINITA = 60;

export function durataMinuti(nome: string): number {
  return DURATA_MINUTI[nome] ?? DURATA_PREDEFINITA;
}

/**
 * Prezzo in 狩玉 per far rientrare subito i gatti: il prezzo pieno appena partiti,
 * poi proporzionale al tempo che manca, mai sotto 1; 0 se sono gia' tornati.
 */
export function prezzoRientro(prezzoPieno: number, inizio: number, fine: number, ora: number): number {
  if (!(fine > ora) || prezzoPieno <= 0) return 0;
  const totale = Math.max(1, fine - inizio);
  return Math.max(1, Math.min(prezzoPieno, Math.ceil((prezzoPieno * (fine - ora)) / totale)));
}

export type Spedizione = { mst_nyanken_id?: number | null; inizio?: number | null; fine?: number | null };

/** 'nessuna' (si puo' partire), 'in_corso' (i gatti sono fuori) o 'tornata' (premi da ritirare). */
export function statoSpedizione(s: Spedizione | null | undefined, ora: number): 'nessuna' | 'in_corso' | 'tornata' {
  const fine = Number(s?.fine) || 0;
  if (!fine) return 'nessuna';
  return fine > ora ? 'in_corso' : 'tornata';
}

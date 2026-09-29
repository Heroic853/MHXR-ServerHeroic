/*
 * Blocchi da mandare al gioco all'avvio di una quest.
 *
 * Le quest con mbRandomBlock=true nell'originale avevano blocchi scelti a caso
 * dal server Capcom, fra alternative che non sono in nessun file del gioco. Per
 * quelle ricostruite (tools/audit casuali: una "famiglia" di blocchi del gioco
 * per livello, con il flag armi speciali coincidente) il DB tiene in
 * mBlocchiCasuali, per ogni area, la lista dei blocchi possibili.
 *
 * La scelta NON e' un Math.random: dipende da quest, area e ora del giorno.
 * Cosi' in multiplayer tutti i giocatori della stanza ricevono gli stessi
 * mostri (ognuno chiama start per conto suo), e ogni ora il mostro cambia.
 */
const UN_ORA = 60 * 60 * 1000;

// Tipi larghi apposta: arriva un documento mongoose (array annidati tipizzati a modo suo).
type QuestConBlocchi = { mQuestID?: unknown; mBlocks?: unknown; mBlocchiCasuali?: unknown } | null | undefined;

// FNV-1a a 32 bit: stabile fra riavvii e fra processi.
function hash(testo: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function blocchiPerAvvio(quest: QuestConBlocchi, ora: number = Date.now()): number[] {
  const casuali: unknown = quest?.mBlocchiCasuali;
  if (Array.isArray(casuali) && casuali.length > 0 && casuali.every((l: unknown) => Array.isArray(l) && l.length > 0)) {
    const fascia = Math.floor(ora / UN_ORA);
    return (casuali as unknown[][]).map((lista, area) => Number(lista[hash(`${String(quest?.mQuestID)}:${area}:${fascia}`) % lista.length]));
  }
  const fissi: unknown = quest?.mBlocks;
  return Array.isArray(fissi) ? fissi.map(Number) : [];
}

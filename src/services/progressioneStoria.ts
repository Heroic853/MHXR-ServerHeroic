import struttura from '../json/progressione-storia.json' with { type: 'json' };

/*
 * Progressione vera della mappa della storia (arcipelaghi -> isole -> nodi).
 *
 * I DATI vengono dai file del gioco (src/json/progressione-storia.json, generato
 * da tools-js/costruisci-progressione-storia.cjs): ordine di arcipelaghi, isole e
 * nodi, tipo di nodo, missioni di ogni nodo, nota del tesoro dell'isola.
 *
 * La REGOLA invece non e' nei file: l'apertura la decideva il server Capcom (il
 * gioco mostra aperto cio' che il server manda, sQuestWorkspace::isOpenPartFromPartHash).
 * Quella scelta qui, per decisione del gestore del server (29/09):
 *   1. il primo nodo di un'isola aperta e' aperto;
 *   2. un nodo senza missioni (villaggio 1, passaggio 3, costa d'uscita 4) lascia
 *      passare al successivo;
 *   3. dopo una zona con missioni il nodo successivo si apre completando una delle
 *      ultime due missioni della zona (sempre la coppia giorno/notte x-7/x-8);
 *   4. aprire la costa d'uscita (tipo 4) apre l'isola successiva e conta come
 *      tesoro dell'isola preso;
 *   5. aprire la costa d'uscita dell'ultima isola apre l'arcipelago successivo;
 *   6. chi e' gia' andato avanti resta dov'e': e' aperto tutto fino al nodo piu'
 *      avanti in cui ha completato almeno una missione.
 *
 * Non si costruisce una mappa nuova: si parte da quella completa che il gioco gia'
 * accetta e si toglie cio' che non e' aperto, cosi' non si inventano formati o stati.
 */
type Nodo = { mst_node_id: number; tipo: number; missioni: number[] };
type Isola = { mst_part_id: number; nota_tesoro: number; nodi: Nodo[] };
type Oceano = { mst_ocean_id: number; isole: Isola[] };
const STORIA = struttura as unknown as Oceano[];

export type StatoStoria = { oceani: Set<number>; isole: Set<number>; nodi: Set<number>; tesori: Set<number> };

// Tutti i nodi della storia nell'ordine del gioco, con la loro isola e il loro arcipelago.
const IN_ORDINE = STORIA.flatMap((o) => o.isole.flatMap((i) => i.nodi.map((n) => ({ oceano: o.mst_ocean_id, isola: i.mst_part_id, nodo: n }))));

export function statoStoria(completate: Set<number>): StatoStoria {
  const s: StatoStoria = { oceani: new Set(), isole: new Set(), nodi: new Set(), tesori: new Set() };
  // 6. Chi e' gia' andato avanti (la mappa era tutta aperta) resta dov'e': e' aperto
  //    tutto fino al nodo piu' avanti in cui ha completato almeno una missione.
  let finoA = -1;
  IN_ORDINE.forEach((x, i) => { if (x.nodo.missioni.some((q) => completate.has(q))) finoA = i; });

  let aperto = true; // il prossimo nodo nell'ordine
  let isolaCorrente: number | null = null;
  let prossimaIsolaAperta = true;
  for (let i = 0; i < IN_ORDINE.length; i++) {
    const { oceano, isola, nodo } = IN_ORDINE[i]!;
    if (isola !== isolaCorrente) {
      // Primo nodo di un'isola: aperto se la costa d'uscita della precedente e' aperta.
      aperto = prossimaIsolaAperta;
      prossimaIsolaAperta = false;
      isolaCorrente = isola;
    }
    if (!aperto && i > finoA) break;
    s.oceani.add(oceano);
    s.isole.add(isola);
    s.nodi.add(nodo.mst_node_id);
    if (nodo.tipo === 4) {
      s.tesori.add(isola);
      prossimaIsolaAperta = true;
    }
    aperto = nodo.missioni.length === 0 || nodo.missioni.slice(-2).some((q) => completate.has(q));
  }
  return s;
}

/** Missioni davvero completate (island/end salva clear_time; island/start le segna solo come viste). */
export function missioniCompletate(cleared: { mst_quest_id?: number | null; clear_time?: number | null }[] | null | undefined): Set<number> {
  return new Set((cleared ?? []).filter((q) => q.clear_time != null).map((q) => Number(q.mst_quest_id)));
}

type NotaMappa = { mst_note_content_id: number; state: number };
type NodoMappa = { mst_node_id: number };
type IsolaMappa = { mst_part_id: number; node_list: NodoMappa[]; object_list?: unknown[]; exploration_note?: { note_contents?: NotaMappa[] } };
type OceanoMappa = { mst_ocean_id: number; part_list: IsolaMappa[] };

const notaTesoro = new Map(STORIA.flatMap((o) => o.isole.map((i) => [i.mst_part_id, i.nota_tesoro] as const)));

/** La mappa completa ridotta a cio' che il giocatore ha davvero aperto. Non modifica `completa`. */
export function mappaProgressiva<T extends OceanoMappa>(completa: T[], completate: Set<number>): T[] {
  const s = statoStoria(completate);
  const copia = structuredClone(completa);
  return copia
    .filter((o) => s.oceani.has(o.mst_ocean_id))
    .map((o) => ({
      ...o,
      part_list: o.part_list
        .filter((p) => s.isole.has(p.mst_part_id))
        .map((p) => {
          const preso = s.tesori.has(p.mst_part_id);
          const nota = notaTesoro.get(p.mst_part_id);
          return {
            ...p,
            node_list: p.node_list.filter((n) => s.nodi.has(n.mst_node_id)),
            // Il piedistallo del tesoro: vuoto come per un giocatore nuovo finche' non e' preso.
            object_list: preso ? p.object_list : [],
            exploration_note: p.exploration_note && {
              ...p.exploration_note,
              note_contents: (p.exploration_note.note_contents ?? []).map((c) =>
                !preso && c.mst_note_content_id === nota ? { ...c, state: 1 } : c),
            },
          };
        }),
    }));
}

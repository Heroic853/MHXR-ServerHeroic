import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import equipaggiamenti from '../../../json/equipaggiamenti.json' with { type: 'json' };

const log = createLogger('katamari');

/*
 * I KATAMARI: i fagotti che si raccolgono durante la caccia.
 *
 * Il giocatore, nella fase di raccolta/pesca, tira su un fagotto; il client
 * chiede al server cosa contiene con /quest/katamari/content/get e lo mostra.
 * Finora quella rotta era agganciata a notImplemented.blankResponseEncrypted,
 * cioe' rispondeva {} — per questo l'oggetto raccolto compariva come "null".
 *
 * Il contenuto e' EQUIPAGGIAMENTO: la forma di ogni voce e' documentata nel
 * commento di katamari_content_list dentro questIsland.controller.ts
 * (elv, end_remain, is_awake, mst_equipment_id, prob_type_id, slv,
 * start_remain).
 *
 * I cinque tipi di fagotto vengono da katamari_define nell'apk, e ognuno ha un
 * mDirectionID da 1 a 5 in katamari_info: si usa come livello di pregio, cosi'
 * il fagotto piu' raro contiene equipaggiamento piu' raro.
 */

/** I 5 tipi, da katamari_define + katamari_info dell'apk. Non inventati. */
const TIPI_KATAMARI: Record<number, { livello: number; rarita: number[] }> = {
  2730451382: { livello: 1, rarita: [3, 4] }, // KATAMARI00001
  1001795596: { livello: 2, rarita: [4, 5] }, // KATAMARI00002
  1286668442: { livello: 3, rarita: [5, 6] }, // KATAMARI00003
  3537212729: { livello: 4, rarita: [6, 7] }, // KATAMARI00004
  2782045615: { livello: 5, rarita: [7, 8] }, // KATAMARI00005
};

const TIPO_PREDEFINITO = 1286668442; // quello di mezzo, se il client non lo dice

interface VoceEquip {
  i: number; // id
  r: number; // rarita'
  c: string; // categoria
}

// Indice per rarita', costruito una volta sola all'avvio.
const PER_RARITA = new Map<number, VoceEquip[]>();
for (const e of equipaggiamenti as ReadonlyArray<VoceEquip>) {
  if (!PER_RARITA.has(e.r)) PER_RARITA.set(e.r, []);
  PER_RARITA.get(e.r)!.push(e);
}

function pescaEquipaggiamenti(rarita: number[], quanti: number): VoceEquip[] {
  const pool: VoceEquip[] = [];
  for (const r of rarita) pool.push(...(PER_RARITA.get(r) ?? []));
  if (!pool.length) return [];

  const scelti: VoceEquip[] = [];
  const usati = new Set<number>();
  // Un po' di tentativi in piu' per evitare doppioni, ma senza rischiare un
  // ciclo lungo se il pool fosse piccolo.
  for (let tentativi = 0; scelti.length < quanti && tentativi < quanti * 8; tentativi++) {
    const e = pool[Math.floor(Math.random() * pool.length)]!;
    if (usati.has(e.i)) continue;
    usati.add(e.i);
    scelti.push(e);
  }
  return scelti;
}

export const contentGet = (req: Request, res: Response) => {
  try {
    const corpo = (req.body ?? {}) as Record<string, unknown>;

    /*
     * Non conosciamo con certezza il nome del campo con cui il client indica
     * QUALE fagotto sta aprendo: la rotta non e' mai stata implementata, quindi
     * non c'e' uno schema da cui dedurlo. Si provano i nomi plausibili e si
     * registra il corpo vero, cosi' dal primo utilizzo reale si vede il nome
     * giusto nei log e si stringe la lettura.
     */
    const candidati = ['mst_katamari_type_id', 'mst_katamari_id', 'katamari_type_id', 'katamari_id'];
    let tipo = TIPO_PREDEFINITO;
    for (const c of candidati) {
      const v = Number(corpo[c]);
      if (Number.isFinite(v) && TIPI_KATAMARI[v]) { tipo = v; break; }
    }

    const config = TIPI_KATAMARI[tipo]!;
    const contenuto = pescaEquipaggiamenti(config.rarita, 6);

    log.info(
      'katamari aperto | tipo=%d livello=%d pezzi=%d campiRichiesta=%s',
      tipo, config.livello, contenuto.length, Object.keys(corpo).join(',') || '(vuoto)',
    );

    const data = {
      katamari_content_list: contenuto.map((e, i) => ({
        elv: 0,
        end_remain: 0,
        is_awake: 0,
        mst_equipment_id: e.i,
        prob_type_id: i === 0 ? 1 : 0, // il primo e' il pezzo "di punta"
        slv: 0,
        start_remain: 0,
      })),
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Errore in katamari contentGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Katamari content failed');
  }
};

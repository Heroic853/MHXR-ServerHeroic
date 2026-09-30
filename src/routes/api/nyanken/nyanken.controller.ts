import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import poolEquip from '../../../json/nyanken-equip.json' with { type: 'json' };
import categorieJson from '../../../json/nyanken-categorie.json' with { type: 'json' };
import type { NyankenInput } from './nyanken.schema.js';
import { spendiKaridama, saldoKaridama } from '../../../services/karidamaService.js';
import { durataMinuti, prezzoRientro, statoSpedizione } from '../../../services/spedizioniGatti.js';

const log = createLogger('nyanken');

/*
 * SPEDIZIONE DEI GATTI: al ritorno portano armi e armature a caso.
 *
 * Il pool (nyanken-equip.json) contiene SOLO pezzi presenti in entrambi gli
 * elenchi estratti dal gioco (equipaggiamenti dell'apk + quello gia' usato
 * dai Katamari), con nome e rarita' noti, esclusi segnaposto ("装備無し",
 * "dummy") e arti di caccia: 12.719 armi e armature. Nessun id inventato.
 *
 * Regole imparate dal vecchio gacha, che ha rotto il login in modo
 * permanente: ogni pezzo ha i 16 campi di DEFAULT_EQUIPMENT, equipment_id e'
 * il codice vero del gioco (niente suffissi tipo "_19"), mai un pezzo che il
 * giocatore ha gia', e mai oltre la capienza della box.
 */
// e = elemento dell'arma (1 fuoco, 2 acqua, 3 ghiaccio, 4 tuono, 5 terra, 0 nessuno);
// le armature non ce l'hanno nei dati del gioco.
interface VocePool { i: number; n: string; r: number; c: string; e?: number }
const POOL = poolEquip as ReadonlyArray<VocePool>;

/*
 * Le spedizioni mostrate nel gacha (nyanken-categorie.json, generato da
 * tools-js/costruisci-nyanken-categorie.cjs): ID e nome veri della tabella
 * del gioco (nyankenQuest, 972 voci), banner verificati sull'immagine
 * (0 = nessun banner certo). Il filtro dice quali premi puo' dare.
 */
interface Categoria {
  mst_nyanken_id: number;
  nome: string;
  mst_banner_id: number;
  costo?: number;
  ordine: number;
  filtro: { tipo: string; elemento?: number; rarita?: number[] };
}
const CATEGORIE = categorieJson as ReadonlyArray<Categoria>;
// 秘境探検クエスト (2022298312): la spedizione generale, gia' usata da progress.
const CATEGORIA_BASE = CATEGORIE[0]!;
const ARMATURE = new Set(['arm', 'body', 'head', 'leg', 'waist']);

function categoriaDa(id: unknown): Categoria | undefined {
  const n = Number(id);
  return Number.isFinite(n) ? CATEGORIE.find((c) => c.mst_nyanken_id === n) : undefined;
}

const poolPerCategoria = new Map<number, ReadonlyArray<VocePool>>();
function poolDi(cat: Categoria): ReadonlyArray<VocePool> {
  let p = poolPerCategoria.get(cat.mst_nyanken_id);
  if (!p) {
    const f = cat.filtro;
    p = POOL.filter((v) => {
      const armatura = ARMATURE.has(v.c);
      if (f.tipo === 'armi' && armatura) return false;
      if (f.tipo === 'armature' && !armatura) return false;
      if (f.elemento !== undefined && v.e !== f.elemento) return false;
      if (f.rarita && !f.rarita.includes(v.r)) return false;
      return true;
    });
    poolPerCategoria.set(cat.mst_nyanken_id, p);
  }
  return p;
}

// Rarita' 1-8: le piu' comuni escono spesso, le leggendarie raramente.
const PESO_RARITA: Record<number, number> = { 1: 4, 2: 6, 3: 12, 4: 22, 5: 24, 6: 18, 7: 10, 8: 4 };
const PEZZI_PER_SPEDIZIONE = 3;

function nuovoPezzo(v: VocePool) {
  return {
    auto_potential_composite: 0,
    awaked: 0,
    created: Math.floor(Date.now() / 1000),
    elv: 0,
    endAwakeCount: 0,
    endAwakeRemain: 0,
    end_remain: 0,
    equipment_id: v.n,
    evolve_start_time: 0,
    favorite: 0,
    is_awake: 0,
    is_complete_auto_potential_composite: 0,
    mst_equipment_id: v.i,
    potential: 0,
    slv: 0,
    start_remain: 0,
  };
}

function pesca(pool: ReadonlyArray<VocePool>, giaPosseduti: Set<string>, quanti: number): VocePool[] {
  const scelti: VocePool[] = [];
  const usati = new Set(giaPosseduti);
  // Solo le rarita' presenti in questo pool (es. ★6★7 ha solo 6 e 7), coi loro pesi.
  const presenti = new Set(pool.map((v) => v.r));
  const pesi = Object.entries(PESO_RARITA).filter(([r]) => presenti.has(Number(r)));
  const totale = pesi.reduce((a, [, p]) => a + p, 0);
  for (let tentativi = 0; scelti.length < quanti && tentativi < quanti * 20 && totale > 0; tentativi++) {
    let x = Math.random() * totale;
    let rarita = Number(pesi[0]![0]);
    for (const [r, p] of pesi) { x -= p; if (x <= 0) { rarita = Number(r); break; } }
    const candidati = pool.filter((v) => v.r === rarita && !usati.has(v.n));
    if (!candidati.length) continue;
    const v = candidati[Math.floor(Math.random() * candidati.length)]!;
    usati.add(v.n);
    scelti.push(v);
  }
  return scelti;
}

/** Consegna i premi e restituisce i pezzi davvero salvati. */
async function consegnaPremi(sessionId: string, idRichiesto?: unknown) {
  // Senza sessione, { current_session: undefined } potrebbe combaciare con un
  // utente qualsiasi: qui si regalano oggetti, meglio rifiutare subito.
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const doc = await User.findOne({ current_session: sessionId });
  if (!doc) return null;
  // La spedizione: quella indicata dal client, altrimenti quella salvata allo
  // start, altrimenti la generale. Un ID che non e' tra le categorie non passa.
  const categoria = categoriaDa(idRichiesto) ?? categoriaDa(doc.nyanken_cooldown?.mst_nyanken_id) ?? CATEGORIA_BASE;
  const esistenti = doc.box?.equipments ?? [];
  const capienza = Number(doc.box?.capacity?.eqp_box ?? 500);
  const posto = Math.max(0, capienza - esistenti.length);
  const pezzi = pesca(poolDi(categoria), new Set(esistenti.map((e) => String(e.equipment_id))), Math.min(PEZZI_PER_SPEDIZIONE, posto)).map(nuovoPezzo);
  if (pezzi.length) {
    await User.updateOne({ _id: doc._id }, {
      $push: { 'box.equipments': { $each: pezzi } },
      $set: { 'nyanken_cooldown.last_draw_time': Date.now(), 'nyanken_cooldown.pagata': false },
    });
  }
  log.info('spedizione | %s riceve %d pezzi da %s (box %d/%d)%s', doc.character_name ?? '?', pezzi.length, categoria.nome,
    esistenti.length + pezzi.length, capienza, posto === 0 ? ' - BOX PIENA, niente premi' : '');
  return { doc, pezzi };
}

function rispostaRisultato(pezzi: ReturnType<typeof nuovoPezzo>[], payments: unknown[]) {
  // Stessa forma di tutorial/nyanken/result, l'unica gia' vista funzionare nel client.
  return {
    effect_id: 42,
    is_island: 0,
    island_result: { normal_result_list: [], special_result_list: [{ travel: [] }] },
    payments,
    result_list: { equipments: pezzi },
  };
}

/*
 * La spedizione ha il timer vero (services/spedizioniGatti.ts): partire e' gratis,
 * i gatti tornano dopo quest_time minuti, e si puo' pagare in 狩玉 per farli
 * rientrare subito (nyanken/return). I premi si ritirano solo a spedizione finita.
 * Stato salvato in user.nyanken_cooldown: mst_nyanken_id, inizio e fine (ms).
 */
const sec = (ms: number) => Math.floor(ms / 1000);
const prezzoPienoDi = (c: Categoria) => c.costo ?? 0;

type ConSpedizione = { nyanken_cooldown?: { mst_nyanken_id?: number | null; inizio?: number | null; fine?: number | null } | null };

function datiSpedizione(doc: ConSpedizione, ora: number) {
  const s = doc.nyanken_cooldown ?? {};
  const categoria = categoriaDa(s.mst_nyanken_id) ?? CATEGORIA_BASE;
  const inizio = Number(s.inizio) || 0;
  const fine = Number(s.fine) || 0;
  return { categoria, inizio, fine, stato: statoSpedizione(s, ora), prezzo: prezzoRientro(prezzoPienoDi(categoria), inizio, fine, ora) };
}

export const start = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_nyanken_id } = req.body as NyankenInput;
    if (typeof session_id !== 'string' || !session_id) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const ora = Date.now();
    let sp = datiSpedizione(doc as unknown as ConSpedizione, ora);
    // Il gioco chiama start anche 2-3 volte di fila (log 29/09): se i gatti sono
    // gia' fuori (o tornati con i premi da ritirare) non si riparte da capo.
    if (sp.stato === 'nessuna') {
      const categoria = categoriaDa(mst_nyanken_id) ?? CATEGORIA_BASE;
      const fine = ora + durataMinuti(categoria.nome) * 60_000;
      await User.updateOne({ _id: doc._id }, { $set: {
        'nyanken_cooldown.mst_nyanken_id': categoria.mst_nyanken_id, 'nyanken_cooldown.inizio': ora, 'nyanken_cooldown.fine': fine,
      } });
      log.info('spedizione | %s parte: %s, torna tra %d minuti', doc.character_name ?? '?', categoria.nome, durataMinuti(categoria.nome));
      sp = { categoria, inizio: ora, fine, stato: 'in_corso', prezzo: prezzoRientro(prezzoPienoDi(categoria), ora, fine, ora) };
    }
    encryptAndSend({
      balloon_color_id: 0,
      currency_ammount: sp.prezzo,
      discount_currency_ammount: 0,
      message_leaving: '',
      message_waiting: '',
      mst_nyanken_id: sp.categoria.mst_nyanken_id,
      nyanken_icon_id: 0,
      rare_appear_time: 0,
      rare_flag: 0,
      return_time: sec(sp.fine),
    }, res, req);
  } catch (error) {
    log.error('Error in nyanken start:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Nyanken start failed');
  }
};

/** Far rientrare subito i gatti pagando 狩玉 (prezzo in base al tempo che manca). */
export const returnHome = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as NyankenInput;
    if (typeof session_id !== 'string' || !session_id) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const ora = Date.now();
    const sp = datiSpedizione(doc as unknown as ConSpedizione, ora);
    const box = doc.box as unknown as { payments?: { mst_payment_id?: number | null; amount?: number | null }[] };
    if (sp.stato === 'in_corso') {
      if (!spendiKaridama(box, sp.prezzo)) {
        return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG,
          `狩玉が足りません (Not enough karidama: ${saldoKaridama(box.payments)}/${sp.prezzo})`);
      }
      await User.updateOne({ _id: doc._id }, { $set: { 'box.payments': box.payments, 'nyanken_cooldown.fine': ora } });
      log.info('spedizione | %s paga %d 狩玉 per far rientrare i gatti (%s), saldo %d', doc.character_name ?? '?', sp.prezzo, sp.categoria.nome, saldoKaridama(box.payments));
    }
    encryptAndSend({
      mst_nyanken_id: sp.categoria.mst_nyanken_id,
      payments: (box?.payments ?? []).map((p) => ({ mst_payment_id: Number(p.mst_payment_id), amount: Number(p.amount ?? 0) })),
      return_time: sec(Math.min(sp.fine || ora, ora)),
    }, res, req);
  } catch (error) {
    log.error('Error in nyanken return:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Nyanken return failed');
  }
};

/** I premi solo a spedizione finita; poi la spedizione si chiude e si puo' ripartire. */
async function ritira(req: Request, res: Response, extra: Record<string, unknown>) {
  const { session_id } = req.body as NyankenInput;
  if (typeof session_id !== 'string' || !session_id) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  const doc = await User.findOne({ current_session: session_id });
  if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  const ora = Date.now();
  const sp = datiSpedizione(doc as unknown as ConSpedizione, ora);
  if (sp.stato === 'in_corso') {
    const minuti = Math.ceil((sp.fine - ora) / 60_000);
    return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG,
      `まだ探検中です (The cats are still exploring: ${minuti} min left)`);
  }
  if (sp.stato === 'nessuna') {
    // Nessuna spedizione da ritirare: risposta vuota, niente premi gratis.
    return encryptAndSend({ ...rispostaRisultato([], doc.box?.payments ?? []), ...extra }, res, req);
  }
  // Si chiude PRIMA di consegnare, con condizione: due richieste insieme non danno doppi premi.
  const chiusa = await User.updateOne({ _id: doc._id, 'nyanken_cooldown.fine': sp.fine }, { $set: { 'nyanken_cooldown.fine': 0 } });
  if (chiusa.modifiedCount !== 1) return encryptAndSend({ ...rispostaRisultato([], doc.box?.payments ?? []), ...extra }, res, req);
  const esito = await consegnaPremi(session_id, sp.categoria.mst_nyanken_id);
  if (!esito) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  encryptAndSend({ ...rispostaRisultato(esito.pezzi, esito.doc.box?.payments ?? []), ...extra }, res, req);
}

export const result = async (req: Request, res: Response) => {
  try {
    await ritira(req, res, {});
  } catch (error) {
    log.error('Error in nyanken result:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Nyanken result failed');
  }
};

export const paidResult = async (req: Request, res: Response) => {
  try {
    await ritira(req, res, { disp_last_one_result: 0, is_pop_not_enough_zeny: 0, max_potential_equipments: [] });
  } catch (error) {
    log.error('Error in nyanken paid result:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Nyanken paid result failed');
  }
};

/** Stato della spedizione del giocatore (prima era un valore fisso uguale per tutti). */
export const progress = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as { session_id?: string };
    const doc = typeof session_id === 'string' && session_id ? await User.findOne({ current_session: session_id }) : null;
    const ora = Date.now();
    const sp = doc ? datiSpedizione(doc as unknown as ConSpedizione, ora) : null;
    const attiva = !!sp && sp.stato !== 'nessuna';
    encryptAndSend({
      balloon_color_id: 0,
      currency_ammount: attiva ? sp!.prezzo : 0,
      discount_currency_ammount: 0,
      island_reward_times: 0,
      message_leaving: '',
      message_waiting: '',
      mst_nyanken_id: attiva ? sp!.categoria.mst_nyanken_id : 0,
      nyanken_icon_id: 0,
      prob_effect_value: 0,
      rare_appear_time: 0,
      rare_flag: 0,
      return_time: attiva ? sec(sp!.fine) : 0,
    }, res, req);
  } catch (error) {
    log.error('Error in nyanken progress:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Nyanken progress failed');
  }
};

export const islandInfoGet = (req: Request, res: Response) => {
  //Initial Load
  const data = {
    area_info_list: [
      // {
      //   clear_num: 0,
      //   last_reward_type: 0,
      //   reward_id: 0,
      //   reward_type: 0,
      // },
    ],
    area_reward_list: [
      {
        reward_id: 0,
        normal_reward_list: [
          {
            is_reward: 1,
            prob_type_id: 0,
            reward_item: {
              katamaris: [
                {
                  mst_katamari_type_id: 1286668442,
                  equipment: [
                    {
                      auto_potential_composite: 0,
                      awaked: 0,
                      created: 0,
                      elv: 0,
                      endAwakeCount: 0,
                      endAwakeRemain: 0,
                      end_remain: 0,
                      equipment_id: 'WD_AXE103',
                      evolve_start_time: 0,
                      favorite: 0,
                      is_awake: 0,
                      is_complete_auto_potential_composite: 0,
                      mst_equipment_id: 3880313379,
                      potential: 0,
                      slv: 0,
                      start_remain: 0,
                    },
                  ],
                },
              ],
            },
          },
        ],
        special_reward_list: [
          // {
          //   is_reward:0,
          //   prob_type_id:0,
          //   reward_item:{
          //     travel: [
          //         {
          //           amount: 0,
          //           mst_travel_id: 0
          //         }
          //       ]
          //   }
          // }
        ],
      },
    ],
    currency_ammount: 0,
    discount_currency_ammount: 0,
    mst_nyanken_id: 9116,
    play_before_result: 0,
    play_result: 0,
    prob_effect_value: 0,
    reward_times: 0,
  };
  encryptAndSend(data, res, req);
};

export const historyGet = (req: Request, res: Response) => {
  const data = {
    balloon_color_id: 0,
    currency_ammount: 0,
    discount_currency_ammount: 0,
    island_reward_times: 0,
    message_leaving: 'message_leaving',
    message_waiting: 'message_waiting',
    mst_nyanken_id: 9116,
    nyanken_icon_id: 0,
    prob_effect_value: 0,
    rare_appear_time: 0,
    rare_flag: 0,
    return_time: 0,
  };
  encryptAndSend(data, res, req);
};

export const QuestList = (req: Request, res: Response) => {
  /*
   * Una voce per spedizione (nyanken-categorie.json). I campi sono quelli di
   * nResponse::Questdatalist letti dal gioco (createProperty in libMHS.so);
   * i valori a 0 sono gli stessi della vecchia voce unica, che il client
   * accettava gia'. Cambiano solo ID, nome, banner e ordine.
   */
  const questDataList = CATEGORIE.map((c) => ({
    beginner_flag: 0,
    close: 0,
    // Costo vero in 狩玉 (tabella del gioco): prima 0, e il prezzo non si vedeva.
    currency_ammount: c.costo ?? 0,
    currency_type: 0,
    discount_currency_ammount: 0,
    end: 0,
    island_info: {
      area_info_list: [],
      area_reward_list: [],
    },
    play_result: 0,
    prob_effect_value: 0,
    reward_times: 0,
    mst_banner_id: c.mst_banner_id,
    mst_nyanken_id: c.mst_nyanken_id,
    name: c.nome,
    open: 0,
    play_limit: 0,
    play_now: 0,
    quest_state: 0,
    // Durata in minuti (services/spedizioniGatti.ts); currency_ammount qui e' il prezzo pieno del rientro.
    quest_time: durataMinuti(c.nome),
    sequence_no: c.ordine,
    sort_key: c.ordine,
    start: 0,
    time_display_flag: 0,
  }));
  encryptAndSend({ questDataList }, res, req);
};

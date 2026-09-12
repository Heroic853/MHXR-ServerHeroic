import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import type { ShopBuyInput } from './shop.schema.js';

const log = createLogger('shop');

/*
 * NEGOZIO A 1 ZENY.
 *
 * Vende tutti i 4878 materiali del gioco a 1 zeny l'uno. Gli id vengono da
 * src/json/materiali.json, costruito dal foglio degli oggetti e gia' usato dal
 * server per filtrare le ricompense: nessun id inventato.
 *
 * PERCHE' SOLO MATERIALI: il crash del login di agosto era causato da due cose,
 * un equipaggiamento scritto in box con 15 campi invece di 16, e un id che non
 * era un materiale finito in box.materials. Qui non si tocca box.equipments e
 * si accetta solo cio' che sta nella tabella verificata, quindi nessuna delle
 * due puo' ripetersi.
 *
 * COSA NON SI TOCCA: le funzioni info(), karidamaInfo() e karidamaList() restano
 * esattamente le originali di upstream. /api/shop/info viene chiamata DURANTE
 * IL LOGIN — modificarne i campi e' gia' costato un login rotto una volta.
 * /api/shop/list e /api/shop/buy invece il client le chiama solo quando apre
 * davvero il negozio, quindi un errore li' rompe il negozio, non l'ingresso.
 */

interface VoceMateriale {
  id: number;
  nome: string;
  rarita: number;
}

const CATALOGO = materiali as ReadonlyArray<VoceMateriale>;
const PER_ID = new Map<number, VoceMateriale>(CATALOGO.map((m) => [m.id, m]));

const PREZZO = 1;        // 1 zeny per unita', come richiesto
const MAX_PER_ACQUISTO = 99; // tetto di sicurezza: evita che un amount assurdo
                             // (o malformato) crei quantita' fuori scala in box

/*
 * QUANTI OGGETTI METTERE IN VETRINA — e perche' non tutti e 4878.
 *
 * Il catalogo intero, replicato nei tre scaffali che il client conosce, produce
 * una risposta di 4,9 MB (misurata). Cifrata diventa anche di piu'. Su un gioco
 * per telefono e' quasi certo che significhi timeout, memoria esaurita o
 * interfaccia bloccata — e sarebbe un guaio scoprirlo col negozio che non si
 * apre piu'.
 *
 * Si parte da un numero prudente e si sale a scalini verificando in gioco,
 * esattamente come si e' fatto per l'equipaggiamento (5 per categoria, poi 25,
 * poi 100). Con 300 voci la risposta sta sotto il megabyte.
 *
 * Per alzarlo: cambiare SHOP_MAX_VOCI nel .env (non serve ricompilare il
 * codice, solo riavviare), oppure mettere 0 per togliere del tutto il limite.
 */
const MAX_VOCI = (() => {
  const v = Number(process.env.SHOP_MAX_VOCI);
  return Number.isFinite(v) && v >= 0 ? v : 300;
})();

/*
 * La selezione, quando c'e' un tetto: campione distribuito su TUTTE le rarita'
 * invece dei primi N di fila. Prendendo i primi si avrebbero solo gli oggetti
 * di inizio tabella (monete di rame e poco altro); cosi' invece si trova roba
 * di ogni livello, che e' quello che serve per potenziare.
 */
const IN_VETRINA: ReadonlyArray<VoceMateriale> = (() => {
  if (!MAX_VOCI || MAX_VOCI >= CATALOGO.length) return CATALOGO;
  const perRarita = new Map<number, VoceMateriale[]>();
  for (const m of CATALOGO) {
    if (!perRarita.has(m.rarita)) perRarita.set(m.rarita, []);
    perRarita.get(m.rarita)!.push(m);
  }
  const quota = Math.max(1, Math.floor(MAX_VOCI / perRarita.size));
  const scelti: VoceMateriale[] = [];
  for (const [, lista] of [...perRarita.entries()].sort((a, b) => a[0] - b[0])) {
    const quanti = Math.min(quota, lista.length);
    const passo = lista.length / quanti;
    for (let i = 0; i < quanti; i++) scelti.push(lista[Math.min(lista.length - 1, Math.floor(i * passo))]!);
  }
  return scelti;
})();

/** Una riga del negozio, nella forma che il client si aspetta. */
function vetrina(m: VoceMateriale) {
  return {
    detail: m.nome,
    disp_item_contents: { materials: [{ amount: 1, mst_material_id: m.id }] },
    end_remain: 30000,
    // il combobox del negozio filtra su questo campo: una categoria sola,
    // perche' il foglio dei materiali non ne ha di proprie oltre alla rarita'
    filter_type: 0,
    item_contents: { materials: [{ amount: 1, mst_material_id: m.id }] },
    // Limiti mai a 0: un contatore "x/0" e' stato il sospetto principale del
    // crash del client di agosto. Valori finiti e ampi.
    item_limit: 0,
    item_limit_max: MAX_PER_ACQUISTO,
    mst_shop_item_id: m.id,
    name: m.nome,
    price: PREZZO,
    shop_limit: 0,
    shop_limit_max: MAX_PER_ACQUISTO,
    start_remain: 0,
  };
}

export const karidamaInfo = (req: Request, res: Response) => {
  const data = {
    karidama_shop_infos: [
      {
        end_remain: 36000,
        mst_karidama_shop_id: 1,
        name: 'karidama_shop',
        start_remain: 0,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const karidamaList = (req: Request, res: Response) => {
  const data = {
    karidama_shop_items: [
      {
        detail: 'detail',
        disp_item_contents: {
          payments: [
            {
              amount: 50,
              mst_payment_id: 1573159746,
            },
          ],
        },
        end_remain: 36000,
        flag_mst_shop_item_id: 0,
        item_contents: {
          payments: [
            {
              amount: 50,
              mst_payment_id: 1573159746,
            },
          ],
        },
        item_limit: 0,
        item_limit_max: 2,
        mst_shop_item_id: 0,
        name: 'name',
        price: 0,
        shop_limit: 1,
        shop_limit_max: 4,
        shop_type: 0,
        start_remain: 0,
      },
    ],
    type_list: [
      {
        name: 'test name',
        type: 0,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const info = (req: Request, res: Response) => {
  const data = {
    high_upper_shop_info: {
      end_remain: 36000,
      mst_event_point_id: 3190222199,
      mst_shop_id: 1,
      name: 'test1',
      start_remain: 0,
    },
    low_upper_shop_info: {
      end_remain: 36000,
      mst_event_point_id: 3190222199,
      mst_shop_id: 2,
      name: 'test2',
      start_remain: 0,
    },
    shop_infos: [
      {
        end_remain: 36000,
        mst_event_point_id: 3190222199,
        mst_shop_id: 3,
        name: 'test3',
        start_remain: 0,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

/**
 * L'elenco del negozio: tutti i materiali del gioco, a 1 zeny l'uno.
 *
 * Il client la chiama solo quando il giocatore apre davvero il negozio, non al
 * login — quindi qui si puo' lavorare senza il rischio che ha morso ad agosto.
 */
export const list = (req: Request, res: Response) => {
  const voci = IN_VETRINA.map(vetrina);
  // Le tre liste sono i tre scaffali che il client conosce. Si riempiono tutte
  // con lo stesso elenco: qualunque scaffale apra, trova la stessa merce.
  const data = {
    high_upper_shop_items: voci,
    low_upper_shop_items: voci,
    shop_items: voci,
  };
  log.info(
    'negozio aperto | %d materiali in vetrina su %d totali, %d zeny l\'uno',
    voci.length, CATALOGO.length, PREZZO,
  );
  encryptAndSend(data, res, req);
};

export const buy = async (req: Request, res: Response) => {
  try {
    const { session_id, amount, mst_shop_item_id } = req.body as ShopBuyInput;

    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    // Solo id che sono DAVVERO materiali. Un id fuori catalogo scritto in box
    // blocca il login in modo permanente: e' gia' successo con 1277724242.
    const voce = PER_ID.get(Number(mst_shop_item_id));
    if (!voce) {
      log.info('acquisto rifiutato: id %s non e\' un materiale', String(mst_shop_item_id));
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Oggetto non disponibile');
    }

    const quanti = Math.max(1, Math.min(MAX_PER_ACQUISTO, Number(amount) || 1));
    const costo = PREZZO * quanti;

    const box = doc.box as unknown as {
      zeny?: number | null;
      materials?: { amount?: number | null; mst_material_id?: number | null }[];
    };
    if (!box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Inventario assente');
    }

    /*
     * Lo zeny NON sta in box.payments: quello e' l'array delle valute speciali
     * (PAYMENT00001 = gemme, e altre cinque). Lo zeny e' un numero singolo,
     * box.zeny — confonderli significherebbe scalare la valuta sbagliata.
     */
    const zeny = Number(box.zeny ?? 0);
    if (zeny < costo) {
      log.info('acquisto rifiutato: servono %d zeny, ne ha %d', costo, zeny);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Zeny insufficienti');
    }

    // Si scala solo dopo aver superato tutti i controlli, mai prima.
    box.zeny = zeny - costo;

    if (!box.materials) box.materials = [];
    const esistente = box.materials.find((m) => Number(m?.mst_material_id) === voce.id);
    if (esistente) esistente.amount = Number(esistente.amount ?? 0) + quanti;
    else box.materials.push({ mst_material_id: voce.id, amount: quanti });

    doc.markModified('box');
    await doc.save();

    log.info('acquisto | %s x%d per %d zeny (restano %d)', voce.nome, quanti, costo, box.zeny);

    const data = {
      item_contents: { materials: [{ amount: quanti, mst_material_id: voce.id }] },
      // payments resta vuoto: la spesa e' in zeny, non in una valuta speciale
      payments: [],
      zeny: box.zeny,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Errore in shop buy:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Buy failed');
  }
};

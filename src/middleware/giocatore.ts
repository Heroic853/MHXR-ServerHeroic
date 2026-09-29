import type { Request, Response, NextFunction } from 'express';
import User from '../model/user.js';

/*
 * Nome del personaggio nei log delle richieste (es. "POST /api/box/get 200 15ms [Heroic69]").
 *
 * Il client manda solo session_id: lo si traduce in character_name con una
 * query leggera, tenuta in cache per non pesare su ogni chiamata. Qualunque
 * errore qui viene ingoiato: un log senza nome e' meglio di una richiesta fallita.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_VOCI = 5000;
const cache = new Map<string, { nome: string; scade: number }>();

export async function giocatoreMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const sessione = (req.body as { session_id?: unknown } | undefined)?.session_id;
    // Mai interrogare con una sessione non stringa: { current_session: undefined }
    // combacerebbe con un utente qualsiasi e il log mostrerebbe il nome sbagliato.
    if (typeof sessione === 'string' && sessione) {
      const adesso = Date.now();
      const voce = cache.get(sessione);
      if (voce && voce.scade > adesso) {
        res.locals.giocatore = voce.nome;
      } else {
        const doc = await User.findOne({ current_session: sessione }, { character_name: 1 }).lean();
        const nome = doc?.character_name ? String(doc.character_name) : '';
        if (nome) {
          if (cache.size >= MAX_VOCI) cache.clear();
          cache.set(sessione, { nome, scade: adesso + TTL_MS });
          res.locals.giocatore = nome;
        }
      }
    }
  } catch {
    // ignorato di proposito, vedi sopra
  }
  next();
}

/** Riga di log: metodo, url, stato, tempo e, se noto, il personaggio. */
export function rigaLog(req: Request, res: Response & { responseTime?: number }): string {
  const locals = (req.res?.locals ?? {}) as { giocatore?: string };
  const nome = locals.giocatore ? ` [${locals.giocatore}]` : '';
  const riga = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${res.responseTime ?? 0}ms${nome}`;
  // Le graffe vanno tolte: express-winston tratta come template (codice eseguito)
  // un messaggio che contiene "{{", e nome e url li sceglie il client.
  return riga.replace(/[{}]/g, '');
}

import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Request, Response } from 'express';
import path from 'path';

const __dirname = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));

/*
 * Dove mandare il giocatore quando il gioco apre una delle sue pagine web
 * interne (notizie, calendario eventi).
 *
 * In origine puntava a hunters.mh-xr.jp, il sito ufficiale, spento nel 2020.
 * Upstream l'ha sostituito con "https://localhost/", che non esiste: il gioco
 * riceveva un 302 verso il nulla — nei log si vedeva
 * "GET /web/notice/index 302" e all'utente compariva una pagina morta.
 *
 * Ora punta al sito del server. Si cambia da .env con SITE_URL senza
 * ricompilare, cosi' non serve toccare il codice per spostare il sito.
 */
const SITO = (process.env.SITE_URL || 'https://heroic853.github.io/Heroic853SiteV1/').trim();

/*
 * La pagina di ripiego per tutte le pagine web interne del gioco. Contiene il
 * segnaposto {{SITO}}, sostituito qui: cosi' l'indirizzo del sito vive in un
 * posto solo (SITE_URL nel .env) e non va aggiornato anche nell'HTML.
 *
 * Si legge a ogni richiesta e non si tiene in cache: succede una volta ogni
 * tanto, quando il giocatore apre una webview, e in cambio si puo' correggere
 * il file senza riavviare il server.
 */
export const getWebContent = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'web-content.html');
  readFile(filePath, 'utf-8')
    .then((html) => {
      res.type('html').send(html.replaceAll('{{SITO}}', SITO));
    })
    .catch(() => {
      // Se il file mancasse, meglio mandare il giocatore sul sito che dargli un
      // errore dentro la webview del gioco.
      res.redirect(SITO);
    });
};
export const getNoticeIndexOld = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'notice-index-old.html');
  res.sendFile(filePath);
};

// I frammenti "#/info/top/3/0" e "#/schedule/top" servivano a entrare in una
// pagina precisa del vecchio sito ufficiale, che era una single-page app. Su un
// sito statico non significano niente, quindi si va alla radice.
export const getNoticeIndex = (req: Request, res: Response) => {
  res.redirect(SITO);
};

export const getScheduleIndex = (req: Request, res: Response) => {
  res.redirect(SITO);
};
export const getScheduleIndexOld = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'schedule-index-old.html');
  res.sendFile(filePath);
};

export const getDownload = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'download.html');
  res.sendFile(filePath);
};

export const getFirstDL = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'first-dl.html');
  res.sendFile(filePath);
};

export const getPatcher = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'patcher.html');
  res.sendFile(filePath);
};

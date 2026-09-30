import { fileURLToPath } from 'node:url';
import { Request, Response } from 'express';
import path from 'path';

const __dirname = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));

/*
 * Dove mandare il giocatore quando il gioco apre una delle sue pagine web
 * interne (notizie, calendario eventi) tramite un redirect DIRETTO (nessuna
 * pagina nostra di mezzo).
 *
 * In origine puntava a hunters.mh-xr.jp, il sito ufficiale, spento nel 2020.
 * Upstream l'ha sostituito con "https://localhost/", che non esiste: il gioco
 * riceveva un 302 verso il nulla — nei log si vedeva
 * "GET /web/notice/index 302" e all'utente compariva una pagina morta.
 *
 * Si cambia da .env con SITE_URL senza ricompilare.
 */
const SITO = (process.env.SITE_URL || 'https://heroic853.github.io/Heroic853SiteV1/newmods').trim();

/*
 * Pagina mostrata mentre il gioco scarica le risorse (/web/notice/first_dl e
 * /web/download): prima era una nostra pagina nera "Downloading game resources...",
 * ora il messaggio di ringraziamento del sito (scelta del gestore, 30/09).
 * Si cambia da .env con DOWNLOAD_PAGE_URL senza ricompilare.
 */
const PAGINA_DOWNLOAD = (process.env.DOWNLOAD_PAGE_URL || 'https://heroic853.github.io/Heroic853SiteV1/MessageOfGratitude').trim();

/*
 * Tutte le altre pagine web interne del gioco (catch-all /web/*: guide armi,
 * premi dei gatti, ecc.) vanno dritte alla stessa pagina di SITO. Prima qui
 * si mostrava una nostra card HTML (web-content.html) con un bottone verso la
 * guida: tolta su richiesta, il giocatore deve arrivare subito al sito.
 */
export const getWebContent = (req: Request, res: Response) => {
  res.redirect(SITO);
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
  res.redirect(PAGINA_DOWNLOAD);
};

export const getFirstDL = (req: Request, res: Response) => {
  res.redirect(PAGINA_DOWNLOAD);
};

export const getPatcher = (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'web-res', 'patcher.html');
  res.sendFile(filePath);
};

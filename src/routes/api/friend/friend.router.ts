import { Router } from 'express';
import { capacityInfo, listFriends, listRequests, sendRequest, acceptRequest } from './friend.controller.js';
import { validate } from '../../../middleware/validation.js';
import { SessionOnlySchema } from '../../../schemas/common.schema.js';
import { SendRequestSchema, AcceptRequestSchema } from './friend.schema.js';

const friendRouter = Router();

friendRouter.post('/capacity/info', validate(SessionOnlySchema), capacityInfo);
friendRouter.post('/listRequests', validate(SessionOnlySchema), listRequests);
friendRouter.post('/listFriends', validate(SessionOnlySchema), listFriends);
friendRouter.post('/acceptRequest', validate(AcceptRequestSchema), acceptRequest);
// "sendRequest" e' il nome del percorso che uso qui, sullo stesso stile di
// "/acceptRequest" (l'unico gia' confermato in precedenza, anche se mai
// implementato) — MA, a differenza di ogni altro percorso in questo
// progetto, QUESTO NON e' verificato da un traffico vero: non esiste da
// nessuna parte un riferimento al percorso reale usato dal client per
// mandare una richiesta di amicizia. Se non funziona dal gioco, il modo per
// scoprire quello vero e' catturare il traffico con src/proxy/ mentre si usa
// la funzione "cerca amico -> aggiungi" in un client reale, e correggere qui.
friendRouter.post('/sendRequest', validate(SendRequestSchema), sendRequest);

export default friendRouter;

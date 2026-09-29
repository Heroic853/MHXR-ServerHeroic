import { Router } from 'express';
import * as nyankenController from './nyanken.controller.js';
import { validate } from '../../../middleware/validation.js';
import { SessionOnlySchema } from '../../../schemas/common.schema.js';
import { NyankenSchema } from './nyanken.schema.js';

const nyankenRouter = Router();

nyankenRouter.post('/progress', validate(SessionOnlySchema), nyankenController.progress);
nyankenRouter.post('/historyGet', validate(SessionOnlySchema), nyankenController.historyGet);
nyankenRouter.post('/questlist', validate(SessionOnlySchema), nyankenController.QuestList);
nyankenRouter.post('/islandInfoGet', validate(SessionOnlySchema), nyankenController.islandInfoGet);
// Percorsi presi dalle stringhe del client (libMHS.so): nyanken/start,
// start/next, return, result, paid/result. /result era chiamato davvero dal
// gioco e rispondeva 404 (visto nei log): i gatti tornavano senza premi.
nyankenRouter.post('/start', validate(NyankenSchema), nyankenController.start);
nyankenRouter.post('/start/next', validate(NyankenSchema), nyankenController.start);
nyankenRouter.post('/return', validate(NyankenSchema), nyankenController.returnHome);
nyankenRouter.post('/result', validate(NyankenSchema), nyankenController.result);
nyankenRouter.post('/paid/result', validate(NyankenSchema), nyankenController.paidResult);

export default nyankenRouter;

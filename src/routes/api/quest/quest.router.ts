import { Router } from 'express';
import * as questController from './quest.controller.js';
import * as questIslandController from './questIsland.controller.js';
import * as questEventController from './questEvent.controller.js';
import * as questForestController from './questForest.controller.js';
import * as questTrainingController from './questTraining.controller.js';
import * as questKatamariController from './questKatamari.controller.js';
import { validate } from '../../../middleware/validation.js';
import {
  IslandStartSchema,
  IslandEndSchema,
  IslandMapAllSchema,
  EventStartSchema,
  EternalStartSchema,
} from './quest.schema.js';
import { TrainingListSchema, TrainingStartSchema, TrainingEndSchema } from './questTraining.schema.js';
import { SessionOnlySchema } from '../../../schemas/common.schema.js';

import * as notImplemented from '../notImplemented.controller.js';

const questRouter = Router();

questRouter.post('/progress', validate(SessionOnlySchema), questController.questProgress);
questRouter.post('/result/end', validate(SessionOnlySchema), questController.questResultEnd);
//questRouter.post("/result/retry", );

questRouter.post('/retire', notImplemented.blankResponseEncrypted);
questRouter.post('/continue', notImplemented.blankResponseEncrypted);

//Island
questRouter.post('/island/map/all', validate(IslandMapAllSchema), questIslandController.islandMapAll);
//questRouter.post("/island/map/ocean", );
questRouter.post('/island/start', validate(IslandStartSchema), questIslandController.islandStart);
questRouter.post('/island/end', validate(IslandEndSchema), questIslandController.islandEnd);
//questRouter.post("/island/restart", );

//Eternal
questRouter.post('/eternal/all', validate(SessionOnlySchema), questController.eternalAll);
questRouter.post('/eternal/start', validate(EternalStartSchema), questController.eternalStart);
// Mancava del tutto: a fine caccia eterna il client chiama questa rotta, il
// server rispondeva "404 UNMATCHED" e il gioco restava sulla schermata finale
// senza consegnare niente. Stesso identico caso gia' risolto per
// /event/normal/end, quindi stessa cura: islandEnd e' generico
// (mst_quest_id + clear_time + session_id), segna la quest fra le completate
// e accredita le ricompense in inventario.
questRouter.post('/eternal/end', validate(IslandEndSchema), questIslandController.islandEnd);
//questRouter.post("/eternal/restart", );

//Event
questRouter.post('/event/list/all', validate(SessionOnlySchema), questEventController.eventListAll);
// Stessa storia di /event/normal/end: era commentata e il client resterebbe
// bloccato a fine battaglia a 16. Collegata allo stesso gestore generico.
questRouter.post('/event/m16/end', validate(IslandEndSchema), questIslandController.islandEnd);
questRouter.post('/event/m16/restart', notImplemented.blankResponseEncrypted);
//questRouter.post("/event/m16/start", );
// Il client chiama questa rotta appena finisce una quest evento, e se non
// risponde riprova all'infinito: la ricompensa non arriva e si resta bloccati
// sulla schermata di fine caccia. Era rimasta commentata, quindi il server
// restituiva 404 UNMATCHED.
// Uso lo stesso gestore gia' collegato a /event/score/end e /event/ticket/end:
// islandEnd e' generico (mst_quest_id + clear_time + session_id), registra la
// quest fra le completate e rimanda il riepilogo di fine missione.
questRouter.post('/event/normal/end', validate(IslandEndSchema), questIslandController.islandEnd);
//questRouter.post("/event/normal/restart", );
questRouter.post('/event/normal/start', validate(EventStartSchema), questEventController.eventNormalStart);
questRouter.post('/event/score/end', validate(IslandEndSchema), questIslandController.islandEnd);
//questRouter.post("/event/score/restart", );
questRouter.post('/event/score/start', validate(EventStartSchema), questEventController.eventScoreStart);
questRouter.post('/event/ticket/end', validate(IslandEndSchema), questIslandController.islandEnd);
questRouter.post('/event/ticket/free', validate(SessionOnlySchema), questEventController.eventTicketFree);
//questRouter.post("/event/ticket/restart", );
questRouter.post('/event/ticket/start', validate(EventStartSchema), questEventController.eventTicketStart);

// Forest
questRouter.post('/forest/end', validate(SessionOnlySchema), questForestController.questForestEnd);
//questRouter.post("/forest/fuel/recovery", );
questRouter.post('/forest/info/get', validate(SessionOnlySchema), questForestController.forestInfoGet);
//questRouter.post("/forest/item/organize", );
//questRouter.post("/forest/lottery/info/get", );
//questRouter.post("/forest/lottery/lot", );
//questRouter.post("/forest/lottery/reset", );
questRouter.post('/forest/progress', validate(SessionOnlySchema), questForestController.questForestProgress);
questRouter.post('/forest/restart', validate(SessionOnlySchema), questForestController.questForestRestart);

//Training
questRouter.post('/training/list', validate(TrainingListSchema), questTrainingController.trainingList);
questRouter.post('/training/start', validate(TrainingStartSchema), questTrainingController.trainingStart);
questRouter.post('/training/end', validate(TrainingEndSchema), questTrainingController.trainingEnd);

//questRouter.post("/reward/exchange", );
// Il gioco la chiama dopo island/end (che manda final_reward_info) per il
// "premio finale". Mai implementata nell'originale: rispondeva 404 e il client
// riprovava all'infinito (visto nei log: 10 tentativi di fila). Il formato vero
// della risposta (nResponse::Add_final) non e' noto: si usa la stessa risposta
// vuota dell'originale per retire/continue, cosi' il gioco va avanti. I premi
// normali della missione li ha gia' accreditati island/end.
// Niente validate(): la richiesta porta campi mai visti (uno schema stretto la
// rifiuterebbe) e la risposta vuota non legge niente dal body.
questRouter.post('/reward/final', notImplemented.blankResponseEncrypted);
//questRouter.post("/reward/normal", );

//questRouter.post("/reward/m16/point", );

/*
 * Era agganciata a blankResponseEncrypted, cioe' rispondeva {}: il fagotto
 * raccolto durante la caccia compariva al giocatore come "null" perche' il
 * server non diceva mai cosa contenesse. Ora risponde davvero.
 *
 * Niente validate(): non sappiamo ancora con certezza quali campi mandi il
 * client (la rotta non e' mai stata implementata, non esiste uno schema da cui
 * dedurli) e uno schema stretto rifiuterebbe la richiesta con un 400. Il
 * controller registra nei log i campi che riceve: quando si vedra' il nome
 * vero, si potra' aggiungere lo schema.
 */
questRouter.post('/katamari/content/get', questKatamariController.contentGet);

export default questRouter;

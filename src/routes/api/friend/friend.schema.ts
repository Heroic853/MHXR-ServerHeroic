import { z } from 'zod';
import { sessionIdSchema, commonRequestFields } from '../../../schemas/common.schema.js';

// Il "cerca amico" del gioco (user.controller.ts::searchId/gameId) NON
// restituisce mai lo user_id interno nella risposta al client (verificato:
// "user_id" nel controller compare una sola volta in tutto il file, ed e'
// dentro buildUserInfoResponse, cioe' l'INFO DEL PROPRIO account, non quella
// di un giocatore cercato) — l'unico identificativo che il client vede per
// UN ALTRO giocatore e' game_id. Quindi qui si identifica il bersaglio per
// game_id, non per uid: e' quello che il client puo' davvero conoscere dopo
// una ricerca.
export const SendRequestSchema = z
  .object({
    session_id: sessionIdSchema,
    target_game_id: z.string(),
    ...commonRequestFields,
  })
  .loose();
export type SendRequestInput = z.infer<typeof SendRequestSchema>;

export const AcceptRequestSchema = z
  .object({
    session_id: sessionIdSchema,
    target_game_id: z.string(),
    ...commonRequestFields,
  })
  .loose();
export type AcceptRequestInput = z.infer<typeof AcceptRequestSchema>;

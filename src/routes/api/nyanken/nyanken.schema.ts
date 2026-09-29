import { z } from 'zod';
import { sessionIdSchema, commonRequestFields } from '../../../schemas/common.schema.js';

// .loose(): il client manda anche mst_nyanken_id e forse la squadra di gatti,
// campi mai visti in un traffico reale. Uno schema .strict() li rifiuterebbe
// appena si riattiva la validazione (ENABLE_VALIDATION=true).
export const NyankenSchema = z
  .object({
    session_id: sessionIdSchema,
    mst_nyanken_id: z.number().int().optional(),
    ...commonRequestFields,
  })
  .loose();

export type NyankenInput = z.infer<typeof NyankenSchema>;

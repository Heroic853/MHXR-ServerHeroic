import { z } from 'zod';
import { commonRequestFields, sessionIdSchema } from '../../../schemas/common.schema.js';

export const ShopBuySchema = z
  .object({
    // Serve per sapere CHI compra: senza sessione non si puo' scalare lo zeny
    // ne' scrivere nell'inventario. Il client la manda su ogni richiesta, ma
    // non era dichiarata qui perche' il controller non la usava mai davvero.
    session_id: sessionIdSchema,
    amount: z.number().int(),
    mst_shop_id: z.number().int(),
    mst_shop_item_id: z.number().int(),
    ...commonRequestFields,
  })
  .loose();

export type ShopBuyInput = z.infer<typeof ShopBuySchema>;

import { z } from 'zod';
import {
  AttrPredicateSchema,
  QueryDsl,
  QuerySchema,
} from '../NodeQuery/QuerySchema.js';

export type EdgeQueryDsl =
  | { any: true }
  | { and: EdgeQueryDsl[] }
  | { or: EdgeQueryDsl[] }
  | { not: EdgeQueryDsl }
  | {
      from?: QueryDsl;
      to?: QueryDsl;
      attr?: z.infer<typeof AttrPredicateSchema>;
    };

export const EdgeQuerySchema: z.ZodType<EdgeQueryDsl> = z.lazy(() =>
  z.union([
    z.object({ any: z.literal(true) }),
    z.object({ and: z.array(EdgeQuerySchema).min(1) }),
    z.object({ or: z.array(EdgeQuerySchema).min(1) }),
    z.object({ not: EdgeQuerySchema }),
    z
      .object({
        from: QuerySchema.optional(),
        to: QuerySchema.optional(),
        attr: AttrPredicateSchema.optional(),
      })
      .refine(
        (value) =>
          value.from !== undefined ||
          value.to !== undefined ||
          value.attr !== undefined,
        {
          message: 'edge query must define at least one of: from | to | attr',
        },
      ),
  ]),
) as z.ZodType<EdgeQueryDsl>;

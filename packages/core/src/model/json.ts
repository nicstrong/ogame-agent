import { z } from "zod";

/**
 * Arbitrary JSON value. Used for {@link Fact} payloads and verbatim raw imports.
 * Kept isomorphic — no Date/undefined; only JSON-representable values.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);

/** A nested projection tree produced by folding facts (object of objects/leaves). */
export type JsonObject = { [key: string]: Json };

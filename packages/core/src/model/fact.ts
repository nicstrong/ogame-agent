import { z } from "zod";
import { jsonSchema } from "./json.js";

/**
 * A fact path addresses a single leaf (or subtree) in the merged projection.
 * Examples:
 *   "celestial/{ogameId}/buildings/metalMine"
 *   "celestial/{ogameId}/resources/metal/amount"
 *   "celestial/{ogameId}/coordinates"            value = { galaxy, system, position, type }
 *   "account/research/energyTechnology"
 */
export const factPathSchema = z.string().min(1);
export type FactPath = z.infer<typeof factPathSchema>;

/**
 * The merge unit. A `set` asserts a value at a path (last-write-wins by importedAt);
 * a `tombstone` removes the subtree at a path (deletion is its own fact).
 */
export const factSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), path: factPathSchema, value: jsonSchema }),
  z.object({ kind: z.literal("tombstone"), path: factPathSchema }),
]);
export type Fact = z.infer<typeof factSchema>;

export function setFact(path: FactPath, value: z.infer<typeof jsonSchema>): Fact {
  return { kind: "set", path, value };
}

export function tombstoneFact(path: FactPath): Fact {
  return { kind: "tombstone", path };
}

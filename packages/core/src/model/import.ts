import { z } from "zod";
import { accountIdSchema, universeIdSchema } from "./ids.js";
import { factSchema } from "./fact.js";

/** Bump when the domain model changes in a way that requires re-folding/migration. */
export const SCHEMA_VERSION = 1;

export const importSourceSchema = z.enum(["oglight", "infocomplete"]);
export type ImportSource = z.infer<typeof importSourceSchema>;

export const transportSchema = z.enum(["paste", "http"]);
export type Transport = z.infer<typeof transportSchema>;

/** v1 is always `owned`; intel reliability tiers come later. */
export const reliabilitySchema = z.enum(["owned"]);
export type Reliability = z.infer<typeof reliabilitySchema>;

/**
 * One immutable record per paste/push — a "version".
 * Raw imports are the source of truth; current state + history are derived by folding the log.
 */
export const importSchema = z.object({
  /** content hash of `raw` — also dedups identical pastes. */
  id: z.string().min(1),
  universeId: universeIdSchema,
  accountId: accountIdSchema,
  source: importSourceSchema,
  /** plugin version, e.g. '5.3.3'. */
  sourceVersion: z.string(),
  transport: transportSchema,
  reliability: reliabilitySchema,
  /** ISO-8601 timestamp. */
  importedAt: z.string(),
  /** domain-model version, for migrations. */
  schemaVersion: z.number().int(),
  /** verbatim payload, never destructively re-parsed. */
  raw: z.string(),
  /** ONLY what the adapter actually observed (absence = unknown, never zero). */
  facts: z.array(factSchema),
});
export type Import = z.infer<typeof importSchema>;

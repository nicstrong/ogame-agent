import { z } from "zod";
import { accountIdSchema, celestialTypeSchema, universeIdSchema } from "./ids.js";
import { factSchema } from "./fact.js";

/**
 * Report schema version. Bump when the report event/summary shape changes in a way
 * that requires re-normalizing from retained raw payloads. Independent of the empire
 * {@link SCHEMA_VERSION} because reports live in their own (Drizzle/SQLite) store.
 */
export const REPORT_SCHEMA_VERSION = 1;

/** Espionage and combat are the raiding-relevant reports; `probe` keeps probe-only kills. */
export const reportKindSchema = z.enum(["espionage", "combat", "probe"]);
export type ReportKind = z.infer<typeof reportKindSchema>;

/** v1 source is OGLight's parsed message objects (architecture §3 / reports-and-history §2). */
export const reportSourceSchema = z.enum(["oglight-message"]);
export type ReportSource = z.infer<typeof reportSourceSchema>;

/**
 * Raw payload retention. Applied by the store, not the parser — the parser always
 * returns `raw`; the store drops it per policy (capture-api-and-storage §2a).
 */
export const reportRawRetentionSchema = z.enum(["full", "hash-only", "none"]);
export type ReportRawRetention = z.infer<typeof reportRawRetentionSchema>;

/** Metal/crystal/deuterium triple; each side optional (absence = unknown, never zero). */
export const reportResourcesSchema = z
  .object({
    metal: z.number().optional(),
    crystal: z.number().optional(),
    deuterium: z.number().optional(),
  })
  .partial();
export type ReportResources = z.infer<typeof reportResourcesSchema>;

/**
 * Target coordinates as a query-friendly subset. `type` is optional because combat /
 * probe reports do not always carry a planet/moon distinction (reports §4a notes
 * coords are nullable for weird/probe-only cases).
 */
export const reportCoordsSchema = z.object({
  galaxy: z.number().int(),
  system: z.number().int(),
  position: z.number().int(),
  type: celestialTypeSchema.optional(),
});
export type ReportCoords = z.infer<typeof reportCoordsSchema>;

/**
 * The stable, query-friendly subset of a report — the columns the durable
 * `report_events` table indexes for raiding/target queries. Everything here is optional
 * because OGLight's per-kind parsers populate different fields; deep item detail
 * (fleet/defense/tech maps, rounds) stays in the raw payload / detail blocks, not here.
 */
export const reportSummarySchema = z.object({
  /** target coordinates; absent for reports OGLight could not place. */
  coords: reportCoordsSchema.optional(),

  // --- target intel (espionage) ---
  /** target player's OGame id (OGLight `playerID`). */
  targetPlayerId: z.string().optional(),
  targetPlayerName: z.string().optional(),
  /** OGLight status letters (e.g. `i`, `I`, `n`, `v`). */
  targetPlayerStatus: z.string().optional(),
  /** activity marker in minutes when present. */
  targetActivity: z.number().optional(),
  targetIsActive: z.boolean().optional(),
  /** OGLight reports the target is already under attack. */
  isAttacked: z.boolean().optional(),
  /** report age in seconds when OGLight parsed it. */
  ageSeconds: z.number().optional(),

  /** current resources observed on the espionage target. */
  resources: reportResourcesSchema.optional(),
  /** loot percentage (0–100) OGLight derived from the report. */
  lootPercent: z.number().optional(),
  /** espionage fleet/defense value totals; `-1` when OGLight flags them hidden. */
  fleetValue: z.number().optional(),
  defenseValue: z.number().optional(),
  hiddenFleet: z.boolean().optional(),
  hiddenDefense: z.boolean().optional(),

  // --- combat ---
  /** combat outcome text/code from OGLight's `result.winner`. */
  result: z.string().optional(),
  /** combat happened on one of *our* celestials — the only own-account crossover. */
  isOwnPlanet: z.boolean().optional(),
  isAttacker: z.boolean().optional(),
  isDefender: z.boolean().optional(),
  isWinner: z.boolean().optional(),
  /** OGLight marks a combat/probe report as probe-only (no real fight). */
  probeOnly: z.boolean().optional(),
  /** plunder/loss for a raid result (negative when we were the loser on our planet). */
  gain: reportResourcesSchema.optional(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

/**
 * One captured OGLight message report — an immutable point-in-time event. Unlike
 * {@link Import}, reports deliberately bypass the fold: they are observations, never
 * merged or last-write-wins. The only crossover is optional `facts` derived from an
 * own-planet combat report (reports-and-history §4 item 4); v1 leaves `facts` empty.
 */
export const reportEventSchema = z.object({
  /** dedup id — stable hash over identity + source message id + raw hash (capture-api §4). */
  id: z.string().min(1),
  universeId: universeIdSchema,
  accountId: accountIdSchema,
  kind: reportKindSchema,
  source: reportSourceSchema,
  /** OGLight version when the envelope carried it; `"unknown"` otherwise. */
  sourceVersion: z.string(),
  /** OGLight's own message id, kept for dedup/debug; absent if not exposed. */
  sourceMessageId: z.string().optional(),
  /** OGLight `api`/hashcode (`sr-…` etc.) when present. */
  apiKey: z.string().optional(),
  /** server receive time (ISO-8601). */
  capturedAt: z.string().datetime({ offset: true }),
  /** report observation/message time when parseable; otherwise omitted. */
  observedAt: z.string().datetime({ offset: true }).optional(),
  /** verbatim request body; present only when the store's retention policy keeps it. */
  raw: z.string().optional(),
  /** content hash of `raw` — always stored, supports dedup/debug even without `raw`. */
  rawHash: z.string().min(1),
  /** report schema version, for migrations. */
  schemaVersion: z.number().int(),
  summary: reportSummarySchema,
  /** derived own-account facts (own-planet combat only); empty for v1. */
  facts: z.array(factSchema),
});
export type ReportEvent = z.infer<typeof reportEventSchema>;

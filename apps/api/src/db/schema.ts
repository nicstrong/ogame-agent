import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Durable normalized report event (reports-and-history §4a). One row per captured
 * OGLight message. Query-fast columns (coords / loot / gain / flags) are promoted out
 * of the summary so raiding/target queries stay indexed; `summary_json` keeps the full
 * core {@link ReportSummary} losslessly so reads don't have to reconstruct it from columns
 * and future summary fields survive before they earn their own column.
 *
 * Booleans use SQLite integer 0/1 (`mode: "boolean"`); timestamps are ISO-8601 text.
 */
export const reportEvents = sqliteTable(
  "report_events",
  {
    /** dedup id — content hash over identity + source message id + raw hash. */
    id: text("id").primaryKey(),
    universeId: text("universe_id").notNull(),
    /** the local account that captured the report (accountId.playerId). */
    ownerPlayerId: text("owner_player_id").notNull(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    sourceVersion: text("source_version"),
    sourceMessageId: text("source_message_id"),
    apiKey: text("api_key"),
    capturedAt: text("captured_at").notNull(),
    observedAt: text("observed_at"),
    rawHash: text("raw_hash").notNull(),
    /** retention policy applied when this row was written (`full`/`hash-only`/`none`). */
    rawRetention: text("raw_retention").notNull(),
    schemaVersion: integer("schema_version").notNull(),

    // --- target coordinates ---
    coordsG: integer("coords_g"),
    coordsS: integer("coords_s"),
    coordsP: integer("coords_p"),
    coordsType: text("coords_type"),

    // --- target intel (espionage) ---
    targetPlayerId: text("target_player_id"),
    targetPlayerName: text("target_player_name"),
    targetPlayerStatus: text("target_player_status"),
    targetActivity: integer("target_activity"),
    targetIsActive: integer("target_is_active", { mode: "boolean" }),
    isAttacked: integer("is_attacked", { mode: "boolean" }),
    ageSeconds: integer("age_seconds"),

    // --- espionage resources / values ---
    resMetal: integer("res_metal"),
    resCrystal: integer("res_crystal"),
    resDeuterium: integer("res_deuterium"),
    lootPercent: real("loot_percent"),
    fleetValue: integer("fleet_value"),
    defenseValue: integer("defense_value"),
    hiddenFleet: integer("hidden_fleet", { mode: "boolean" }),
    hiddenDefense: integer("hidden_defense", { mode: "boolean" }),

    // --- combat ---
    result: text("result"),
    isOwnPlanet: integer("is_own_planet", { mode: "boolean" }),
    isAttacker: integer("is_attacker", { mode: "boolean" }),
    isDefender: integer("is_defender", { mode: "boolean" }),
    isWinner: integer("is_winner", { mode: "boolean" }),
    probeOnly: integer("probe_only", { mode: "boolean" }),
    gainMetal: integer("gain_metal"),
    gainCrystal: integer("gain_crystal"),
    gainDeuterium: integer("gain_deuterium"),

    /** full core ReportSummary as JSON — lossless source for read endpoints. */
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // Collapse pagination revisits of the same message even when volatile fields (and
    // thus `id`/`raw_hash`) differ — first write wins (capture-api-and-storage §4).
    uniqueIndex("report_events_message_uq")
      .on(t.universeId, t.ownerPlayerId, t.kind, t.sourceMessageId)
      .where(sql`${t.sourceMessageId} is not null`),
    index("report_events_recent_idx").on(t.universeId, t.ownerPlayerId, t.kind, t.capturedAt),
    index("report_events_target_idx").on(
      t.universeId,
      t.coordsG,
      t.coordsS,
      t.coordsP,
      t.observedAt,
    ),
  ],
);

/**
 * Optional verbatim raw payload, written only when retention is `full`. Kept in its own
 * table so the hot query table stays narrow and retention cleanup is a row delete.
 */
export const reportPayloads = sqliteTable("report_payloads", {
  reportId: text("report_id")
    .primaryKey()
    .references(() => reportEvents.id),
  rawJson: text("raw_json").notNull(),
  storedAt: text("stored_at").notNull(),
});

export type ReportEventRow = typeof reportEvents.$inferSelect;
export type InsertReportEventRow = typeof reportEvents.$inferInsert;

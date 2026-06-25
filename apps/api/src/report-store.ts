import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AccountId,
  ReportEvent,
  ReportKind,
  ReportRawRetention,
  ReportSummary,
} from "@ogame-agent/core";
import Database from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type InsertReportEventRow,
  type ReportEventRow,
  reportEvents,
  reportPayloads,
} from "./db/schema.js";
import { defaultDataDir } from "./storage.js";

/** Migrations authored by `drizzle-kit generate`; resolved relative to this module. */
const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Resolve the raw-retention policy from the environment (default `full`). */
export function defaultReportRetention(): ReportRawRetention {
  const v = process.env.OGAME_REPORT_RAW_RETENTION;
  return v === "full" || v === "hash-only" || v === "none" ? v : "full";
}

export interface ReportInsertResult {
  /** true when the event (or an earlier capture of the same message) was already stored. */
  deduped: boolean;
  id: string;
  kind: ReportKind;
  universeId: string;
  accountId: AccountId;
  rawRetention: ReportRawRetention;
  derivedFactCount: number;
}

/** Read shape for list/get endpoints — identity + metadata + the lossless summary. */
export interface ReportListItem {
  id: string;
  universeId: string;
  accountId: AccountId;
  kind: ReportKind;
  source: string;
  sourceVersion: string | null;
  sourceMessageId: string | null;
  apiKey: string | null;
  capturedAt: string;
  observedAt: string | null;
  rawHash: string;
  rawRetention: ReportRawRetention;
  summary: ReportSummary;
}

const REPORT_KINDS: ReadonlySet<string> = new Set<ReportKind>(["espionage", "combat", "probe"]);

/**
 * Report event store (capture-api-and-storage §5). Reports are immutable observations, so
 * unlike {@link ImportStore} they bypass the fact/fold projection entirely and live in a
 * Drizzle-managed SQLite database (`<dataDir>/reports.sqlite`), partitioned by
 * universe/account *columns* rather than by folding into `latest.json`.
 *
 * better-sqlite3 is synchronous, so methods are sync; the DB is opened (and migrated)
 * lazily on first use so constructing a store touches no disk.
 */
export class ReportStore {
  private handle?: { sqlite: Database.Database; db: BetterSQLite3Database };
  private readonly retention: ReportRawRetention;
  private readonly dbFile: string;

  constructor(
    dataDir: string = defaultDataDir(),
    opts: { rawRetention?: ReportRawRetention; dbFile?: string } = {},
  ) {
    this.retention = opts.rawRetention ?? defaultReportRetention();
    this.dbFile = opts.dbFile ?? join(dataDir, "reports.sqlite");
  }

  private db(): BetterSQLite3Database {
    if (!this.handle) {
      mkdirSync(dirname(this.dbFile), { recursive: true });
      const sqlite = new Database(this.dbFile);
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite);
      migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      this.handle = { sqlite, db };
    }
    return this.handle.db;
  }

  /** Release the SQLite handle (tests / shutdown). Safe to call when never opened. */
  close(): void {
    this.handle?.sqlite.close();
    this.handle = undefined;
  }

  /**
   * Persist a parsed report. Idempotent: a duplicate `id`, or a re-capture of the same
   * message (the partial unique index on `source_message_id`), is ignored. The raw payload
   * row is written only under `full` retention.
   */
  insert(event: ReportEvent): ReportInsertResult {
    const db = this.db();
    const res = db
      .insert(reportEvents)
      .values(toRow(event, this.retention))
      .onConflictDoNothing()
      .run();
    const inserted = res.changes > 0;
    if (inserted && this.retention === "full" && event.raw !== undefined) {
      db.insert(reportPayloads)
        .values({ reportId: event.id, rawJson: event.raw, storedAt: new Date().toISOString() })
        .onConflictDoNothing()
        .run();
    }
    return {
      deduped: !inserted,
      id: event.id,
      kind: event.kind,
      universeId: event.universeId,
      accountId: event.accountId,
      rawRetention: this.retention,
      derivedFactCount: event.facts.length,
    };
  }

  /** Recent reports for an account, newest first, optionally filtered by kind. */
  list(
    ref: { universeId: string; playerId: string },
    opts: { kind?: string; limit?: number } = {},
  ): ReportListItem[] {
    const conds = [
      eq(reportEvents.universeId, ref.universeId),
      eq(reportEvents.ownerPlayerId, ref.playerId),
    ];
    if (opts.kind && REPORT_KINDS.has(opts.kind)) conds.push(eq(reportEvents.kind, opts.kind));
    const rows = this.db()
      .select()
      .from(reportEvents)
      .where(and(...conds))
      .orderBy(desc(reportEvents.capturedAt))
      .limit(clampLimit(opts.limit))
      .all();
    return rows.map(rowToItem);
  }

  /** One report by id; pass `raw: true` to also load the verbatim payload (if retained). */
  get(
    id: string,
    opts: { raw?: boolean } = {},
  ): (ReportListItem & { raw?: string | null }) | undefined {
    const row = this.db().select().from(reportEvents).where(eq(reportEvents.id, id)).get();
    if (!row) return undefined;
    const item = rowToItem(row);
    if (!opts.raw) return item;
    const payload = this.db()
      .select()
      .from(reportPayloads)
      .where(eq(reportPayloads.reportId, id))
      .get();
    return { ...item, raw: payload?.rawJson ?? null };
  }
}

/** Clamp a requested list limit into a sane range (default 100, max 500). */
function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return 100;
  return Math.max(1, Math.min(500, Math.trunc(limit as number)));
}

function toRow(event: ReportEvent, retention: ReportRawRetention): InsertReportEventRow {
  const s = event.summary;
  const c = s.coords;
  return {
    id: event.id,
    universeId: event.universeId,
    ownerPlayerId: event.accountId.playerId,
    kind: event.kind,
    source: event.source,
    sourceVersion: event.sourceVersion,
    sourceMessageId: event.sourceMessageId ?? null,
    apiKey: event.apiKey ?? null,
    capturedAt: event.capturedAt,
    observedAt: event.observedAt ?? null,
    rawHash: event.rawHash,
    rawRetention: retention,
    schemaVersion: event.schemaVersion,
    coordsG: c?.galaxy ?? null,
    coordsS: c?.system ?? null,
    coordsP: c?.position ?? null,
    coordsType: c?.type ?? null,
    targetPlayerId: s.targetPlayerId ?? null,
    targetPlayerName: s.targetPlayerName ?? null,
    targetPlayerStatus: s.targetPlayerStatus ?? null,
    targetActivity: s.targetActivity ?? null,
    targetIsActive: s.targetIsActive ?? null,
    isAttacked: s.isAttacked ?? null,
    ageSeconds: s.ageSeconds ?? null,
    resMetal: s.resources?.metal ?? null,
    resCrystal: s.resources?.crystal ?? null,
    resDeuterium: s.resources?.deuterium ?? null,
    lootPercent: s.lootPercent ?? null,
    fleetValue: s.fleetValue ?? null,
    defenseValue: s.defenseValue ?? null,
    hiddenFleet: s.hiddenFleet ?? null,
    hiddenDefense: s.hiddenDefense ?? null,
    result: s.result ?? null,
    isOwnPlanet: s.isOwnPlanet ?? null,
    isAttacker: s.isAttacker ?? null,
    isDefender: s.isDefender ?? null,
    isWinner: s.isWinner ?? null,
    probeOnly: s.probeOnly ?? null,
    gainMetal: s.gain?.metal ?? null,
    gainCrystal: s.gain?.crystal ?? null,
    gainDeuterium: s.gain?.deuterium ?? null,
    summaryJson: JSON.stringify(s),
    createdAt: new Date().toISOString(),
  };
}

function rowToItem(row: ReportEventRow): ReportListItem {
  return {
    id: row.id,
    universeId: row.universeId,
    accountId: { universeId: row.universeId, playerId: row.ownerPlayerId },
    kind: row.kind as ReportKind,
    source: row.source,
    sourceVersion: row.sourceVersion,
    sourceMessageId: row.sourceMessageId,
    apiKey: row.apiKey,
    capturedAt: row.capturedAt,
    observedAt: row.observedAt,
    rawHash: row.rawHash,
    rawRetention: row.rawRetention as ReportRawRetention,
    summary: JSON.parse(row.summaryJson) as ReportSummary,
  };
}

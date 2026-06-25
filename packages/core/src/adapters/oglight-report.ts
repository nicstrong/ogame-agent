import { asDict, asString, toBool, toIdString, toNumber, type Dict } from "../coerce/index.js";
import { buildAccountId, deriveHeaderIdentity } from "../identity/index.js";
import type { Fact } from "../model/fact.js";
import {
  REPORT_SCHEMA_VERSION,
  reportEventSchema,
  type ReportCoords,
  type ReportEvent,
  type ReportKind,
  type ReportResources,
  type ReportSummary,
} from "../model/report.js";
import { contentHash } from "./hash.js";

/** Parse an OGLight `"g:s:p"` coord string; `type` comes from the caller when known. */
function parseCoordSummary(coords: unknown, type: unknown): ReportCoords | undefined {
  const str = asString(coords);
  if (!str) return undefined;
  const parts = str.split(":");
  if (parts.length !== 3) return undefined;
  const galaxy = toNumber(parts[0]);
  const system = toNumber(parts[1]);
  const position = toNumber(parts[2]);
  if (galaxy === undefined || system === undefined || position === undefined) return undefined;
  const t = asString(type);
  return {
    galaxy,
    system,
    position,
    ...(t === "planet" || t === "moon" ? { type: t } : {}),
  };
}

/** Drop undefined leaves; return undefined if the triple carried nothing. */
function resourcesOrUndefined(r: ReportResources): ReportResources | undefined {
  const out: ReportResources = {};
  if (r.metal !== undefined) out.metal = r.metal;
  if (r.crystal !== undefined) out.crystal = r.crystal;
  if (r.deuterium !== undefined) out.deuterium = r.deuterium;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Assign only defined values so the summary stays sparse (absence = unknown). */
function put<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) obj[key] = value;
}

function espionageSummary(report: Dict): ReportSummary {
  const s: ReportSummary = {};
  put(s, "coords", parseCoordSummary(report.coords, report.targetType));
  put(s, "targetPlayerId", toIdString(report.playerID));
  put(s, "targetPlayerName", asString(report.playerName));
  put(s, "targetPlayerStatus", asString(report.playerStatus));
  put(s, "targetActivity", toNumber(report.activity));
  put(s, "targetIsActive", toBool(report.isActive));
  put(s, "isAttacked", toBool(report.isAttacked));
  put(s, "ageSeconds", toNumber(report.age));
  put(
    s,
    "resources",
    resourcesOrUndefined({
      metal: toNumber(report.metal),
      crystal: toNumber(report.crystal),
      deuterium: toNumber(report.deut),
    }),
  );
  put(s, "lootPercent", toNumber(report.loot));
  put(s, "fleetValue", toNumber(report.fleetValue));
  put(s, "defenseValue", toNumber(report.defValue));
  put(s, "hiddenFleet", toBool(report.hiddenFleet));
  put(s, "hiddenDefense", toBool(report.hiddenDef));
  return s;
}

function combatSummary(report: Dict): ReportSummary {
  const s: ReportSummary = {};
  put(s, "coords", parseCoordSummary(report.coords, undefined));
  put(s, "result", asString(asDict(report.result)?.winner));
  put(s, "isOwnPlanet", toBool(report.isOwnPlanet));
  put(s, "isAttacker", toBool(report.isAttacker));
  put(s, "isDefender", toBool(report.isDefender));
  put(s, "isWinner", toBool(report.isWinner));
  put(s, "probeOnly", toBool(report.probeOnly));
  const gain = asDict(report.gain);
  if (gain) {
    put(
      s,
      "gain",
      resourcesOrUndefined({
        metal: toNumber(gain.metal),
        crystal: toNumber(gain.crystal),
        deuterium: toNumber(gain.deut),
      }),
    );
  }
  return s;
}

function buildSummary(kind: ReportKind, report: Dict): ReportSummary {
  // probe-only kills carry the same combat shape, minus a real fight.
  return kind === "espionage" ? espionageSummary(report) : combatSummary(report);
}

export interface ParseReportOptions {
  /** override capturedAt (ISO); defaults to now. */
  capturedAt?: string;
  /** explicit observation time (ISO) when the caller can resolve it. */
  observedAt?: string;
}

/**
 * Parse one OGLight message-report envelope (capture-api-and-storage §2) into an
 * immutable {@link ReportEvent}. Reports bypass the fold entirely; `facts` is empty in
 * v1 (own-planet combat crossover is deferred until we have real samples, §6).
 *
 * The returned event always includes `raw`; the store applies the retention policy.
 */
export function parseReport(raw: string, options: ParseReportOptions = {}): ReportEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Report payload is not valid JSON: ${(err as Error).message}`);
  }
  const obj = asDict(parsed);
  const report = asDict(obj?.report);
  if (!obj || !report) {
    throw new Error("Report payload missing `report` object");
  }
  const kind = asString(report.kind);
  if (kind !== "espionage" && kind !== "combat" && kind !== "probe") {
    throw new Error(`Report payload has unknown kind: ${JSON.stringify(report.kind)}`);
  }

  const { universeId, playerId } = deriveHeaderIdentity(obj);
  const rawHash = contentHash(raw);
  const sourceMessageId = toIdString(report.id);
  const apiKey = asString(report.api);

  // Dedup id: stable across pagination revisits when OGLight exposes a message id;
  // falls back to the api key, then the raw hash (capture-api-and-storage §4).
  const id = contentHash(
    JSON.stringify({
      universeId,
      playerId,
      kind,
      sourceMessageId: sourceMessageId ?? apiKey ?? null,
      rawHash,
    }),
  );

  const sourceVersion =
    asString(obj.version) ?? asString(asDict(obj.server)?.oglVersion) ?? "unknown";

  const facts: Fact[] = [];

  const event: ReportEvent = {
    id,
    universeId,
    accountId: buildAccountId(universeId, playerId),
    kind,
    source: "oglight-message",
    sourceVersion,
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(apiKey ? { apiKey } : {}),
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    ...(options.observedAt ? { observedAt: options.observedAt } : {}),
    raw,
    rawHash,
    schemaVersion: REPORT_SCHEMA_VERSION,
    summary: buildSummary(kind, report),
    facts,
  };

  // Validate at the boundary so malformed OGLight data never enters the store.
  return reportEventSchema.parse(event);
}

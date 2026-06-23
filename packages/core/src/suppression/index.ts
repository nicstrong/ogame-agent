import type { Projection } from "../model/entities.js";
import type { Fact } from "../model/fact.js";
import type { Json } from "../model/json.js";
import { splitPath } from "../facts/path.js";

/**
 * Redundant-save suppression (architecture §3a).
 *
 * Auto-push (Phase 5) fires far more often than state changes; most saves differ only in
 * volatile fields (timestamps) or continuously-ticking resources. {@link isMeaningfulImport}
 * decides whether an import actually changes the merged projection, so no-op saves can be
 * dropped at ingest. Gate 2 (history value-change dedup) lives in the fold engine.
 */
export interface SuppressionOptions {
  /** Relative resource deviation that counts as a real event (fraction of predicted). */
  resourceRelTolerance?: number;
  /** Absolute resource deviation floor (raw units). */
  resourceAbsTolerance?: number;
}

const DEFAULTS: Required<SuppressionOptions> = {
  // Conservative defaults; tuned against real auto-push traffic in Phase 5.
  resourceRelTolerance: 0.01,
  resourceAbsTolerance: 0,
};

function valuesEqual(a: Json | undefined, b: Json): boolean {
  if (a === undefined) return false;
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read a nested projection value by fact-path segments, or undefined. */
function getByPath(state: Projection, segments: string[]): Json | undefined {
  let node: unknown = state;
  for (const key of segments) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node as Json | undefined;
}

function isLastRefreshPath(seg: string[]): boolean {
  return seg.length === 3 && seg[0] === "celestial" && seg[2] === "lastRefresh";
}

/** `account/rank` churns constantly; fold it when something real changed, never alone. */
function isRankPath(seg: string[]): boolean {
  return seg.length === 2 && seg[0] === "account" && seg[1] === "rank";
}

/** Volatile paths: carried along with a meaningful import, but never admit one by themselves. */
function isVolatilePath(seg: string[]): boolean {
  return isLastRefreshPath(seg) || isRankPath(seg);
}

function isResourceAmountPath(seg: string[]): boolean {
  return (
    seg.length === 5 && seg[0] === "celestial" && seg[2] === "resources" && seg[4] === "amount"
  );
}

/** Continuous-resource policy: admit only on rate change or deviation beyond tolerance. */
function resourceAmountMeaningful(
  state: Projection,
  seg: string[],
  incomingAmountValue: Json,
  incoming: Map<string, Json>,
  opts: Required<SuppressionOptions>,
): boolean {
  const id = seg[1]!;
  const res = seg[3]!;
  const resources = state.celestial?.[id]?.resources as
    | Record<string, { amount?: number; production?: number }>
    | undefined;
  const cur = resources?.[res];
  const curAmount = cur?.amount;
  if (curAmount === undefined) return true; // first observation is information

  const curProd = cur?.production ?? 0;
  const incomingProd =
    asNumber(incoming.get(`celestial/${id}/resources/${res}/production`)) ?? curProd;
  if (incomingProd !== curProd) return true; // production rate changed (mine/plant/item)

  const incomingAmount = asNumber(incomingAmountValue);
  if (incomingAmount === undefined) return true;

  const curObserved = asNumber(state.celestial?.[id]?.lastRefresh);
  const incomingObserved = asNumber(incoming.get(`celestial/${id}/lastRefresh`));
  let predicted = curAmount;
  if (curObserved !== undefined && incomingObserved !== undefined) {
    const dtSeconds = (incomingObserved - curObserved) / 1000;
    predicted = curAmount + curProd * dtSeconds;
  }

  const deviation = Math.abs(incomingAmount - predicted);
  const tolerance = Math.max(
    opts.resourceAbsTolerance,
    opts.resourceRelTolerance * Math.max(Math.abs(predicted), 1),
  );
  return deviation > tolerance;
}

/**
 * Return the subset of `facts` worth recording against `state`:
 *  - any tombstone,
 *  - a structural fact (building/research/coords/…/production/storage) whose value differs,
 *  - a resource amount that changed rate or deviated from the predicted tick beyond threshold.
 * Volatile facts (`lastRefresh`, `account/rank`) are carried along only when at least one
 * non-volatile fact survived — so a tick-only / rank-drift-only save filters down to nothing.
 *
 * Used at two boundaries: Gate 1 (ingest decides whether to admit) and the stored fact list
 * (so an admitted save doesn't fold redundant per-celestial resource ticks into history).
 */
export function filterMeaningfulFacts(
  state: Projection,
  facts: Fact[],
  options: SuppressionOptions = {},
): Fact[] {
  const opts = { ...DEFAULTS, ...options };

  const incoming = new Map<string, Json>();
  for (const f of facts) {
    if (f.kind === "set") incoming.set(f.path, f.value);
  }

  const kept: Fact[] = [];
  const volatile: Fact[] = [];
  for (const f of facts) {
    if (f.kind === "tombstone") {
      kept.push(f);
      continue;
    }
    const seg = splitPath(f.path);
    if (isVolatilePath(seg)) {
      volatile.push(f);
      continue;
    }
    if (isResourceAmountPath(seg)) {
      if (resourceAmountMeaningful(state, seg, f.value, incoming, opts)) kept.push(f);
      continue;
    }
    if (!valuesEqual(getByPath(state, seg), f.value)) kept.push(f); // structural change
  }
  if (kept.length > 0) kept.push(...volatile);
  return kept;
}

/**
 * True if applying `facts` to `state` would change anything worth recording.
 * Thin wrapper over {@link filterMeaningfulFacts}; `lastRefresh`/rank-only or unchanged
 * saves yield no meaningful facts and are suppressed.
 */
export function isMeaningfulImport(
  state: Projection,
  facts: Fact[],
  options: SuppressionOptions = {},
): boolean {
  return filterMeaningfulFacts(state, facts, options).length > 0;
}

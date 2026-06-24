import type { Celestial, Projection } from "../model/entities.js";

/**
 * MSU (Metal Standard Units) valuation.
 *
 * The ratio is the *trade value* ratio `metal:crystal:deuterium` (e.g. `3:2:1` means
 * 3 metal = 2 crystal = 1 deut). A resource's weight in metal-equivalent is therefore
 * `ratio.metal / ratio.<resource>`, so at `3:2:1`:
 *   metal ×1, crystal ×1.5, deut ×3.
 * Ratios are a display/analytics concern, not capture — the value functions are pure and
 * isomorphic so the web can compute totals client-side from the projection.
 */
export type MsuRatio = { metal: number; crystal: number; deuterium: number };

/** Default trade ratio; reproduces the agreed dashboard totals. */
export const DEFAULT_MSU_RATIO: MsuRatio = { metal: 3, crystal: 2, deuterium: 1 };

/**
 * `value` → stored amounts; `perHour` → production rates; `perDay` → production × 24.
 * The empire card toggles MSU → MSU/h → MSU/day over the same weighting.
 */
export type MsuMode = "value" | "perHour" | "perDay";

export type MsuTotals = { total: number; metal: number; crystal: number; deuterium: number };

/** Metal-equivalent weight of each resource for a given trade ratio. */
export function msuWeights(ratio: MsuRatio): MsuRatio {
  return {
    metal: ratio.metal / ratio.metal,
    crystal: ratio.metal / ratio.crystal,
    deuterium: ratio.metal / ratio.deuterium,
  };
}

/** Pick the raw (un-weighted) per-resource quantities a mode reads from one celestial. */
function rawAmounts(c: Celestial, mode: MsuMode): MsuTotals {
  const res = c.resources;
  const pick = (r: { amount?: number; production?: number } | undefined): number => {
    if (!r) return 0;
    if (mode === "value") return r.amount ?? 0;
    const prod = r.production ?? 0;
    return mode === "perDay" ? prod * 24 : prod;
  };
  return {
    metal: pick(res?.metal),
    crystal: pick(res?.crystal),
    deuterium: pick(res?.deuterium),
    total: 0,
  };
}

/** Weighted MSU contribution of a single celestial, broken down by resource. */
export function celestialMsu(
  c: Celestial,
  ratio: MsuRatio = DEFAULT_MSU_RATIO,
  mode: MsuMode = "value",
): MsuTotals {
  const w = msuWeights(ratio);
  const raw = rawAmounts(c, mode);
  const metal = raw.metal * w.metal;
  const crystal = raw.crystal * w.crystal;
  const deuterium = raw.deuterium * w.deuterium;
  return { metal, crystal, deuterium, total: metal + crystal + deuterium };
}

/** Empire-wide MSU totals, summed across every celestial in the projection. */
export function empireMsu(
  projection: Projection,
  ratio: MsuRatio = DEFAULT_MSU_RATIO,
  mode: MsuMode = "value",
): MsuTotals {
  const acc: MsuTotals = { total: 0, metal: 0, crystal: 0, deuterium: 0 };
  for (const c of Object.values(projection.celestial ?? {})) {
    const m = celestialMsu(c, ratio, mode);
    acc.metal += m.metal;
    acc.crystal += m.crystal;
    acc.deuterium += m.deuterium;
    acc.total += m.total;
  }
  return acc;
}

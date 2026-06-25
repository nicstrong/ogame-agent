/**
 * Boundary coercion helpers. OGLight payloads (and other raw imports) are stringly
 * typed and full of stray DOM/circular values, so adapters defensively coerce every
 * field they read. These were duplicated across adapters/identity/suppression; this is
 * the single canonical set.
 *
 * Convention: `asX` accepts a value only if it is *already* that type; `toX` also
 * coerces from a compatible representation (e.g. a numeric string). All return
 * `undefined` on miss so callers preserve "absence = unknown, never zero".
 */

/** A plain JSON-ish object. */
export type Dict = Record<string, unknown>;

/** Accept a plain object (not null, not an array); reject everything else. */
export function asDict(value: unknown): Dict | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : undefined;
}

/** Accept a string as-is. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Accept a finite number as-is (no string parsing). */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Like {@link asNumber} but also parses numeric strings (e.g. header `rank: "432"`). */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** OGLight emits 0/1, `"0"`/`"1"`, `"true"`/`"false"`, and booleans interchangeably. */
export function toBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

/** Coerce a string|number id to a string; ignore anything else (e.g. stray objects). */
export function toIdString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

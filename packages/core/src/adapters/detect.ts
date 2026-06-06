import type { ImportSource } from "../model/import.js";
import { oglightAdapter } from "./oglight.js";
import { infocompleteAdapter } from "./infocomplete.js";

/** Adapters in detection priority order. */
export const adapters = [oglightAdapter, infocompleteAdapter] as const;

/**
 * Sniff the source format from a raw payload string (clipboard auto-route).
 * Returns the matching {@link ImportSource} or `undefined` if nothing matches.
 */
export function detect(raw: string): ImportSource | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  for (const adapter of adapters) {
    if (adapter.matches(parsed)) return adapter.source;
  }
  return undefined;
}

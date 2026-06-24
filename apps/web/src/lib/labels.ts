import type { ServerCatalogEntry } from "@ogame-agent/core";
import { camelToLabel } from "./format";

/** Resolve a canonical key (e.g. `metalMine`, `lf11101`) to a display label. */
export interface Labeler {
  (key: string): string;
  /** True when the universe catalog has a real localized name for this key. */
  has(key: string): boolean;
}

/**
 * Build a key→localized-name resolver from a universe catalog. Falls back to
 * {@link camelToLabel} for keys the server catalog doesn't cover, so the UI always
 * renders something readable even before the catalog loads. `has()` distinguishes a
 * real catalog entry from the fallback — used to hide non-existent lifeform-id slots.
 */
export function makeLabeler(entries: ServerCatalogEntry[] | undefined): Labeler {
  const byKey = new Map<string, string>();
  for (const entry of entries ?? []) {
    if (entry.key) byKey.set(entry.key, entry.name);
  }
  const labeler = ((key: string) => byKey.get(key) ?? camelToLabel(key)) as Labeler;
  labeler.has = (key: string) => byKey.has(key);
  return labeler;
}

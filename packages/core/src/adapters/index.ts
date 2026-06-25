import type { Import, ImportSource } from "../model/import.js";
import { adapters, detect } from "./detect.js";
import { oglightAdapter } from "./oglight.js";
import { infocompleteAdapter } from "./infocomplete.js";
import type { Adapter, ParseOptions } from "./types.js";

export * from "./types.js";
export * from "./detect.js";
export { oglightAdapter } from "./oglight.js";
export { infocompleteAdapter } from "./infocomplete.js";
export { parseReport, type ParseReportOptions } from "./oglight-report.js";
export { contentHash } from "./hash.js";

// `manual` imports (e.g. tombstones from the viewer) are built directly, not parsed.
const registry: Partial<Record<ImportSource, Adapter>> = {
  oglight: oglightAdapter,
  infocomplete: infocompleteAdapter,
};

export function adapterFor(source: ImportSource): Adapter {
  const adapter = registry[source];
  if (!adapter) throw new Error(`No adapter for source: ${source}`);
  return adapter;
}

/**
 * Parse a raw payload into an {@link Import}. If `hint` is omitted the source is
 * auto-detected. Throws if the source can't be determined.
 */
export function parse(raw: string, hint?: ImportSource, options?: ParseOptions): Import {
  const source = hint ?? detect(raw);
  if (!source) {
    throw new Error("Could not detect import source from payload");
  }
  return adapterFor(source).parse(raw, options);
}

/** All registered adapters, in detection order. */
export { adapters };

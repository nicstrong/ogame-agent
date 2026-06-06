import type { Import, ImportSource, Transport } from "../model/import.js";

export interface ParseOptions {
  /** transport that delivered the payload; defaults to 'paste'. */
  transport?: Transport;
  /** override importedAt (ISO); defaults to now. */
  importedAt?: string;
  /** explicit universe id, used when a payload can't carry one (e.g. bare-db export). */
  universeId?: string;
  /** explicit player id, used when a payload can't carry one (e.g. bare-db export). */
  playerId?: string;
}

export interface Adapter {
  source: ImportSource;
  /** Cheap structural check: could this raw payload belong to this source? */
  matches(parsed: unknown): boolean;
  /** Turn a raw payload string into an immutable Import. */
  parse(raw: string, options?: ParseOptions): Import;
}

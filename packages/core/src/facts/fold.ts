import type { Json, JsonObject } from "../model/json.js";
import type { Fact, FactPath } from "../model/fact.js";
import type { Import } from "../model/import.js";
import { SEP, splitPath } from "./path.js";

/** A single observation of a path, in time order. Tombstones appear as deletion events. */
export interface HistoryEntry {
  importedAt: string;
  importId: string;
  kind: "set" | "tombstone";
  value?: Json;
}

export interface FoldResult {
  /** Merged current state, hydrated into a nested projection tree. */
  state: JsonObject;
  /** Per-path observation history, each list ordered oldest → newest. */
  history: Map<FactPath, HistoryEntry[]>;
}

interface FlatFact {
  fact: Fact;
  importedAt: string;
  importId: string;
  importIndex: number;
  factIndex: number;
}

/** Order: importedAt asc, then import order, then fact order within the import. */
function compareFlat(a: FlatFact, b: FlatFact): number {
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt ? -1 : 1;
  if (a.importIndex !== b.importIndex) return a.importIndex - b.importIndex;
  return a.factIndex - b.factIndex;
}

function isPrefixPath(prefix: FactPath, path: FactPath): boolean {
  return path === prefix || path.startsWith(prefix + SEP);
}

/**
 * Fold imports into a merged projection + per-path history.
 *
 * Rules (architecture §3):
 *  - `set` assigns a value at a path (last-write-wins by importedAt).
 *  - `tombstone` removes the subtree rooted at a path.
 *  - Absence = unknown: only observed paths exist in `state`.
 *  - History keeps every observation (including tombstones) for the viewer/analytics.
 */
export function foldImports(imports: Import[]): FoldResult {
  const flat: FlatFact[] = [];
  imports.forEach((imp, importIndex) => {
    imp.facts.forEach((fact, factIndex) => {
      flat.push({ fact, importedAt: imp.importedAt, importId: imp.id, importIndex, factIndex });
    });
  });
  flat.sort(compareFlat);

  const current = new Map<FactPath, Json>();
  const history = new Map<FactPath, HistoryEntry[]>();

  const record = (path: FactPath, entry: HistoryEntry) => {
    const list = history.get(path);
    if (list) list.push(entry);
    else history.set(path, [entry]);
  };

  for (const { fact, importedAt, importId } of flat) {
    if (fact.kind === "set") {
      current.set(fact.path, fact.value);
      record(fact.path, { importedAt, importId, kind: "set", value: fact.value });
    } else {
      // tombstone: drop the whole subtree from current state
      // (deleting from a Map during key iteration is safe per spec)
      for (const existing of current.keys()) {
        if (isPrefixPath(fact.path, existing)) current.delete(existing);
      }
      record(fact.path, { importedAt, importId, kind: "tombstone" });
    }
  }

  return { state: hydrate(current), history };
}

/** Hydrate flat `path -> value` pairs into a nested object tree. */
export function hydrate(flat: Map<FactPath, Json>): JsonObject {
  const root: JsonObject = {};
  for (const [path, value] of flat) {
    const segments = splitPath(path);
    let node: JsonObject = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i]!;
      const next = node[key];
      if (next === undefined || next === null || typeof next !== "object" || Array.isArray(next)) {
        const created: JsonObject = {};
        node[key] = created;
        node = created;
      } else {
        node = next as JsonObject;
      }
    }
    node[segments[segments.length - 1]!] = value;
  }
  return root;
}

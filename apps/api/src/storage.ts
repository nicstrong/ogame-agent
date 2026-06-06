import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  foldImports,
  type HistoryEntry,
  type Import,
  importSchema,
  type Projection,
  projectionSchema,
} from "@ogame-agent/core";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

export interface AccountRef {
  universeId: string;
  playerId: string;
}

/**
 * Resolve the storage root: `$OGAME_DATA_DIR` (absolute), else `apps/api/data`.
 * Anchored to this module's location (not `process.cwd()`) so the store is the same
 * place whether the server is launched from the repo root or from `apps/api`.
 */
export function defaultDataDir(): string {
  if (process.env.OGAME_DATA_DIR) return process.env.OGAME_DATA_DIR;
  // this file lives at apps/api/{src,dist}/storage.* -> package root is one dir up.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
}

/** Keep path segments filesystem-safe (ids like `s1-en` / `100000` pass through unchanged). */
const UNSAFE = /[^A-Za-z0-9_.-]/g;
function safe(segment: string): string {
  return segment.replace(UNSAFE, "_");
}

/**
 * Capture-first storage (architecture §7). The append-only NDJSON log is the source of
 * truth; the lowdb `latest.json` projection is a materialized cache, rebuildable by
 * re-folding the log. Partitioned per universe/account.
 */
export class ImportStore {
  constructor(private readonly dataDir: string = defaultDataDir()) {}

  private partitionDir(ref: AccountRef): string {
    return join(this.dataDir, safe(ref.universeId), safe(ref.playerId));
  }

  private importsFile(ref: AccountRef): string {
    return join(this.partitionDir(ref), "imports.ndjson");
  }

  private projectionFile(ref: AccountRef): string {
    return join(this.partitionDir(ref), "latest.json");
  }

  /** Read & validate every Import in a partition's append-only log (oldest → newest). */
  async listImports(ref: AccountRef): Promise<Import[]> {
    let text: string;
    try {
      text = await readFile(this.importsFile(ref), "utf8");
    } catch {
      return [];
    }
    const out: Import[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      out.push(importSchema.parse(JSON.parse(trimmed)));
    }
    return out;
  }

  /**
   * Append an Import to the log unless its content-hash id is already present.
   * Raw logging is never suppressed beyond exact-duplicate dedup (§3a is Phase 4).
   */
  async appendImport(imp: Import): Promise<{ deduped: boolean }> {
    const existing = await this.listImports(imp.accountId);
    if (existing.some((e) => e.id === imp.id)) return { deduped: true };
    await mkdir(this.partitionDir(imp.accountId), { recursive: true });
    await appendFile(this.importsFile(imp.accountId), `${JSON.stringify(imp)}\n`, "utf8");
    return { deduped: false };
  }

  /** Fold the whole log and materialize the projection into latest.json. */
  async rebuildProjection(ref: AccountRef): Promise<Projection> {
    const { state } = foldImports(await this.listImports(ref));
    const projection = projectionSchema.parse(state);
    await this.writeProjection(ref, projection);
    return projection;
  }

  private async writeProjection(ref: AccountRef, projection: Projection): Promise<void> {
    await mkdir(this.partitionDir(ref), { recursive: true });
    const db = new Low<Projection>(new JSONFile<Projection>(this.projectionFile(ref)), {});
    db.data = projection;
    await db.write();
  }

  /** Return the materialized projection, rebuilding from the log if the cache is missing. */
  async getProjection(ref: AccountRef): Promise<Projection> {
    try {
      const text = await readFile(this.projectionFile(ref), "utf8");
      return projectionSchema.parse(JSON.parse(text));
    } catch {
      return this.rebuildProjection(ref);
    }
  }

  /** Per-path observation history, derived by re-folding the log. */
  async getHistory(ref: AccountRef): Promise<Record<string, HistoryEntry[]>> {
    const { history } = foldImports(await this.listImports(ref));
    return Object.fromEntries(history);
  }

  /** Append, then refresh the materialized projection (no-op refresh on dedup). */
  async ingest(imp: Import): Promise<{ deduped: boolean; projection: Projection }> {
    const { deduped } = await this.appendImport(imp);
    const projection = deduped
      ? await this.getProjection(imp.accountId)
      : await this.rebuildProjection(imp.accountId);
    return { deduped, projection };
  }

  /** Discover every universe/account partition on disk. */
  async listAccounts(): Promise<AccountRef[]> {
    const out: AccountRef[] = [];
    let universes: string[];
    try {
      universes = await readdir(this.dataDir);
    } catch {
      return out;
    }
    for (const universeId of universes) {
      let players: { name: string; isDirectory: () => boolean }[];
      try {
        players = await readdir(join(this.dataDir, universeId), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const player of players) {
        if (player.isDirectory()) out.push({ universeId, playerId: player.name });
      }
    }
    return out;
  }
}

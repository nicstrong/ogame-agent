import { asDict, toIdString } from "../coerce/index.js";
import type {
  AccountId,
  CelestialId,
  CelestialType,
  Coordinates,
  UniverseId,
} from "../model/ids.js";

/** Build the canonical universe id from an OGLight `server` header. */
export function buildUniverseId(server: { id: number | string; lang: string }): UniverseId {
  return `s${server.id}-${server.lang}`;
}

export function buildAccountId(universeId: UniverseId, playerId: string | number): AccountId {
  return { universeId, playerId: String(playerId) };
}

export function buildCelestialId(
  accountId: AccountId,
  ogameId: string | number,
  type: CelestialType,
): CelestialId {
  return { accountId, ogameId: String(ogameId), type };
}

/**
 * Derive `{ universeId, playerId }` from an OGLight capture header: prefer `DBName`,
 * fall back to `server + account`. Shared by the empire-import and report adapters
 * (both carry the same envelope header). Does NOT handle bare-`db` payloads — those
 * need roster inspection and stay in the OGLight adapter.
 */
export function deriveHeaderIdentity(header: {
  DBName?: unknown;
  server?: unknown;
  account?: unknown;
}): { universeId: UniverseId; playerId: string } {
  const dbName = typeof header.DBName === "string" ? header.DBName : undefined;
  const server = asDict(header.server);
  const account = asDict(header.account);

  let universeId: UniverseId | undefined;
  let playerId: string | undefined;

  if (dbName) {
    try {
      const parsed = parseDBName(dbName);
      universeId = parsed.universeId;
      playerId = parsed.playerId;
    } catch {
      // fall through to header-derived identity
    }
  }
  if (!universeId && server && server.id != null && typeof server.lang === "string") {
    universeId = buildUniverseId({ id: server.id as string | number, lang: server.lang });
  }
  if (!playerId) playerId = toIdString(account?.id);

  if (!universeId || !playerId) {
    throw new Error("payload missing identity (need DBName or server+account)");
  }
  return { universeId, playerId };
}

/**
 * Parse an OGLight `DBName` such as `"100000-s1-en"` into `{ playerId, universeId }`.
 * Format: `{playerId}-{universeId}` where universeId is the host prefix (e.g. `s1-en`).
 */
export function parseDBName(dbName: string): { playerId: string; universeId: UniverseId } {
  const dash = dbName.indexOf("-");
  if (dash <= 0 || dash >= dbName.length - 1) {
    throw new Error(`Unparseable DBName: ${JSON.stringify(dbName)}`);
  }
  return { playerId: dbName.slice(0, dash), universeId: dbName.slice(dash + 1) };
}

/**
 * Parse an OGame coordinate string `"g:s:p"` into structured coordinates.
 * The string carries no planet/moon distinction, so `type` must be supplied.
 */
export function parseCoords(coords: string, type: CelestialType): Coordinates {
  const parts = coords.split(":");
  if (parts.length !== 3) {
    throw new Error(`Unparseable coordinates: ${JSON.stringify(coords)}`);
  }
  const [galaxy, system, position] = parts.map((p) => {
    const n = Number.parseInt(p, 10);
    if (!Number.isFinite(n))
      throw new Error(`Non-numeric coordinate part in ${JSON.stringify(coords)}`);
    return n;
  });
  return { galaxy: galaxy!, system: system!, position: position!, type };
}

/** Format structured coordinates back to `"g:s:p"`. */
export function formatCoords(coords: Coordinates): string {
  return `${coords.galaxy}:${coords.system}:${coords.position}`;
}

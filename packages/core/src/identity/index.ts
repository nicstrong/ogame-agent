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

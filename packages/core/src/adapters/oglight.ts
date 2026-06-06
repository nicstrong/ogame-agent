import type { Fact, Json } from "../model/index.js";
import { SCHEMA_VERSION, setFact } from "../model/index.js";
import type { Import } from "../model/import.js";
import { buildAccountId, buildUniverseId, parseCoords, parseDBName } from "../identity/index.js";
import { catalogEntryForOgameId, isLifeformOgameId } from "../catalog/index.js";
import { paths } from "../facts/path.js";
import { contentHash } from "./hash.js";
import type { Adapter, ParseOptions } from "./types.js";

/** OGLight resource keys → canonical resource name + companion storage/prod keys. */
const RESOURCES: { oglight: string; canon: string; storage?: string; prod?: string }[] = [
  { oglight: "metal", canon: "metal", storage: "metalStorage", prod: "prodmetal" },
  { oglight: "crystal", canon: "crystal", storage: "crystalStorage", prod: "prodcrystal" },
  { oglight: "deut", canon: "deuterium", storage: "deutStorage", prod: "proddeut" },
  { oglight: "energy", canon: "energy" },
  { oglight: "food", canon: "food", storage: "foodStorage" },
  { oglight: "population", canon: "population" },
];

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Coerce a string|number id to a string; ignore anything else (e.g. stray objects). */
function toIdString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Structural check used by `detect` and the registry. Accepts both shapes:
 *  - the capture envelope `{ DBName, server, account, db }`, and
 *  - the bare `db` from OGLight's Export button (`JSON.stringify(db)`), where
 *    `myPlanets` sits at the top level.
 */
function matches(parsed: unknown): boolean {
  const obj = asDict(parsed);
  if (!obj) return false;
  const envelopeDb = asDict(obj.db);
  return (
    Boolean(envelopeDb && asDict(envelopeDb.myPlanets)) ||
    typeof obj.DBName === "string" ||
    Boolean(asDict(obj.myPlanets))
  );
}

/**
 * Recover identity from a bare `db` (no envelope header). Universe comes from
 * `serverData.serverFullID` (e.g. `"1en"` → `s1-en`); the own player id is
 * the `uid` of the `pdb` self-entry whose `pid` is one of our own celestials.
 * Either can be overridden via {@link ParseOptions}.
 */
function deriveBareDbIdentity(
  db: Dict,
  options: ParseOptions,
): { universeId: string; playerId: string } {
  let universeId = options.universeId;
  if (!universeId) {
    const fullId = asString(asDict(db.serverData)?.serverFullID);
    const match = fullId ? /^(\d+)\s*([a-z]+)$/i.exec(fullId) : null;
    if (match) universeId = `s${match[1]}-${match[2]!.toLowerCase()}`;
  }

  let playerId = options.playerId;
  if (!playerId) {
    const ownCelestials = new Set(Object.keys(asDict(db.myPlanets) ?? {}));
    const pdb = asDict(db.pdb);
    if (pdb) {
      for (const rawEntry of Object.values(pdb)) {
        const entry = asDict(rawEntry);
        const pid = toIdString(entry?.pid);
        if (entry && pid && ownCelestials.has(pid)) {
          playerId = toIdString(entry.uid);
          if (playerId) break;
        }
      }
    }
  }

  if (!universeId || !playerId) {
    throw new Error(
      "bare-db OGLight payload: could not derive identity " +
        "(need serverData.serverFullID and a pdb self-entry, or pass universeId/playerId)",
    );
  }
  return { universeId, playerId };
}

function deriveIdentity(obj: Dict): { universeId: string; playerId: string } {
  const dbName = asString(obj.DBName);
  const server = asDict(obj.server);
  const account = asDict(obj.account);

  let universeId: string | undefined;
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
    throw new Error("OGLight payload missing identity (need DBName or server+account)");
  }
  return { universeId, playerId };
}

function emitCelestial(
  id: string,
  entry: Dict,
  accountResearch: Map<string, number>,
  facts: Fact[],
) {
  const type = asString(entry.type);
  if (type === "planet" || type === "moon") facts.push(setFact(paths.celestial.type(id), type));

  const coords = asString(entry.coords);
  if (coords && (type === "planet" || type === "moon")) {
    facts.push(
      setFact(paths.celestial.coordinates(id), parseCoords(coords, type) as unknown as Json),
    );
  }

  const name = asString(entry.name);
  if (name) facts.push(setFact(paths.celestial.name(id), name));

  if (entry.temperature !== undefined && entry.temperature !== null) {
    facts.push(setFact(paths.celestial.temperature(id), entry.temperature as Json));
  }

  const fieldUsed = asNumber(entry.fieldUsed);
  if (fieldUsed !== undefined) facts.push(setFact(paths.celestial.fields(id, "used"), fieldUsed));
  const fieldMax = asNumber(entry.fieldMax);
  if (fieldMax !== undefined) facts.push(setFact(paths.celestial.fields(id, "max"), fieldMax));

  const lifeform = entry.lifeform;
  if (typeof lifeform === "number" || typeof lifeform === "string") {
    facts.push(setFact(paths.celestial.lifeform(id), lifeform));
  }

  const moonId = toIdString(entry.moonID);
  if (moonId !== undefined && moonId !== "-1") {
    facts.push(setFact(paths.celestial.moonId(id), moonId));
  }

  const lastRefresh = asNumber(entry.lastRefresh);
  if (lastRefresh !== undefined) facts.push(setFact(paths.celestial.lastRefresh(id), lastRefresh));

  // resources
  for (const r of RESOURCES) {
    const amount = asNumber(entry[r.oglight]);
    if (amount !== undefined)
      facts.push(setFact(paths.celestial.resource(id, r.canon, "amount"), amount));
    if (r.storage) {
      const storage = asNumber(entry[r.storage]);
      if (storage !== undefined)
        facts.push(setFact(paths.celestial.resource(id, r.canon, "storage"), storage));
    }
    if (r.prod) {
      const prod = asNumber(entry[r.prod]);
      if (prod !== undefined)
        facts.push(setFact(paths.celestial.resource(id, r.canon, "production"), prod));
    }
  }

  // numeric-id blocks: buildings / ships / defense (per-celestial) and research (account-wide)
  for (const [rawKey, value] of Object.entries(entry)) {
    const numId = Number(rawKey);
    if (!Number.isInteger(numId)) continue;
    if (isLifeformOgameId(numId)) continue; // lifeform depth deferred (v1)
    const level = asNumber(value);
    if (level === undefined) continue;
    const cat = catalogEntryForOgameId(numId);
    if (!cat) continue;
    switch (cat.category) {
      case "building":
        facts.push(setFact(paths.celestial.building(id, cat.key), level));
        break;
      case "ship":
        facts.push(setFact(paths.celestial.ship(id, cat.key), level));
        break;
      case "defense":
        facts.push(setFact(paths.celestial.defense(id, cat.key), level));
        break;
      case "research":
        // account-scoped: collect, emit once after all celestials (architecture §2a)
        accountResearch.set(cat.key, level);
        break;
    }
  }
}

function parse(raw: string, options: ParseOptions = {}): Import {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`OGLight payload is not valid JSON: ${(err as Error).message}`);
  }
  const obj = asDict(parsed);
  if (!obj || !matches(obj)) {
    throw new Error("Payload does not look like an OGLight export");
  }

  // Envelope `{ ..., db }` vs bare `db` (Export button) — myPlanets at top level.
  const isEnvelope = Boolean(asDict(obj.db));
  const db = isEnvelope ? (asDict(obj.db) ?? {}) : obj;
  const account = isEnvelope ? asDict(obj.account) : undefined;
  const { universeId, playerId } = isEnvelope
    ? deriveIdentity(obj)
    : deriveBareDbIdentity(db, options);
  const myPlanets = asDict(db.myPlanets) ?? {};

  const facts: Fact[] = [];
  const accountResearch = new Map<string, number>();

  // account header facts
  facts.push(setFact(paths.account.playerId(), playerId));
  const accName = asString(account?.name);
  if (accName) facts.push(setFact(paths.account.name(), accName));
  const accClass = account?.class;
  if (typeof accClass === "number" || typeof accClass === "string") {
    facts.push(setFact(paths.account.class(), accClass));
  }
  const accRank = asNumber(account?.rank);
  if (accRank !== undefined) facts.push(setFact(paths.account.rank(), accRank));

  // celestials
  for (const [id, rawEntry] of Object.entries(myPlanets)) {
    const entry = asDict(rawEntry);
    if (!entry) continue;
    emitCelestial(id, entry, accountResearch, facts);
  }

  // optional planet-name overlay: OGLight never stores names, so the capture
  // snippet scrapes them from the DOM into `planetNames` (celestialId -> name).
  // Emitted after celestials so it wins over any stray entry.name.
  const planetNames = asDict(obj.planetNames);
  if (planetNames) {
    const knownIds = new Set(Object.keys(myPlanets));
    for (const [id, value] of Object.entries(planetNames)) {
      const name = asString(value);
      if (name && knownIds.has(id)) facts.push(setFact(paths.celestial.name(id), name));
    }
  }

  // account-wide research, emitted once
  for (const [key, level] of accountResearch) {
    facts.push(setFact(paths.account.research(key), level));
  }

  const sourceVersion =
    asString(db.version) ??
    asString(obj.version) ??
    asString(asDict(db.serverData)?.oglVersion) ??
    "unknown";

  return {
    id: contentHash(raw),
    universeId,
    accountId: buildAccountId(universeId, playerId),
    source: "oglight",
    sourceVersion,
    transport: options.transport ?? "paste",
    reliability: "owned",
    importedAt: options.importedAt ?? new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    raw,
    facts,
  };
}

export const oglightAdapter: Adapter = { source: "oglight", matches, parse };

import type { Fact, Json } from "../model/index.js";
import { SCHEMA_VERSION, setFact } from "../model/index.js";
import type { Import } from "../model/import.js";
import { asDict, asNumber, asString, toIdString, toNumber, type Dict } from "../coerce/index.js";
import { buildAccountId, deriveHeaderIdentity, parseCoords } from "../identity/index.js";
import { catalogEntryForOgameId } from "../catalog/index.js";
import { paths } from "../facts/path.js";
import { contentHash } from "./hash.js";
import type { Adapter, ParseOptions } from "./types.js";

/**
 * OGLight resource keys → canonical resource name + companion storage/prod keys.
 * `prod` is an ordered list of candidate source keys: real `myPlanets` entries carry
 * both `prodMetal` (base rate, written at oglight.js:12239) and `prodmetal` (rate incl.
 * lifeform bonus); moons carry only the camelCase form. Read the first one that exists.
 */
const RESOURCES: { oglight: string; canon: string; storage?: string; prod?: string[] }[] = [
  { oglight: "metal", canon: "metal", storage: "metalStorage", prod: ["prodMetal", "prodmetal"] },
  {
    oglight: "crystal",
    canon: "crystal",
    storage: "crystalStorage",
    prod: ["prodCrystal", "prodcrystal"],
  },
  { oglight: "deut", canon: "deuterium", storage: "deutStorage", prod: ["prodDeut", "proddeut"] },
  { oglight: "energy", canon: "energy" },
  { oglight: "food", canon: "food", storage: "foodStorage" },
  { oglight: "population", canon: "population" },
];

/**
 * Structural check used by `detect` and the registry. Accepts both shapes:
 *  - the capture envelope `{ DBName, server, account, db }`, and
 *  - the bare `db` from OGLight's Export button (`JSON.stringify(db)`), where
 *    `myPlanets` sits at the top level.
 */
function matches(parsed: unknown): boolean {
  const obj = asDict(parsed);
  if (!obj) return false;
  // Require myPlanets (envelope `db.myPlanets` or bare top-level) so a stray object
  // carrying only a `DBName` key can't be coerced into an empty OGLight import.
  const envelopeDb = asDict(obj.db);
  return Boolean(envelopeDb && asDict(envelopeDb.myPlanets)) || Boolean(asDict(obj.myPlanets));
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

  // A planet with no moon has moonID `0` (live data) or `-1`; only emit a real id.
  const moonId = toIdString(entry.moonID);
  if (moonId !== undefined && moonId !== "-1" && moonId !== "0") {
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
      let prod: number | undefined;
      for (const key of r.prod) {
        prod = asNumber(entry[key]);
        if (prod !== undefined) break;
      }
      if (prod !== undefined)
        facts.push(setFact(paths.celestial.resource(id, r.canon, "production"), prod));
    }
  }

  // numeric-id blocks: buildings / ships / defense / lifeform (per-celestial) and
  // research (account-wide). Lifeform buildings & research are per-celestial because the
  // data is denormalised per planet and inactive-lifeform blocks still carry real levels.
  for (const [rawKey, value] of Object.entries(entry)) {
    const numId = Number(rawKey);
    if (!Number.isInteger(numId)) continue;
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
      case "lifeformBuilding":
        facts.push(setFact(paths.celestial.lifeformBuilding(id, cat.key), level));
        break;
      case "lifeformResearch":
        facts.push(setFact(paths.celestial.lifeformResearch(id, cat.key), level));
        break;
      case "research":
        // account-scoped: collect, emit once after all celestials (architecture §2a)
        accountResearch.set(cat.key, level);
        break;
    }
  }
}

/**
 * Emit own-account score + rankings from `db.udb[playerId].score` (OGLight's highscore cache).
 * The `globalRanking` here supersedes the volatile header `account/rank`; it is emitted after the
 * header so it wins on fold (last fact within an import wins). No-op when udb/self/score is absent.
 */
function emitScore(db: Dict, playerId: string, facts: Fact[]) {
  const self = asDict(asDict(db.udb)?.[playerId]);
  const score = asDict(self?.score);
  if (!score) return;
  const keys = [
    "global",
    "economy",
    "research",
    "military",
    "lifeform",
    "globalRanking",
    "economyRanking",
    "researchRanking",
    "militaryRanking",
    "lifeformRanking",
  ];
  for (const key of keys) {
    const v = asNumber(score[key]);
    if (v !== undefined) facts.push(setFact(paths.account.score(key), v));
  }
  const rank = asNumber(score.globalRanking);
  if (rank !== undefined) facts.push(setFact(paths.account.rank(), rank));
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
    ? deriveHeaderIdentity(obj)
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
  const accRank = toNumber(account?.rank); // live header carries rank as a string
  if (accRank !== undefined) facts.push(setFact(paths.account.rank(), accRank));

  // own-account score + rankings from udb (supersedes the volatile header rank above)
  emitScore(db, playerId, facts);

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

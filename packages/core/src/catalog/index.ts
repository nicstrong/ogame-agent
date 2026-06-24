/**
 * Canonical keys for every building / research / ship / defense, mapped from OGame's
 * numeric ids. Canonical keys are the *stable* backbone (language-independent); the
 * localised names are bootstrapped separately from `serverData` for display only.
 *
 * Id ranges (see architecture §2a):
 *   1–44      supplies + facilities (buildings)
 *   106–124, 199   research (account-wide; denormalised onto every planet by OGLight)
 *   202–220   ships
 *   401–503   defense
 *   11xxx–14xxx   lifeform buildings/research (deferred in v1)
 */

export type CatalogCategory =
  | "building"
  | "research"
  | "ship"
  | "defense"
  | "lifeformBuilding"
  | "lifeformResearch";

export interface CatalogEntry {
  id: number;
  key: string;
  category: CatalogCategory;
}

const BUILDINGS: Record<number, string> = {
  1: "metalMine",
  2: "crystalMine",
  3: "deuteriumSynthesizer",
  4: "solarPlant",
  12: "fusionReactor",
  14: "roboticsFactory",
  15: "naniteFactory",
  21: "shipyard",
  22: "metalStorage",
  23: "crystalStorage",
  24: "deuteriumTank",
  31: "researchLab",
  33: "terraformer",
  34: "allianceDepot",
  36: "spaceDock",
  41: "lunarBase",
  42: "sensorPhalanx",
  43: "jumpGate",
  44: "missileSilo",
};

const RESEARCH: Record<number, string> = {
  106: "espionageTechnology",
  108: "computerTechnology",
  109: "weaponsTechnology",
  110: "shieldingTechnology",
  111: "armourTechnology",
  113: "energyTechnology",
  114: "hyperspaceTechnology",
  115: "combustionDrive",
  117: "impulseDrive",
  118: "hyperspaceDrive",
  120: "laserTechnology",
  121: "ionTechnology",
  122: "plasmaTechnology",
  123: "intergalacticResearchNetwork",
  124: "astrophysics",
  199: "gravitonTechnology",
};

const SHIPS: Record<number, string> = {
  202: "smallCargo",
  203: "largeCargo",
  204: "lightFighter",
  205: "heavyFighter",
  206: "cruiser",
  207: "battleship",
  208: "colonyShip",
  209: "recycler",
  210: "espionageProbe",
  211: "bomber",
  212: "solarSatellite",
  213: "destroyer",
  214: "deathstar",
  215: "battlecruiser",
  217: "crawler",
  218: "reaper",
  219: "pathfinder",
};

const DEFENSE: Record<number, string> = {
  401: "rocketLauncher",
  402: "lightLaser",
  403: "heavyLaser",
  404: "gaussCannon",
  405: "ionCannon",
  406: "plasmaTurret",
  407: "smallShieldDome",
  408: "largeShieldDome",
  502: "antiBallisticMissile",
  503: "interplanetaryMissile",
};

function buildIndex(): Map<number, CatalogEntry> {
  const index = new Map<number, CatalogEntry>();
  const add = (table: Record<number, string>, category: CatalogCategory) => {
    for (const [id, key] of Object.entries(table)) {
      index.set(Number(id), { id: Number(id), key, category });
    }
  };
  add(BUILDINGS, "building");
  add(RESEARCH, "research");
  add(SHIPS, "ship");
  add(DEFENSE, "defense");
  return index;
}

const OGAME_ID_INDEX = buildIndex();
const KEY_TO_ID = new Map<string, number>(
  [...OGAME_ID_INDEX].map(([id, entry]) => [entry.key, id]),
);

/** Look up the canonical entry for an OGame numeric id, or `undefined` if unknown. */
export function catalogEntryForOgameId(id: number): CatalogEntry | undefined {
  return OGAME_ID_INDEX.get(id) ?? lifeformCatalogEntry(id);
}

/**
 * OGame numeric id for a canonical key, for stable display ordering (build/research order).
 * Lifeform keys are `lf{id}`, so the id is recovered from the suffix.
 */
export function ogameIdForKey(key: string): number | undefined {
  const known = KEY_TO_ID.get(key);
  if (known !== undefined) return known;
  if (key.startsWith("lf")) {
    const id = Number(key.slice(2));
    if (Number.isFinite(id)) return id;
  }
  return undefined;
}

/** True for lifeform building/research id blocks (11xxx–14xxx). */
export function isLifeformOgameId(id: number): boolean {
  return id >= 11000 && id < 15000;
}

/**
 * Lifeform ids are `1L1xx` (buildings) / `1L2xx` (research), with `L` ∈ 1..4 the lifeform.
 * The hundreds digit selects the block. Canonical key is `lf{id}` — language-independent;
 * the localised display name comes from the per-universe `serverData` catalog. Returns the
 * lifeform (1..4) so callers can group a planet's blocks for display.
 */
export function lifeformOfOgameId(id: number): number | undefined {
  if (!isLifeformOgameId(id)) return undefined;
  return Math.floor(id / 1000) % 10;
}

function lifeformCatalogEntry(id: number): CatalogEntry | undefined {
  if (!isLifeformOgameId(id)) return undefined;
  const block = Math.floor((id % 1000) / 100); // 1 = building, 2 = research
  const category: CatalogCategory | undefined =
    block === 1 ? "lifeformBuilding" : block === 2 ? "lifeformResearch" : undefined;
  if (!category) return undefined;
  return { id, key: `lf${id}`, category };
}

/** Account class id → display name (OGLight `account.class`). */
const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  1: "Collector",
  2: "General",
  3: "Discoverer",
};

/** Lifeform id → display name (`celestial.lifeform`). 0 = none assigned. */
const LIFEFORM_NAMES: Record<number, string> = {
  0: "None",
  1: "Humans",
  2: "Rocktal",
  3: "Mechas",
  4: "Kaelesh",
};

function nameFor(table: Record<number, string>, value: number | string | undefined) {
  const id = typeof value === "string" ? Number(value) : value;
  if (id === undefined || !Number.isFinite(id)) return undefined;
  return table[id];
}

/** Display name for an account class id (accepts the string form OGLight sometimes sends). */
export function accountClassName(value: number | string | undefined): string | undefined {
  return nameFor(ACCOUNT_CLASS_NAMES, value);
}

/** Display name for a celestial lifeform id. */
export function lifeformName(value: number | string | undefined): string | undefined {
  return nameFor(LIFEFORM_NAMES, value);
}

export interface ServerCatalogEntry {
  id: number;
  /** localised name from serverData. */
  name: string;
  /** canonical key if the id is known, else undefined. */
  key?: string;
  category?: CatalogCategory;
}

/**
 * Locate OGLight `serverData` in a parsed payload, handling both the capture envelope
 * (`{ db: { serverData } }`) and the bare `db` from the Export button (`{ serverData }`).
 * Returns `undefined` for shapes that don't carry it (e.g. manual tombstone payloads).
 */
export function serverDataFrom(parsed: unknown): Record<string, unknown> | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const obj = parsed as Record<string, unknown>;
  const db = obj.db;
  const fromDb =
    db && typeof db === "object" ? (db as Record<string, unknown>).serverData : undefined;
  const serverData = fromDb ?? obj.serverData;
  return serverData && typeof serverData === "object"
    ? (serverData as Record<string, unknown>)
    : undefined;
}

/**
 * Bootstrap a per-universe catalog (localised names) from OGLight `serverData`.
 * Pulls only the numeric-id → name entries and pairs them with canonical keys.
 */
export function buildServerCatalog(
  serverData: Record<string, unknown> | undefined,
): ServerCatalogEntry[] {
  if (!serverData) return [];
  const out: ServerCatalogEntry[] = [];
  for (const [rawId, value] of Object.entries(serverData)) {
    const id = Number(rawId);
    if (!Number.isInteger(id)) continue; // skip non-numeric server config keys
    if (typeof value !== "string") continue;
    const entry = catalogEntryForOgameId(id);
    out.push({ id, name: value, key: entry?.key, category: entry?.category });
  }
  return out;
}

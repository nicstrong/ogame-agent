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

export type CatalogCategory = "building" | "research" | "ship" | "defense";

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

/** Look up the canonical entry for an OGame numeric id, or `undefined` if unknown. */
export function catalogEntryForOgameId(id: number): CatalogEntry | undefined {
  return OGAME_ID_INDEX.get(id);
}

/** True for lifeform building/research id blocks (11xxx–14xxx), deferred in v1. */
export function isLifeformOgameId(id: number): boolean {
  return id >= 11000 && id < 15000;
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

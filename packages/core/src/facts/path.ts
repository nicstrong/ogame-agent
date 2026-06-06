import type { FactPath } from "../model/fact.js";

/** Path segment separator. Canonical keys never contain `/`. */
export const SEP = "/";

export function joinPath(...segments: (string | number)[]): FactPath {
  return segments.map(String).join(SEP);
}

export function splitPath(path: FactPath): string[] {
  return path.split(SEP);
}

/** Builders for the fact paths the OGLight adapter emits. */
export const paths = {
  account: {
    name: () => "account/name",
    class: () => "account/class",
    rank: () => "account/rank",
    playerId: () => "account/playerId",
    research: (key: string) => joinPath("account", "research", key),
  },
  celestial: {
    root: (id: string | number) => joinPath("celestial", id),
    type: (id: string | number) => joinPath("celestial", id, "type"),
    name: (id: string | number) => joinPath("celestial", id, "name"),
    coordinates: (id: string | number) => joinPath("celestial", id, "coordinates"),
    temperature: (id: string | number) => joinPath("celestial", id, "temperature"),
    lifeform: (id: string | number) => joinPath("celestial", id, "lifeform"),
    moonId: (id: string | number) => joinPath("celestial", id, "moonId"),
    lastRefresh: (id: string | number) => joinPath("celestial", id, "lastRefresh"),
    fields: (id: string | number, k: "used" | "max") => joinPath("celestial", id, "fields", k),
    resource: (id: string | number, res: string, k: "amount" | "storage" | "production") =>
      joinPath("celestial", id, "resources", res, k),
    building: (id: string | number, key: string) => joinPath("celestial", id, "buildings", key),
    ship: (id: string | number, key: string) => joinPath("celestial", id, "ships", key),
    defense: (id: string | number, key: string) => joinPath("celestial", id, "defense", key),
  },
} as const;

import { describe, expect, it } from "vite-plus/test";
import {
  buildServerCatalog,
  catalogEntryForOgameId,
  isLifeformOgameId,
} from "../src/catalog/index.js";

describe("catalog", () => {
  it("maps numeric ids to canonical keys with categories", () => {
    expect(catalogEntryForOgameId(1)).toMatchObject({ key: "metalMine", category: "building" });
    expect(catalogEntryForOgameId(113)).toMatchObject({
      key: "energyTechnology",
      category: "research",
    });
    expect(catalogEntryForOgameId(202)).toMatchObject({ key: "smallCargo", category: "ship" });
    expect(catalogEntryForOgameId(401)).toMatchObject({
      key: "rocketLauncher",
      category: "defense",
    });
  });

  it("returns undefined for unknown ids", () => {
    expect(catalogEntryForOgameId(99999)).toBeUndefined();
  });

  it("flags lifeform id blocks", () => {
    expect(isLifeformOgameId(11101)).toBe(true);
    expect(isLifeformOgameId(14000)).toBe(true);
    expect(isLifeformOgameId(124)).toBe(false);
  });

  it("bootstraps localised names from serverData and ignores config keys", () => {
    const catalog = buildServerCatalog({
      "1": "Metal Mine",
      "113": "Energy Technology",
      debrisFactor: 30,
      galaxies: 9,
    });
    const byId = new Map(catalog.map((e) => [e.id, e]));
    expect(byId.get(1)).toMatchObject({ name: "Metal Mine", key: "metalMine" });
    expect(byId.get(113)).toMatchObject({ name: "Energy Technology", key: "energyTechnology" });
    // numeric server-config values are not strings -> excluded
    expect(catalog.some((e) => e.name === "30")).toBe(false);
  });
});

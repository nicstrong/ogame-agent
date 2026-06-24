import { describe, expect, it } from "vite-plus/test";
import {
  buildServerCatalog,
  catalogEntryForOgameId,
  isLifeformOgameId,
  lifeformOfOgameId,
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

  it("classifies lifeform building/research ids with lf{id} keys", () => {
    expect(catalogEntryForOgameId(11101)).toMatchObject({
      key: "lf11101",
      category: "lifeformBuilding",
    });
    expect(catalogEntryForOgameId(11201)).toMatchObject({
      key: "lf11201",
      category: "lifeformResearch",
    });
    expect(catalogEntryForOgameId(14218)).toMatchObject({
      key: "lf14218",
      category: "lifeformResearch",
    });
    // lifeform digit identifies the owning lifeform (1..4)
    expect(lifeformOfOgameId(11101)).toBe(1);
    expect(lifeformOfOgameId(12101)).toBe(2);
    expect(lifeformOfOgameId(14218)).toBe(4);
    expect(lifeformOfOgameId(124)).toBeUndefined();
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

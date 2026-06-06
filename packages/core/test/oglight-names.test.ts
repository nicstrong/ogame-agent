import { describe, expect, it } from "vite-plus/test";
import { parse } from "../src/adapters/index.js";
import { foldImports } from "../src/facts/fold.js";
import { projectionSchema } from "../src/model/entities.js";

/** The capture snippet scrapes planet names from the DOM into `planetNames`. */
const envelope = {
  DBName: "100000-s1-en",
  server: { id: 1, lang: "en" },
  account: { id: 100000, name: "Tester", class: 3, lang: "en" },
  db: {
    myPlanets: {
      "50000001": { type: "planet", coords: "1:320:10", "1": 30 },
      "50000002": { type: "moon", coords: "1:320:10", "41": 6 },
    },
  },
  planetNames: {
    "50000001": "Alpha",
    "50000003": "Orphan", // id not in myPlanets -> ignored (no phantom celestial)
  },
};

describe("OGLight adapter — planet name overlay", () => {
  it("emits celestial names from the planetNames map", () => {
    const { state } = foldImports([parse(JSON.stringify(envelope))]);
    const projection = projectionSchema.parse(state);
    expect(projection.celestial?.["50000001"]?.name).toBe("Alpha");
  });

  it("ignores names for ids not in myPlanets (no phantom celestials)", () => {
    const { state } = foldImports([parse(JSON.stringify(envelope))]);
    const projection = projectionSchema.parse(state);
    expect(projection.celestial?.["50000003"]).toBeUndefined();
    expect(Object.keys(projection.celestial ?? {})).toHaveLength(2);
  });

  it("leaves unnamed celestials without a name", () => {
    const { state } = foldImports([parse(JSON.stringify(envelope))]);
    const projection = projectionSchema.parse(state);
    expect(projection.celestial?.["50000002"]?.name).toBeUndefined();
  });
});

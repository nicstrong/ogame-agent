import { describe, expect, it } from "vite-plus/test";
import { detect } from "../src/adapters/detect.js";
import { parse } from "../src/adapters/index.js";
import { foldImports } from "../src/facts/fold.js";
import { projectionSchema } from "../src/model/entities.js";

/** OGLight's Export button emits the bare `db` (myPlanets at top level), no envelope header. */
const bareDb = {
  dataFormat: 17,
  serverData: { serverFullID: "1en", researchSpeed: 2, galaxies: 5, systems: 499 },
  myPlanets: {
    "50000001": { type: "planet", coords: "4:5:6", metal: 5000, "1": 20, "113": 7 },
    "50000002": { type: "moon", coords: "4:5:6", "41": 4 },
  },
  pdb: {
    "9:9:9": { uid: 700001, pid: 99999999, coo: "9:9:9" }, // someone else
    "4:5:6": { uid: 200000, pid: 50000001, coo: "4:5:6", home: true }, // self (pid is ours)
  },
  udb: {},
  tdb: {},
};
const raw = JSON.stringify(bareDb);

describe("OGLight adapter — bare db (Export button)", () => {
  it("detects a bare db as oglight", () => {
    expect(detect(raw)).toBe("oglight");
  });

  it("recovers identity from serverData.serverFullID + pdb self-uid", () => {
    const imp = parse(raw);
    expect(imp.universeId).toBe("s1-en");
    expect(imp.accountId.playerId).toBe("200000");
  });

  it("folds into a schema-valid projection", () => {
    const { state } = foldImports([parse(raw)]);
    const projection = projectionSchema.parse(state);
    expect(projection.celestial?.["50000001"]?.buildings?.metalMine).toBe(20);
    expect(projection.celestial?.["50000002"]?.type).toBe("moon");
    expect(projection.account?.research?.energyTechnology).toBe(7);
  });

  it("honors explicit identity overrides", () => {
    const imp = parse(raw, undefined, { universeId: "s9-xx", playerId: "42" });
    expect(imp.universeId).toBe("s9-xx");
    expect(imp.accountId.playerId).toBe("42");
  });

  it("throws a clear error when identity cannot be derived", () => {
    const noIdentity = JSON.stringify({ myPlanets: { "1": { type: "planet", coords: "1:1:1" } } });
    expect(() => parse(noIdentity)).toThrow(/could not derive identity/i);
  });
});

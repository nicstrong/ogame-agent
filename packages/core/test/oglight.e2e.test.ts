import { describe, expect, it } from "vite-plus/test";
import { detect } from "../src/adapters/detect.js";
import { parse } from "../src/adapters/index.js";
import { foldImports } from "../src/facts/fold.js";
import { projectionSchema } from "../src/model/entities.js";
import fixture from "./fixtures/oglight-sample.json" with { type: "json" };

const raw = JSON.stringify(fixture);

describe("OGLight adapter (end-to-end)", () => {
  it("detects the source from the raw payload", () => {
    expect(detect(raw)).toBe("oglight");
  });

  it("parses identity and a stable content-hash id", () => {
    const imp = parse(raw, undefined, { importedAt: "2026-01-01T00:00:00Z" });
    expect(imp.source).toBe("oglight");
    expect(imp.universeId).toBe("s1-en");
    expect(imp.accountId).toEqual({ universeId: "s1-en", playerId: "100000" });
    expect(imp.sourceVersion).toBe("5.3.3");
    expect(imp.id).toBe(parse(raw).id); // deterministic
  });

  it("emits account-scoped research exactly once (not per-celestial)", () => {
    const imp = parse(raw);
    const research = imp.facts.filter((f) => f.path.startsWith("account/research/"));
    // three distinct research ids in the fixture, denormalised onto two planets
    expect(research).toHaveLength(3);
    expect(research.filter((f) => f.path === "account/research/energyTechnology")).toHaveLength(1);
  });

  it("ignores lifeform id blocks in v1", () => {
    const imp = parse(raw);
    expect(imp.facts.some((f) => f.path.includes("11101"))).toBe(false);
  });

  it("folds into a schema-valid projection with correct values", () => {
    const imp = parse(raw);
    const { state } = foldImports([imp]);
    const projection = projectionSchema.parse(state);

    expect(projection.account?.research?.energyTechnology).toBe(14);
    expect(projection.account?.class).toBe(3);

    const planet = projection.celestial?.["33700001"];
    expect(planet?.type).toBe("planet");
    expect(planet?.buildings?.metalMine).toBe(31);
    expect(planet?.coordinates).toEqual({ galaxy: 1, system: 200, position: 8, type: "planet" });
    expect(planet?.moonId).toBe("33800001");
    expect(planet?.resources?.deuterium?.production).toBe(7.4);
    expect(planet?.ships?.espionageProbe).toBe(40);
    expect(planet?.defense?.rocketLauncher).toBe(200);

    const moon = projection.celestial?.["33800001"];
    expect(moon?.type).toBe("moon");
    expect(moon?.buildings?.lunarBase).toBe(6);

    // moonID === '-1' must not produce a moonId; energy === null must be skipped
    const planet2 = projection.celestial?.["33700002"];
    expect(planet2?.moonId).toBeUndefined();
    expect(planet2?.resources?.energy).toBeUndefined();
  });
});

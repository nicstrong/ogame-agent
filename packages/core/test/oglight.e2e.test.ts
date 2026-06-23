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
    expect(imp.sourceVersion).toBe("9.3.3");
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

  it("captures account rank from the string header field", () => {
    const imp = parse(raw);
    const { state } = foldImports([imp]);
    const projection = projectionSchema.parse(state);
    expect(projection.account?.rank).toBe(42);
  });

  it("folds into a schema-valid projection with correct values", () => {
    const imp = parse(raw);
    const { state } = foldImports([imp]);
    const projection = projectionSchema.parse(state);

    expect(projection.account?.research?.energyTechnology).toBe(11);
    expect(projection.account?.class).toBe(3);

    const planet = projection.celestial?.["33700001"];
    expect(planet?.type).toBe("planet");
    expect(planet?.buildings?.metalMine).toBe(25);
    expect(planet?.coordinates).toEqual({ galaxy: 1, system: 320, position: 10, type: "planet" });
    expect(planet?.moonId).toBe("33800001"); // numeric moonID coerced to string
    expect(planet?.ships?.espionageProbe).toBe(2614);
    expect(planet?.defense?.rocketLauncher).toBe(1700);
    // production prefers the camelCase `prodMetal` (28.98) over lowercase `prodmetal` (99.99)
    expect(planet?.resources?.metal?.production).toBe(28.98);
    expect(planet?.resources?.deuterium?.production).toBe(6.23);

    const moon = projection.celestial?.["33800001"];
    expect(moon?.type).toBe("moon");
    expect(moon?.buildings?.lunarBase).toBe(1);

    // moonID === 0 must not produce a moonId; energy === null must be skipped
    const planet2 = projection.celestial?.["33700002"];
    expect(planet2?.moonId).toBeUndefined();
    expect(planet2?.resources?.energy).toBeUndefined();
    // falls back to lowercase `prodmetal` when camelCase is absent (matches moons/older data)
    expect(planet2?.resources?.metal?.production).toBe(34.84);
  });
});

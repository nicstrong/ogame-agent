import { describe, expect, it } from "vite-plus/test";
import { foldImports } from "../src/facts/fold.js";
import { paths, splitPath } from "../src/facts/path.js";
import { projectionSchema } from "../src/model/entities.js";
import { type Fact, type Import, type Json, SCHEMA_VERSION, setFact } from "../src/model/index.js";

function get(obj: unknown, path: string): unknown {
  let node: unknown = obj;
  for (const key of splitPath(path)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const id = "33700001";

/** One entry per fact-path builder in path.ts, with a representative value. */
const cases: [string, Json][] = [
  [paths.account.name(), "Tester"],
  [paths.account.class(), 3],
  [paths.account.rank(), 42],
  [paths.account.playerId(), "100000"],
  [paths.account.research("energyTechnology"), 11],
  [paths.celestial.type(id), "planet"],
  [paths.celestial.name(id), "Tahi"],
  [paths.celestial.coordinates(id), { galaxy: 1, system: 320, position: 10, type: "planet" }],
  [paths.celestial.temperature(id), -2],
  [paths.celestial.lifeform(id), "2"],
  [paths.celestial.moonId(id), "33800001"],
  [paths.celestial.lastRefresh(id), 1781136613000],
  [paths.celestial.fields(id, "used"), 154],
  [paths.celestial.fields(id, "max"), 188],
  [paths.celestial.resource(id, "metal", "amount"), 40738],
  [paths.celestial.resource(id, "metal", "storage"), 5355000],
  [paths.celestial.resource(id, "metal", "production"), 28.98],
  [paths.celestial.building(id, "metalMine"), 25],
  [paths.celestial.ship(id, "smallCargo"), 186],
  [paths.celestial.defense(id, "rocketLauncher"), 1700],
];

describe("projectionSchema preserves every fact-path builder", () => {
  it("round-trips fold -> parse without dropping known paths", () => {
    const facts: Fact[] = cases.map(([p, v]) => setFact(p, v));
    const imp: Import = {
      id: "test",
      universeId: "s1-en",
      accountId: { universeId: "s1-en", playerId: "100000" },
      source: "oglight",
      sourceVersion: "9.3.3",
      transport: "paste",
      reliability: "owned",
      importedAt: "2026-01-01T00:00:00Z",
      schemaVersion: SCHEMA_VERSION,
      raw: "{}",
      facts,
    };
    const { state } = foldImports([imp]);
    const projection = projectionSchema.parse(state);
    for (const [p, v] of cases) {
      expect(get(projection, p)).toEqual(v);
    }
  });
});

import { describe, expect, it } from "vite-plus/test";
import { foldImports } from "../src/facts/fold.js";
import { setFact, tombstoneFact, type Fact } from "../src/model/fact.js";
import type { Import } from "../src/model/import.js";

function makeImport(id: string, importedAt: string, facts: Fact[]): Import {
  return {
    id,
    universeId: "s1-en",
    accountId: { universeId: "s1-en", playerId: "1" },
    source: "oglight",
    sourceVersion: "test",
    transport: "paste",
    reliability: "owned",
    importedAt,
    schemaVersion: 1,
    raw: "{}",
    facts,
  };
}

describe("foldImports", () => {
  it("applies last-write-wins by importedAt regardless of input order", () => {
    const older = makeImport("a", "2026-01-01T00:00:00Z", [
      setFact("celestial/1/buildings/metalMine", 10),
    ]);
    const newer = makeImport("b", "2026-02-01T00:00:00Z", [
      setFact("celestial/1/buildings/metalMine", 12),
    ]);
    // pass newest first to prove ordering is by importedAt, not array position
    const { state, history } = foldImports([newer, older]);
    expect((state.celestial as any)["1"].buildings.metalMine).toBe(12);
    expect(history.get("celestial/1/buildings/metalMine")?.map((h) => h.value)).toEqual([10, 12]);
  });

  it("removes a subtree on tombstone but keeps history", () => {
    const create = makeImport("a", "2026-01-01T00:00:00Z", [
      setFact("celestial/1/buildings/metalMine", 10),
      setFact("celestial/1/coordinates", { galaxy: 1, system: 2, position: 3, type: "planet" }),
    ]);
    const remove = makeImport("b", "2026-02-01T00:00:00Z", [tombstoneFact("celestial/1")]);
    const { state, history } = foldImports([create, remove]);
    expect((state.celestial as any)?.["1"]).toBeUndefined();
    // history retains both the original set and the tombstone event
    expect(history.get("celestial/1/buildings/metalMine")).toHaveLength(1);
    expect(history.get("celestial/1")?.[0]).toMatchObject({ kind: "tombstone" });
  });

  it("treats absence as unknown (no phantom keys)", () => {
    const imp = makeImport("a", "2026-01-01T00:00:00Z", [
      setFact("celestial/1/buildings/metalMine", 10),
    ]);
    const { state } = foldImports([imp]);
    expect((state.celestial as any)["1"].ships).toBeUndefined();
    expect((state.celestial as any)["1"].buildings.crystalMine).toBeUndefined();
  });

  it("re-tombstoned subtree can be re-established by a later set", () => {
    const create = makeImport("a", "2026-01-01T00:00:00Z", [setFact("celestial/1/type", "planet")]);
    const remove = makeImport("b", "2026-02-01T00:00:00Z", [tombstoneFact("celestial/1")]);
    const recreate = makeImport("c", "2026-03-01T00:00:00Z", [setFact("celestial/1/type", "moon")]);
    const { state } = foldImports([create, remove, recreate]);
    expect((state.celestial as any)["1"].type).toBe("moon");
  });
});

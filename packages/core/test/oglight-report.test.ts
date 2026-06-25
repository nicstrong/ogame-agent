import { describe, expect, it } from "vite-plus/test";
import { parseReport } from "../src/adapters/oglight-report.js";
import { reportEventSchema } from "../src/model/report.js";

const HEADER = { DBName: "100000-s1-en", server: { id: 1, lang: "en" }, version: "5.3.3" };

/** Shape mirrors OGLight `readSpyData` (vendor/oglight.js:8187). */
function espionageEnvelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...HEADER,
    report: {
      kind: "espionage",
      id: "msg-1",
      api: "sr-1-en-123",
      coords: "1:200:8",
      targetType: "planet",
      playerID: "500",
      playerName: "Targetus",
      playerStatus: "i",
      isActive: 0,
      activity: 60,
      isAttacked: 0,
      age: 1500,
      metal: 120000,
      crystal: 80000,
      deut: 30000,
      loot: 75,
      fleetValue: 0,
      defValue: 4500,
      hiddenFleet: false,
      hiddenDef: false,
      fleet: {},
      def: { 401: 12 },
      techs: { 113: 14 },
      ...overrides,
    },
  });
}

/** Shape mirrors OGLight `readCombatData` (vendor/oglight.js:8387). */
function combatEnvelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...HEADER,
    report: {
      kind: "combat",
      id: "cr-1",
      api: "cr-1-en-999",
      coords: "3:155:6",
      result: { winner: "attacker" },
      isOwnPlanet: false,
      isAttacker: true,
      isDefender: false,
      isWinner: true,
      probeOnly: false,
      gain: { metal: 50000, crystal: 25000, deut: 10000 },
      ...overrides,
    },
  });
}

describe("parseReport — espionage", () => {
  it("extracts identity, kind, and the query-friendly summary", () => {
    const event = parseReport(espionageEnvelope(), { capturedAt: "2026-06-25T00:00:00Z" });

    expect(() => reportEventSchema.parse(event)).not.toThrow();
    expect(event.kind).toBe("espionage");
    expect(event.universeId).toBe("s1-en");
    expect(event.accountId).toEqual({ universeId: "s1-en", playerId: "100000" });
    expect(event.source).toBe("oglight-message");
    expect(event.sourceVersion).toBe("5.3.3");
    expect(event.sourceMessageId).toBe("msg-1");
    expect(event.apiKey).toBe("sr-1-en-123");
    expect(event.capturedAt).toBe("2026-06-25T00:00:00Z");
    expect(event.facts).toEqual([]);

    expect(event.summary.coords).toEqual({ galaxy: 1, system: 200, position: 8, type: "planet" });
    expect(event.summary.targetPlayerId).toBe("500");
    expect(event.summary.targetPlayerName).toBe("Targetus");
    expect(event.summary.targetIsActive).toBe(false);
    expect(event.summary.resources).toEqual({ metal: 120000, crystal: 80000, deuterium: 30000 });
    expect(event.summary.lootPercent).toBe(75);
    expect(event.summary.defenseValue).toBe(4500);
    expect(event.summary.hiddenFleet).toBe(false);
  });

  it("omits unknown fields instead of defaulting them to zero", () => {
    const event = parseReport(
      espionageEnvelope({
        metal: undefined,
        crystal: undefined,
        deut: undefined,
        activity: undefined,
      }),
    );
    expect(event.summary.resources).toBeUndefined();
    expect(event.summary.targetActivity).toBeUndefined();
  });
});

describe("parseReport — combat", () => {
  it("extracts combat flags and gain", () => {
    const event = parseReport(combatEnvelope());
    expect(event.kind).toBe("combat");
    expect(event.summary.coords).toEqual({ galaxy: 3, system: 155, position: 6 });
    expect(event.summary.result).toBe("attacker");
    expect(event.summary.isAttacker).toBe(true);
    expect(event.summary.isWinner).toBe(true);
    expect(event.summary.isOwnPlanet).toBe(false);
    expect(event.summary.gain).toEqual({ metal: 50000, crystal: 25000, deuterium: 10000 });
  });
});

describe("parseReport — dedup id", () => {
  it("is stable across identical re-captures (pagination revisits)", () => {
    const a = parseReport(espionageEnvelope());
    const b = parseReport(espionageEnvelope());
    expect(a.id).toBe(b.id);
  });

  it("changes id when a volatile field differs, but keeps the source message id for store dedup", () => {
    // OGLight rewrites `isAttacked` on revisit, so the content (id + rawHash) differs.
    // Collapsing those near-duplicates is the store's job via the stable sourceMessageId.
    const a = parseReport(espionageEnvelope({ isAttacked: 0 }));
    const b = parseReport(espionageEnvelope({ isAttacked: 1 }));
    expect(a.id).not.toBe(b.id);
    expect(a.rawHash).not.toBe(b.rawHash);
    expect(a.sourceMessageId).toBe(b.sourceMessageId);
    expect(a.sourceMessageId).toBe("msg-1");
  });

  it("differs across kinds and target messages", () => {
    const spy = parseReport(espionageEnvelope());
    const combat = parseReport(combatEnvelope());
    const other = parseReport(espionageEnvelope({ id: "msg-2" }));
    expect(spy.id).not.toBe(combat.id);
    expect(spy.id).not.toBe(other.id);
  });
});

describe("parseReport — validation", () => {
  it("rejects non-JSON", () => {
    expect(() => parseReport("not json")).toThrow(/not valid JSON/);
  });

  it("rejects a payload without a report object", () => {
    expect(() => parseReport(JSON.stringify({ ...HEADER }))).toThrow(/missing `report`/);
  });

  it("rejects an unknown report kind", () => {
    expect(() =>
      parseReport(JSON.stringify({ ...HEADER, report: { kind: "expedition" } })),
    ).toThrow(/unknown kind/);
  });

  it("rejects a payload with no derivable identity", () => {
    expect(() =>
      parseReport(JSON.stringify({ report: { kind: "espionage", coords: "1:2:3" } })),
    ).toThrow(/missing identity/);
  });

  it("falls back to server+account identity when DBName is absent", () => {
    const raw = JSON.stringify({
      server: { id: 2, lang: "de" },
      account: { id: 777 },
      report: { kind: "combat", id: "c", coords: "1:1:1" },
    });
    const event = parseReport(raw);
    expect(event.universeId).toBe("s2-de");
    expect(event.accountId.playerId).toBe("777");
  });
});

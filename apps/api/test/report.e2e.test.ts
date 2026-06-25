import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReport } from "@ogame-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app.js";
import { ReportStore } from "../src/report-store.js";
import { ImportStore } from "../src/storage.js";

const HEADER = { DBName: "100000-s1-en", server: { id: 1, lang: "en" }, version: "5.3.3" };

function espionage(overrides: Record<string, unknown> = {}) {
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
      metal: 120000,
      crystal: 80000,
      deut: 30000,
      loot: 75,
      defValue: 4500,
      hiddenFleet: false,
      ...overrides,
    },
  });
}

function combat(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...HEADER,
    report: {
      kind: "combat",
      id: "cr-1",
      coords: "3:155:6",
      result: { winner: "attacker" },
      isOwnPlanet: false,
      isAttacker: true,
      isWinner: true,
      gain: { metal: 50000, crystal: 25000, deut: 10000 },
      ...overrides,
    },
  });
}

interface ReportPostResponse {
  ok: boolean;
  deduped: boolean;
  id: string;
  kind: string;
  universeId: string;
  accountId: { universeId: string; playerId: string };
  rawRetention: string;
  derivedFactCount: number;
  error?: string;
}

let dir: string;
let reportStore: ReportStore;
let app: ReturnType<typeof createApp>;
const extraStores: ReportStore[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ogame-report-"));
  reportStore = new ReportStore(dir);
  app = createApp(new ImportStore(dir), reportStore);
});

afterAll(async () => {
  reportStore.close();
  for (const s of extraStores) s.close();
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/report", () => {
  it("ingests an espionage report and returns the stored identity", async () => {
    const res = await app.request("/api/report", { method: "POST", body: espionage() });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReportPostResponse;
    expect(json.ok).toBe(true);
    expect(json.deduped).toBe(false);
    expect(json.kind).toBe("espionage");
    expect(json.universeId).toBe("s1-en");
    expect(json.accountId).toEqual({ universeId: "s1-en", playerId: "100000" });
    expect(json.rawRetention).toBe("full");
    expect(json.derivedFactCount).toBe(0);
  });

  it("dedups a re-capture of the same message", async () => {
    const res = await app.request("/api/report", { method: "POST", body: espionage() });
    const json = (await res.json()) as ReportPostResponse;
    expect(json.deduped).toBe(true);
  });

  it("dedups a revisit of the same message even when volatile fields differ", async () => {
    // OGLight rewrites isAttacked on revisit → different id/raw_hash, same source message id.
    const res = await app.request("/api/report", {
      method: "POST",
      body: espionage({ isAttacked: 1 }),
    });
    const json = (await res.json()) as ReportPostResponse;
    expect(json.deduped).toBe(true);
  });

  it("accepts a combat report via the /report alias", async () => {
    const res = await app.request("/report", { method: "POST", body: combat() });
    const json = (await res.json()) as ReportPostResponse;
    expect(json.ok).toBe(true);
    expect(json.kind).toBe("combat");
  });

  it("rejects an empty body", async () => {
    const res = await app.request("/api/report", { method: "POST", body: "  " });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown report kind", async () => {
    const res = await app.request("/api/report", {
      method: "POST",
      body: JSON.stringify({ ...HEADER, report: { kind: "expedition" } }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as ReportPostResponse;
    expect(json.error).toMatch(/unknown kind/);
  });
});

describe("GET reports", () => {
  it("lists an account's reports, newest first", async () => {
    const res = await app.request("/api/accounts/s1-en/100000/reports");
    const json = (await res.json()) as { reports: { id: string; kind: string }[] };
    // espionage (one stored, dedup collapsed the rest) + combat
    expect(json.reports).toHaveLength(2);
    const kinds = json.reports.map((r) => r.kind).sort();
    expect(kinds).toEqual(["combat", "espionage"]);
  });

  it("filters by kind", async () => {
    const res = await app.request("/api/accounts/s1-en/100000/reports?kind=espionage");
    const json = (await res.json()) as {
      reports: { kind: string; summary: { resources?: Record<string, number> } }[];
    };
    expect(json.reports).toHaveLength(1);
    expect(json.reports[0]!.kind).toBe("espionage");
    expect(json.reports[0]!.summary.resources).toEqual({
      metal: 120000,
      crystal: 80000,
      deuterium: 30000,
    });
  });

  it("fetches one report by id and returns raw only when asked", async () => {
    const id = parseReport(espionage()).id;
    const plain = await app.request(`/api/accounts/s1-en/100000/reports/${id}`);
    const plainJson = (await plain.json()) as { report: { raw?: string } };
    expect(plainJson.report.raw).toBeUndefined();

    const withRaw = await app.request(`/api/accounts/s1-en/100000/reports/${id}?raw=1`);
    const rawJson = (await withRaw.json()) as { report: { raw?: string } };
    expect(typeof rawJson.report.raw).toBe("string");
    expect(JSON.parse(rawJson.report.raw as string).report.kind).toBe("espionage");
  });

  it("404s for an id that belongs to a different account", async () => {
    const id = parseReport(espionage()).id;
    const res = await app.request(`/api/accounts/s1-en/999999/reports/${id}`);
    expect(res.status).toBe(404);
  });
});

describe("raw retention", () => {
  it("hash-only keeps the row but stores no raw payload", () => {
    const store = new ReportStore(dir, {
      rawRetention: "hash-only",
      dbFile: join(dir, "reports-hashonly.sqlite"),
    });
    extraStores.push(store);
    const event = parseReport(combat());
    const result = store.insert(event);
    expect(result.rawRetention).toBe("hash-only");
    const fetched = store.get(event.id, { raw: true });
    expect(fetched?.rawHash).toBe(event.rawHash);
    expect(fetched?.raw).toBeNull();
  });
});

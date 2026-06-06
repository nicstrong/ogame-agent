import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Projection } from "@ogame-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app.js";
import { type AccountRef, ImportStore } from "../src/storage.js";

const envelope = {
  DBName: "100000-s1-en",
  server: { id: 1, lang: "en" },
  account: { id: 100000, name: "Tester", class: 3, rank: 42, lang: "en" },
  db: {
    version: "5.3.3",
    serverData: {},
    myPlanets: {
      "33700001": {
        type: "planet",
        coords: "1:200:8",
        moonID: "33800001",
        metal: 1000,
        "1": 10,
        "113": 5,
      },
      "33800001": { type: "moon", coords: "1:200:8", "41": 2 },
    },
  },
};
const raw = JSON.stringify(envelope);

interface ImportResponse {
  ok: boolean;
  deduped: boolean;
  universeId: string;
  accountId: AccountRef;
  celestialCount: number;
}

let dir: string;
let app: ReturnType<typeof createApp>;

const ndjsonPath = () => join(dir, "s1-en", "100000", "imports.ndjson");
const projectionPath = () => join(dir, "s1-en", "100000", "latest.json");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ogame-api-"));
  app = createApp(new ImportStore(dir));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("API ingest + storage", () => {
  it("ingests an envelope and serves the folded projection", async () => {
    const res = await app.request("/api/import", { method: "POST", body: raw });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ImportResponse;
    expect(json.ok).toBe(true);
    expect(json.deduped).toBe(false);
    expect(json.universeId).toBe("s1-en");
    expect(json.celestialCount).toBe(2);

    const projRes = await app.request("/api/accounts/s1-en/100000/projection");
    const proj = (await projRes.json()) as Projection;
    expect(proj.celestial?.["33700001"]?.buildings?.metalMine).toBe(10);
    expect(proj.account?.research?.energyTechnology).toBe(5);
  });

  it("appends to the NDJSON log as the source of truth", async () => {
    const ndjson = await readFile(ndjsonPath(), "utf8");
    expect(ndjson.trim().split("\n")).toHaveLength(1);
  });

  it("dedups identical payloads (no second log line)", async () => {
    const res = await app.request("/api/import", { method: "POST", body: raw });
    const json = (await res.json()) as ImportResponse;
    expect(json.deduped).toBe(true);
    const ndjson = await readFile(ndjsonPath(), "utf8");
    expect(ndjson.trim().split("\n")).toHaveLength(1);
  });

  it("rebuilds an identical projection from the log alone", async () => {
    const before = (await (
      await app.request("/api/accounts/s1-en/100000/projection")
    ).json()) as Projection;
    await rm(projectionPath(), { force: true }); // drop the materialized cache
    const rebuilt = (await (
      await app.request("/api/accounts/s1-en/100000/rebuild", { method: "POST" })
    ).json()) as Projection;
    expect(rebuilt).toEqual(before);
  });

  it("lists accounts and serves per-path history", async () => {
    const accounts = (await (await app.request("/api/accounts")).json()) as {
      accounts: AccountRef[];
    };
    expect(accounts.accounts).toContainEqual({ universeId: "s1-en", playerId: "100000" });

    const hist = (await (
      await app.request("/api/accounts/s1-en/100000/history?path=account/research/energyTechnology")
    ).json()) as { entries: { value: number }[] };
    expect(hist.entries).toHaveLength(1);
    expect(hist.entries[0]?.value).toBe(5);
  });

  it("rejects an unrecognized payload with 400", async () => {
    const res = await app.request("/api/import", { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
  });
});

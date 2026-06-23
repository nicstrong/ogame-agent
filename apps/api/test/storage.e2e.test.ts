import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, type Projection } from "@ogame-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app.js";
import { ImportStore } from "../src/storage.js";

/** Minimal real-shaped OGLight envelope; `metalMine` varies to make distinct meaningful saves. */
function envelope(metalMine: number): string {
  return JSON.stringify({
    DBName: "100000-s1-en",
    server: { id: "1", lang: "en" },
    account: { id: "100000", name: "Tester", class: 3, rank: "42", lang: "en" },
    db: {
      version: "9.3.3",
      serverData: {},
      myPlanets: {
        "33700001": {
          type: "planet",
          coords: "1:320:10",
          moonID: 0,
          metal: 1000,
          prodMetal: 28.98,
          "1": metalMine,
          "113": 5,
        },
      },
    },
  });
}

let dir: string;
let app: ReturnType<typeof createApp>;
const ndjsonPath = () => join(dir, "s1-en", "100000", "imports.ndjson");
const lineCount = async () => (await readFile(ndjsonPath(), "utf8")).trim().split("\n").length;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ogame-storage-"));
  app = createApp(new ImportStore(dir));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("path-traversal hardening (§B1)", () => {
  it("rejects a payload whose derived universe id is a traversal segment", async () => {
    const bad = envelope(10).replace('"100000-s1-en"', '"100000-.."');
    const res = await app.request("/api/import", { method: "POST", body: bad });
    expect(res.status).toBe(400);
  });

  it("rejects read routes with a traversal account ref", async () => {
    const store = new ImportStore(dir);
    await expect(store.getProjection({ universeId: "..", playerId: "x" })).rejects.toThrow(
      /unsafe path segment/i,
    );
  });
});

describe("concurrent ingest serialization (§B2)", () => {
  it("collapses N identical concurrent saves to a single log line", async () => {
    const raw = envelope(10);
    await Promise.all(
      Array.from({ length: 8 }, () => app.request("/api/import", { method: "POST", body: raw })),
    );
    expect(await lineCount()).toBe(1);
  });

  it("appends one line per distinct concurrent save without corruption", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        app.request("/api/import", { method: "POST", body: envelope(10 + i) }),
      ),
    );
    expect(await lineCount()).toBe(8);
  });
});

describe("reparse-from-raw rebuild (§B3)", () => {
  it("backfills facts the stored adapter output lacked, from the verbatim raw", async () => {
    // Simulate an older adapter: a logged import whose facts omit production, raw intact.
    const raw = envelope(10);
    const imp = parse(raw);
    const stripped = { ...imp, facts: imp.facts.filter((f) => !f.path.endsWith("/production")) };
    await mkdir(join(dir, "s1-en", "100000"), { recursive: true });
    await writeFile(ndjsonPath(), `${JSON.stringify(stripped)}\n`, "utf8");

    const plain = (await (
      await app.request("/api/accounts/s1-en/100000/rebuild", { method: "POST" })
    ).json()) as Projection;
    expect(plain.celestial?.["33700001"]?.resources?.metal?.production).toBeUndefined();

    const reparsed = (await (
      await app.request("/api/accounts/s1-en/100000/rebuild?reparse=1", { method: "POST" })
    ).json()) as Projection;
    expect(reparsed.celestial?.["33700001"]?.resources?.metal?.production).toBe(28.98);
  });
});

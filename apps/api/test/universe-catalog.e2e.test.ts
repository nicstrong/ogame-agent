import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app.js";
import { ImportStore, type UniverseCatalog } from "../src/storage.js";

const envelope = {
  DBName: "100000-s1-en",
  server: { id: 1, lang: "en" },
  account: { id: 100000, name: "Tester", class: 3, rank: 42, lang: "en" },
  db: {
    version: "5.3.3",
    serverData: {
      serverFullID: "1en",
      galaxies: 5, // numeric config value -> excluded (only id->name strings count)
      "1": "Metal Mine",
      "113": "Energy Technology",
      "11101": "Residential Sector", // lifeform-1 building
      "11201": "Intergalactic Envoys", // lifeform-1 research
    },
    myPlanets: {
      "33700001": { type: "planet", coords: "1:200:8", metal: 1000, "1": 10, "11101": 7 },
    },
  },
};
const raw = JSON.stringify(envelope);

let dir: string;
let app: ReturnType<typeof createApp>;

const catalogPath = () => join(dir, "s1-en", "catalog.json");
const getCatalog = async (universeId = "s1-en"): Promise<UniverseCatalog> =>
  (await (await app.request(`/api/universes/${universeId}/catalog`)).json()) as UniverseCatalog;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ogame-catalog-"));
  app = createApp(new ImportStore(dir));
  await app.request("/api/import", { method: "POST", body: raw });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("per-universe localized catalog", () => {
  it("materializes serverData into a per-universe catalog file on import", async () => {
    const text = await readFile(catalogPath(), "utf8");
    const onDisk = JSON.parse(text) as UniverseCatalog;
    expect(onDisk.universeId).toBe("s1-en");
    expect(onDisk.sourceVersion).toBe("5.3.3");
  });

  it("serves localized names with canonical keys, including lifeform ids", async () => {
    const catalog = await getCatalog();
    const byId = new Map(catalog.entries.map((e) => [e.id, e]));
    expect(byId.get(1)).toMatchObject({
      name: "Metal Mine",
      key: "metalMine",
      category: "building",
    });
    expect(byId.get(11101)).toMatchObject({
      name: "Residential Sector",
      key: "lf11101",
      category: "lifeformBuilding",
    });
    expect(byId.get(11201)).toMatchObject({
      name: "Intergalactic Envoys",
      key: "lf11201",
      category: "lifeformResearch",
    });
    // non-numeric / numeric-valued server config keys are not name entries
    expect(catalog.entries.some((e) => e.name === "5")).toBe(false);
  });

  it("returns an empty catalog for a universe with no data", async () => {
    const catalog = await getCatalog("s9-zz");
    expect(catalog).toEqual({ universeId: "s9-zz", entries: [] });
  });

  it("rejects an unsafe universe segment", async () => {
    const res = await app.request(`/api/universes/${encodeURIComponent("../etc")}/catalog`);
    expect(res.status).toBe(400);
  });

  it("repopulates the catalog from the log on rebuild", async () => {
    await rm(catalogPath(), { force: true });
    await app.request("/api/accounts/s1-en/100000/rebuild", { method: "POST" });
    const catalog = await getCatalog();
    expect(catalog.entries.some((e) => e.id === 11101)).toBe(true);
  });
});

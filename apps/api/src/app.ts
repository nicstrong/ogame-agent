import { parse } from "@ogame-agent/core";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type AccountRef, ImportStore } from "./storage.js";

export function createApp(store: ImportStore = new ImportStore()) {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    }),
  );

  app.get("/api/health", (c) => {
    return c.json({ ok: true, service: "ogame-agent-api" });
  });

  /**
   * Ingest a raw OGLight envelope (request body = the envelope JSON, as text).
   * Parses with the shared core adapters, appends to the immutable log, and
   * refreshes the materialized projection. Idempotent: identical payloads dedup.
   */
  const importHandler = async (c: Context) => {
    const raw = await c.req.text();
    if (!raw.trim()) {
      return c.json({ ok: false, error: "Empty request body" }, 400);
    }
    try {
      const imp = parse(raw, undefined, { transport: "http" });
      const { deduped, projection } = await store.ingest(imp);
      return c.json({
        ok: true,
        deduped,
        id: imp.id,
        source: imp.source,
        universeId: imp.universeId,
        accountId: imp.accountId,
        factCount: imp.facts.length,
        celestialCount: Object.keys(projection.celestial ?? {}).length,
      });
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400);
    }
  };

  app.post("/api/import", importHandler);
  // Forward-compat alias for the future OGLight HTTP push (architecture §2a).
  app.post("/import", importHandler);

  app.get("/api/accounts", async (c) => {
    return c.json({ accounts: await store.listAccounts() });
  });

  const refFrom = (c: Context): AccountRef => ({
    universeId: c.req.param("universeId") ?? "",
    playerId: c.req.param("playerId") ?? "",
  });

  app.get("/api/accounts/:universeId/:playerId/projection", async (c) => {
    return c.json(await store.getProjection(refFrom(c)));
  });

  app.get("/api/accounts/:universeId/:playerId/history", async (c) => {
    const history = await store.getHistory(refFrom(c));
    const path = c.req.query("path");
    if (path) return c.json({ path, entries: history[path] ?? [] });
    return c.json(history);
  });

  app.post("/api/accounts/:universeId/:playerId/rebuild", async (c) => {
    return c.json(await store.rebuildProjection(refFrom(c)));
  });

  app.notFound((c) => {
    return c.json({ error: "Not found", path: c.req.path }, 404);
  });

  return app;
}

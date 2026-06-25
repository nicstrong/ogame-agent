import { defineConfig } from "drizzle-kit";

/**
 * Report storage migrations (capture-api-and-storage §7). The runtime SQLite file lives
 * under the data dir (`$OGAME_DATA_DIR`/reports.sqlite); this config is only used by the
 * `drizzle-kit generate` CLI to author migrations from `src/db/schema.ts` into `drizzle/`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});

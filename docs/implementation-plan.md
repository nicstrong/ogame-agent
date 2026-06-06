# OGame Agent — Implementation Plan

Status: **active**. Derives from [architecture.md](architecture.md). Aggressive, 4-phase track:
each phase is a **runnable vertical slice** with an explicit exit bar. Risk is front-loaded into
Phase 1 (the fact/fold domain core); app work only begins once the core is proven against a real
`window.ogl` dump.

**Current scaffold (starting point):**

- Monorepo on Vite+ (`vp`). `pnpm-workspace.yaml` globs only `apps/*`.
- `apps/web` — React + shadcn; import dialog is a stub (`// TODO: wire up import`,
  [import-dialog.tsx:21](../apps/web/src/components/import-dialog.tsx)).
- `apps/api` — Hono with only `/api/health` ([app.ts](../apps/api/src/app.ts)).
- `vendor/oglight.js`, `vendor/infocomplete.js` — reference plugin sources.
- **`packages/core` does not exist yet** — greenfield.

Conventions: run `vp check` and `vp test` on every change (per [AGENTS.md](../AGENTS.md)). `packages/core`
must stay **isomorphic** (no node-only or browser-only APIs) so web, API, and future MCP all import it.

---

## Phase 1 — Core spine (`packages/core`)

> ~60% of the project's real risk. The fact model, fold engine, and OGLight adapter either hold
> against real data or they don't — prove it here before any app exists.

**Work**

1. **Workspace wiring** — add `packages/*` to `pnpm-workspace.yaml`; scaffold `packages/core`
   (pure TS, ESM, zod) per the layout in architecture §5; `vp` build/test green.
2. **`model/`** — zod schemas + types for `Import`, `Fact` (`set` | `tombstone`), and the read-model
   entities (Universe, Account, Celestial, Resources, Buildings, Research, Fleet, Defense, Lifeform).
3. **`identity/`** — build/parse `UniverseId`, `AccountId`, `CelestialId`; coordinate parsing
   (`"g:s:p"` ↔ `{ galaxy, system, position, type }`). Coordinates are a **mutable attribute**, not identity.
4. **`catalog/`** — canonical keys for buildings/ships/research/defense/lifeform; bootstrap the
   numeric-id → key maps from `db.serverData` (architecture §2a) rather than hand-maintaining them,
   keeping canonical keys stable across languages.
5. **`facts/`** — `FactPath` builders; the **fold engine** (order by `importedAt`, last-write-wins
   `set`, subtree-removing `tombstone`); history grouping by path. Honor **absence = unknown, never zero**.
6. **`adapters/oglight.ts`** + **`adapters/detect.ts`** + **`adapters/index.ts`** registry —
   `myPlanets` → facts; **research emitted account-scoped once** (not fanned per-celestial);
   moons first-class; tolerant of stray DOM/circular values at the boundary (architecture §2a, §3).

**Exit bar:** a captured real OGLight envelope runs `parse(raw) → Import{facts[]}` and
`fold([...]) → projection + per-field history`, all zod-validated and unit-tested. No app, no storage.

---

## Phase 2 — API + storage slice (`apps/api`)

> The persistence seam (architecture §7) and the capture-first guarantee: raw is source of truth,
> projection is re-foldable.

**Work**

1. `POST /import` — reuse `packages/core` adapters; zod-validate; content-hash `id` dedups identical pastes.
2. **Append-only `imports.ndjson`** per universe/account (source of truth, never destructively rewritten).
3. **lowdb materialized projection** (`latest.json`) produced by folding the log; a rebuild path that
   re-folds from scratch (proves "improve adapter + re-fold corrects history").
4. Read endpoints — current projection + per-field history for the viewer.

**Exit bar:** `curl` a real envelope → appended to `imports.ndjson` → projection updated; deleting
`latest.json` and rebuilding from the log yields an identical projection.

---

## Phase 3 — Web viewer + import UX (`apps/web`)

**Work**

1. Wire the real import dialog: client-side `detect` + `parse` via `packages/core`, instant **preview**
   of what will be imported, then `POST /import`.
2. **Viewer** — current state per celestial + account; per-field **history** view.
3. **Universe chooser** — UI operates on one universe at a time (architecture §2).

**Exit bar:** full browser loop — paste an OGLight envelope, preview it, import, and see the merged
projection + history update for the selected universe.

---

## Phase 4 — Realtime + hardening

> Only meaningful once the paste loop works end-to-end. Turns capture continuous and keeps history clean.

**Work**

1. **OGLight mod** — a "copy for OGame-agent" button emitting the canonical envelope; then auto
   **HTTP-push on save** hooked at OGLight's single write point (`GM_setValue`, architecture §2a),
   hitting the same `POST /import`.
2. **Redundant-save suppression** (architecture §3a): Gate 1 canonical-hash ingest dedup, Gate 2
   fact-level diff vs projection, and the **resource continuous-fact policy** (rate-change /
   prediction-deviation threshold). Raw log stays append-only; gates suppress _fact transactions_ only.
3. **Tombstone UX** — viewer "remove planet" emits a manual tombstone fact.

**Exit bar:** auto-push while playing produces no redundant projection revisions for cosmetic/ticking
saves, while real events (build completes, raid, manual spend) still register.

---

## Backlog (deferred — out of the aggressive track)

Tracked but not scheduled; mirrors architecture §8. Pull forward only with a deliberate decision.

- **MCP server** (`apps/mcp`) — read + computed-analytics tools over the projection; needs the cost catalog.
- **Intel-on-others** — `db.udb` / `db.pdb` / `db.tdb` (galaxy/espionage) + reliability tiers.
- **InfoCompte adapter** — structured and/or text-export fallback.
- **Lifeform depth** — beyond the v1 building/research blocks.
- **Tombstone auto-derivation** — diff a full-account roster against current state.
- **Cost/stats catalog** — base costs for analytics.

---

## Sequencing notes

- **Phases are gated, not parallel** — each exit bar must pass before the next starts; Phase 1's core
  contract is what every later phase depends on.
- **Capture a real `window.ogl` dump first** — Phase 1's tests are only as good as the fixture; grab a
  live envelope before writing the adapter.
- `reliability: 'owned'` and `importedAt`-only provenance are fixed for v1; `lastRefresh`-based
  `observedAt` stays available but unused until merge correctness demands it.

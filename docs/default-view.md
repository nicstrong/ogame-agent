# OGame Agent — Default Dashboard View (implementation plan)

Status: **active plan**. Derives from [architecture.md](architecture.md),
[implementation-plan.md](implementation-plan.md), and [reports-and-history.md](reports-and-history.md).
Scope: the redesigned **default view** — a single-account empire dashboard matching the agreed
mockups (account/empire summary, research, a selected-planet detail with buildings/fleet/defense/
lifeform columns, and a jump-to-planet picker).

This is a **viewer-led feature** that pulls forward three capture additions the projection doesn't
surface yet: **own-account score**, **lifeform buildings/research**, and **per-universe localized
names**. Everything else the mockup needs is already captured.

---

## 1. Data audit (verified against a real `s274-en/111481` capture)

Legend: ✅ captured & projected · 🟡 in raw, not yet a fact/projection · 🧮 computed from existing ·
🔴 not in the data.

| Mockup element                                   | Source                                           | Status                 |
| ------------------------------------------------ | ------------------------------------------------ | ---------------------- |
| Header planet name + coords                      | `celestial/{id}/name`, `/coordinates`            | ✅                     |
| Universe id `s274-en` / player id                | `universeId`, `account/playerId`                 | ✅                     |
| Server name `Scorpius`                           | envelope `server.name`                           | 🟡 (not folded; minor) |
| Account name `Toa`                               | `account/name`                                   | ✅                     |
| `Discoverer · Class 3`                           | `account/class` (id) + static name map           | 🟡 name map            |
| `POINTS 4.42M`                                   | `db.udb[playerId].score.global`                  | 🟡 emit as fact        |
| `RANK #22`                                       | `db.udb[playerId].score.globalRanking`           | 🟡 emit as fact        |
| Score breakdown (eco/research/military/lifeform) | `db.udb[playerId].score.*`                       | 🟡 emit as fact        |
| `PLANETS 11`                                     | count `celestial` of `type=planet`               | 🧮                     |
| `EMPIRE · TOTAL MSU 149.7M` + M/C/D totals       | sum `resources.*.amount` × MSU ratio             | 🧮                     |
| MSU/h, MSU/day (toggle)                          | sum `resources.*.production` × MSU ratio         | 🧮                     |
| Research panel (16 techs)                        | `account/research/*`                             | ✅                     |
| Planet `169/188 fields`                          | `celestial/{id}/fields/{used,max}`               | ✅                     |
| Planet temp `-2° to 38°`                         | `temperature` (min) + derived `max = min+40`     | ✅ / 🧮                |
| `Lifeform · Humans`                              | `celestial/{id}/lifeform` (id) + static name map | 🟡 name map            |
| Resources in store + `/h` + storage cap          | `resources/{res}/{amount,production,storage}`    | ✅                     |
| Buildings / Fleet / Defense columns              | `celestial/{id}/{buildings,ships,defense}`       | ✅                     |
| Defense Total `2,274`                            | sum of `defense`                                 | 🧮                     |
| LF Buildings column                              | planet keys `1L1xx` (per active lifeform)        | 🟡 catalog + emit      |
| LF Research column                               | planet keys `1L2xx`                              | 🟡 catalog + emit      |
| Localized labels (any language)                  | `db.serverData` id→name (per universe)           | 🟡 capture + serve     |
| Planet diameter `12,800 km`                      | —                                                | 🔴 **drop from view**  |
| Planet image                                     | deterministic SVG circle + specular highlight    | 🧮 (no data)           |

**Confirmed facts about the raw data:**

- Score lives in `db.udb[<ownPlayerId>].score` = `{ global, economy, research, lifeform, military,
globalRanking, economyRanking, researchRanking, lifeformRanking, militaryRanking }`. The adapter
  ignores `udb` today.
- Lifeform ids `11xxx–14xxx` are **all present on every planet** (one block per lifeform, levels `0`
  for inactive). Layout: `1L1xx` = buildings, `1L2xx` = research, `L` ∈ 1..4. The adapter currently
  **skips** them (`isLifeformOgameId`, [oglight.ts:214](../packages/core/src/adapters/oglight.ts)).
- `db.serverData` carries localized names for **all** ids (normal + LF), e.g. `11101 → "Residential
Sector"`, `11201 → "Intergalactic Envoys"`. `buildServerCatalog()`
  ([catalog/index.ts:135](../packages/core/src/catalog/index.ts)) already maps it — but is **never
  called** in the capture path.
- `temperature` is **min only** (`-2`); OGame max = `min + 40`.
- **No `diameter`** key anywhere → drop planet size from the view entirely (no placeholder).

---

## 2. Decisions locked in this plan

1. **MSU ratio = `3:2:1`, configurable in settings.** Interpreted as the trade value ratio
   (`3 metal = 2 crystal = 1 deut`), giving weights `metal×1, crystal×1.5, deut×3`. Verified: it
   reproduces the mockup's `149.7M` exactly from `77.5M / 31.9M / 8.1M`. Weight of resource `x` =
   `ratio.metal / ratio.x`.
2. **Empire card has an MSU↔temporal toggle** cycling **MSU → MSU/h → MSU/day**. Lives only on the
   empire card; per-planet detail already shows per-resource `/h`, and the jump-list per-planet
   values stay as stored MSU.
3. **Score/rank/global-rank become tracked facts**, derived from `udb[playerId].score`. `udb`-derived
   rank supersedes the header `account/rank` (more reliable, no suppression volatility surprise).
4. **Score paths are classified volatile** in suppression (§4.3) — they ride along with a meaningful
   save but never admit one alone, so economy-score ticks don't defeat redundant-save suppression.
   History therefore samples score at real-event times (acceptable for v1; a dedicated score-sampling
   policy is a noted future option).
5. **Localized names are per-universe** (`data/{universeId}/catalog.json`), captured from `serverData`
   on ingest. A user playing a German and an English universe gets correct labels in each. The
   localized catalog is **reference data, not a fact** — it bypasses the fold.
6. **Display label resolution** is `localizedCatalog[canonicalKey] ?? camelToLabel(canonicalKey)` so
   normal _and_ lifeform rows show server-localized names, with a safe fallback.
7. **Lifeform catalog is range-classified**, not a 120-row hand table: ids `1L1xx → lifeformBuilding`,
   `1L2xx → lifeformResearch`, canonical key `lf{id}` (display name always from the universe
   catalog). Keeps the catalog small and language-independent.
8. **LF buildings and LF research are both per-celestial.** Normal research stays account-scoped
   (emitted once); lifeform research is per-planet, so it is emitted per celestial like LF buildings.
   The planet columns read the active-lifeform slice.
9. **Planet visual** = SVG circle with a specular highlight, hue derived deterministically from the
   celestial id (stable, distinct, no asset/data).

---

## 3. Mockup → data mapping the UI will rely on

```
Account card     name=account/name  class=account/class+map  rank=account/score/globalRanking
                 points=account/score/global  planets=count(celestial.type=planet)
Empire card      mode∈{value,perHour,perDay}; per resource: stored=Σ amount, rate=Σ production
                 figure = Σ_celestials msu({metal,crystal,deut}, ratio, mode)
Research panel   account/research/*            (label via universe catalog)
Planet visual    hue = hash(celestialId)
Planet header    name, coords, fields.used/max, temp=[min, min+40], lifeform id→name
Resources card   resources/{res}/{amount,production,storage}; bar = amount/storage
Buildings col    celestial/{id}/buildings/*
Fleet col        celestial/{id}/ships/*
Defense col      celestial/{id}/defense/*   + total = Σ
LF Buildings col celestial/{id}/lifeformBuildings/* filtered to celestial.lifeform
LF Research col  celestial/{id}/lifeformResearch/*  filtered to celestial.lifeform
Jump-to-planet   per planet: name, coords, stored MSU value
```

---

## 4. Workstream A — core (`packages/core`)

### 4.1 Fact paths ([facts/path.ts](../packages/core/src/facts/path.ts))

Add builders:

- `account.score(key)` → `account/score/{key}` (`global`, `economy`, `research`, `lifeform`,
  `military`, `globalRanking`, `economyRanking`, `researchRanking`, `lifeformRanking`,
  `militaryRanking`).
- `celestial.lifeformBuilding(id, key)` → `celestial/{id}/lifeformBuildings/{key}`.
- `celestial.lifeformResearch(id, key)` → `celestial/{id}/lifeformResearch/{key}`.

### 4.2 Catalog ([catalog/index.ts](../packages/core/src/catalog/index.ts))

- Replace the hard `isLifeformOgameId` skip with a **range classifier**:
  `lifeformCatalogEntry(id)` → `{ category: "lifeformBuilding"|"lifeformResearch", key: "lf"+id }`
  for `1L1xx`/`1L2xx`; fold it into `catalogEntryForOgameId` so `buildServerCatalog` also pairs LF
  ids with keys/categories.
- Extend `CatalogCategory` with `"lifeformBuilding" | "lifeformResearch"`.

### 4.3 Suppression ([suppression/index.ts](../packages/core/src/suppression/index.ts))

- Add `isScorePath(seg)` (`seg[0]==="account" && seg[1]==="score"`) and include it in
  `isVolatilePath`. Score then rides along with meaningful saves only. Add a unit test proving a
  **score-only** save is suppressed and a score change **alongside** a building change is recorded.

### 4.4 Model ([model/entities.ts](../packages/core/src/model/entities.ts))

- Add `account.score` object (all numeric fields optional) to `accountSchema`.
- Add `celestial.lifeformBuildings?: LevelMap` and `celestial.lifeformResearch?: LevelMap`. (Both
  already pass through via `.passthrough()`, but enumerate for types + intent.)

### 4.5 Value helper (new `packages/core/src/value/msu.ts`)

```ts
export type MsuRatio = { metal: number; crystal: number; deuterium: number }; // default 3,2,1
export type MsuMode = "value" | "perHour" | "perDay";
export function msuWeights(r: MsuRatio): { metal; crystal; deuterium }; // r.metal / r.x
export function celestialMsu(c: Celestial, r: MsuRatio, mode: MsuMode): number;
export function empireMsu(
  p: Projection,
  r: MsuRatio,
  mode: MsuMode,
): { total; metal; crystal; deut };
```

`value`→`amount`, `perHour`→`production`, `perDay`→`production*24`. Isomorphic (web imports it).

### 4.6 Adapter ([adapters/oglight.ts](../packages/core/src/adapters/oglight.ts))

- In `emitCelestial`, route LF ids via the new classifier into per-celestial `lifeformBuildings/*`
  and `lifeformResearch/*` facts (normal research stays account-scoped, collected once as today).
- New `emitScore(db, playerId, facts)`: read `db.udb[playerId].score`, emit each numeric subfield as
  `account/score/{key}`; set `account/rank` from `globalRanking`. No-op if `udb`/self entry absent
  (bare-db/older captures).
- Keep header `account/rank` only as a fallback when score is unavailable.

**Exit bar A:** fixture-driven unit tests — the real envelope yields `account/score/*`, per-planet
`lifeformBuildings/*` and `lifeformResearch/*`; `fold` projects them; MSU helper reproduces
`149.7M` at ratio 3:2:1; score-only save suppressed.

---

## 5. Workstream B — API + storage (`apps/api`)

### 5.1 Per-universe localized catalog

- New `data/{universeId}/catalog.json` sidecar (universe-level, beside the account dirs). Shape:
  `{ updatedAt, sourceVersion, entries: ServerCatalogEntry[] }`.
- Populate from `imp.raw → db.serverData → buildServerCatalog()` during `ImportStore.ingest`
  ([storage.ts:193](../apps/api/src/storage.ts)) — merge/union so a partial save never wipes names.
  `listAccounts` already skips non-directories, so the file doesn't masquerade as a player.
- `rebuildProjection` should repopulate it from the newest import (keeps rebuild authoritative).

### 5.2 Endpoints ([app.ts](../apps/api/src/app.ts))

- `GET /api/universes/:universeId/catalog` → `{ entries }` (same `isSafeRef`-style guard on the
  segment).
- Projection/score need no new endpoint — they ride the existing
  `/accounts/:u/:p/projection` response.

**Exit bar B:** importing the real envelope writes `data/s274-en/catalog.json` with localized LF
names; the endpoint serves it; deleting + rebuilding regenerates it.

---

## 6. Workstream C — web data layer (`apps/web`)

- `lib/api.ts`: `getUniverseCatalog(universeId)`; types for `score` + LF maps (re-exported from core).
- `lib/settings.ts` (new): localStorage-backed `MsuRatio` (default `3:2:1`) + persisted empire-card
  `MsuMode`; a `useSettings` hook. Surface the ratio editor in [settings.tsx](../apps/web/src/pages/settings.tsx).
- `lib/labels.ts` (new): build `key→localizedName` from the universe catalog; `label(key)` =
  `catalog[key] ?? camelToLabel(key)`. Fetch the catalog when the selected account's universe
  changes (extend `accounts-context.tsx`).
- Static maps in core or web: `accountClassName(id)` (1 Collector, 2 General, 3 Discoverer) and
  `lifeformName(id)` (1 Humans, 2 Rocktal, 3 Mechas, 4 Kaelesh).

---

## 7. Workstream D — web UI redesign (`apps/web`)

Full redesign of [projection-view.tsx](../apps/web/src/components/projection-view.tsx) (it becomes a
composition of new components; the current generic stat-grid is replaced). All stat cells keep the
existing **click-to-open-history** behavior via `useAccounts().openHistory`.

- **`PlanetSwitcher`** (replaces the header text): trigger shows current planet + coords + planet
  count; popover = jump-to-planet grid (name, coords, stored MSU per planet). Selecting sets the
  active celestial (new `activeCelestialId` in context; defaults to first planet).
- **`AccountCard`**: name, `class→name`, rank (`#`), points, planet count.
- **`EmpireCard`**: headline MSU figure + M/C/D sub-row; mode toggle (`value→perHour→perDay`) driving
  `empireMsu`; label switches `TOTAL MSU` / `TOTAL MSU/h` / `TOTAL MSU/day`.
- **`ResearchPanel`**: account research, localized labels.
- **`PlanetDetail`**: `PlanetVisual` (hashed-hue SVG sphere), name/coords, `fields used/max`, temp
  range, lifeform name. **No diameter.**
- **`ResourcesCard`**: metal/crystal/deut rows (amount, `+prod/h`, storage cap, fill bar) + energy.
- **`LevelColumn`** (reused): Buildings, Fleet, Defense (with computed total), LF Buildings (filtered
  to active lifeform), LF Research (filtered to active lifeform). Localized labels throughout.

**Exit bar D:** load the real `s274-en/111481` account → dashboard renders points/rank, empire MSU
`≈149.7M` with a working 3-way toggle, localized building/LF labels, jump-to-planet, per-field
history still opens. No diameter shown.

---

## 8. Sequencing & verification

1. **A (core)** — facts, catalog, suppression, model, MSU helper, adapter. Unit-tested against the
   fixture; unblocks everything.
2. **B (api)** — universe catalog capture + endpoint.
3. **C (web data)** — api client, settings, label resolver, context wiring.
4. **D (web ui)** — components + redesign.
5. Run `vp check` + `vp test` per change ([AGENTS.md](../AGENTS.md)); browser-verify the loop with the
   existing captured account before wiring real auto-push.

## 9. Deferred / open

- **Standalone score-over-time sampling** (a score-deviation policy like the resource policy) if
  event-sampled score history proves too sparse.
- **Server display name / universe speeds** folded into the projection (cosmetic).
- **Per-planet "Points"** in the mockup is just the account total echoed — OGame has no per-planet
  score; render account points or omit.

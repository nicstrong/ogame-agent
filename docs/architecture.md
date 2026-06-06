# OGame Agent — Architecture (initial)

Status: **draft / agreed direction**. Scope of this document: **data capture and the domain model**.
Storage internals (lowdb + NDJSON) and the MCP tool surface are deferred but their seams are
defined here.

## 1. Purpose

Capture OGame data over time and serve it two ways:

1. A **viewer** of the data (current state + history).
2. An **MCP server** exposing read + computed-analytics tools to agents.

The first version ingests data by **copy-paste** from two browser plugins (sources live in
[`vendor/`](../vendor)): **OGLight** (`vendor/oglight.js`, fleet/galaxy-oriented) and
**InfoCompte** (`vendor/infocomplete.js`, empire/economy-oriented). A later version will let a
modified OGLight **POST** data over HTTP — so the same parsers must run server-side too.

## 2. Key decisions

| Area          | Decision                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Subject       | Multiple **own** accounts, each individual. Intel-on-others deferred.                                                      |
| Capture/merge | **Merge partial updates** into a derived current state. Sources cover different, overlapping aspects, so no whole-replace. |
| Merge unit    | **Field-path facts** (per-leaf), last-write-wins by `importedAt`. Per-field history for free.                              |
| Deletion      | **Explicit tombstones** (deletion is its own fact).                                                                        |
| Identity      | universe/server + OGame **internal IDs** (player id, planet/moon id). Coordinates are mutable attributes, not identity.    |
| Accounts      | Multi-universe from the start; UI works on one universe via a chooser.                                                     |
| Packages      | **Single core package** (`packages/core`) with `model/` + `adapters/`; isomorphic.                                         |
| Parsing       | **Client-side first** (clipboard detection, instant preview); same adapters reused by the API for the future HTTP push.    |
| Provenance    | `importedAt` + `reliability` only (no observed-time extraction yet; v1 reliability is always `owned`).                     |
| Validation    | `zod` at the adapter boundary.                                                                                             |
| MCP           | Read + computed analytics — not designed yet, but the data layer must not preclude it.                                     |

### Source reality (from `vendor/`)

- **OGLight** export = `JSON.stringify(db)` ([oglight.js:3175](../vendor/oglight.js)). Structured,
  has internal IDs, fleet, galaxy, `serverData`. Strong on fleet/galaxy/coords.
  **Verified against a live `window.ogl` dump — see §2a for the actual shape.** Confirmed it
  carries the full own-empire economy too, so OGLight is the sole v1 source.
- **InfoCompte** has two representations:
  - **Structured** `Storage.get()` object — `player.positions[coords] = { planet:{id,...}, moon:{...} }`,
    has internal IDs, buildings/research/lifeforms/defence. Also logged to console on each scrape
    (`InfoCompte: Data has been scraped with success`), but **partial per page** and only accessible
    by navigating every UI page — not a practical capture path. **Deferred; OGLight covers v1.**
  - **Text export** (bbcode/plaintext, forum-oriented, coords-only, brittle) — optional fallback only.

## 2a. OGLight payload anatomy (from a live `window.ogl` dump)

`window.ogl` is a wrapper; `window.ogl.db` is the persisted object (same as the Export button).
Top-level identity: `DBName = "{playerId}-s{serverId}-{lang}"` (e.g. `100000-s1-en`);
`server = { id, name, lang, economySpeed, peacefulFleetSpeed, holdingFleetSpeed, warFleetSpeed }`;
`account = { id, class (numeric: 3=explorer), name, rank, planets[] }`.

**Own empire — `db.myPlanets`** (the v1 adapter target). Keyed by **internal celestial id**
(planet _and_ moon ids; `type: "planet"|"moon"`, `moonID` links a planet to its moon). Each entry is
a **flat numeric-id → value map** plus typed fields:

- IDs partition by range (names resolved via `db.serverData`):
  - `1–44` supplies + facilities (buildings)
  - `106–124`, `199` research — **account-wide but denormalised onto every planet** (identical copies)
  - `202–220` ships, `401–503` defence
  - `11xxx / 12xxx / 13xxx / 14xxx` lifeform buildings+research, one block per species (humans/rocktal/mechas/kaelesh)
- typed fields: `coords` ("g:s:p" string), `temperature`, `fieldUsed/fieldMax`, `lifeform`,
  `metal/crystal/deut/energy/food/population` (+ `*Storage`), `prodMetal/Crystal/Deut`,
  `lastRefresh` (ms — per-celestial observation time), `todolist`, `upgrades`, `wreckfield`.
  Note: `energy` is `null` on non-current planets (only the open planet has live resources).

**Catalog source — `db.serverData`**: numeric-id → localised name for every building/research/
ship/defence/lifeform, **plus** server config: `researchSpeed`, `economySpeed`, `debrisFactor`,
`galaxies`, `systems`, `donutGalaxy/donutSystem`, status letters. Seeds both the catalog and the
Universe model directly.

**Intel on others (deferred, own-accounts-only v1)** — present but ignored by the v1 adapter:
`db.udb` (other players: uid, name, status, score+rankings, planet coord list, `api` timestamp),
`db.pdb` (scanned planets by coords: uid, pid, mid, spy timestamps, `home`, `debris`, `acti`),
`db.tdb` (tagged-planet colours). These map cleanly onto the future intel layer.

### Capture envelope & method (verified)

The canonical v1 input is a DOM-free envelope — header + `db`:

```js
{ DBName, server, account: { id, name, class, rank, lang }, db }
```

`db` is plain JSON (no DOM, no circular refs) and copies cleanly. The identity header must be
cherry-picked: `ogl.account` itself holds DOM nodes (`hasGeologist`, `chatEnabled`) and
`ogl`'s manager objects back-reference `ogl` (circular), so `JSON.stringify(ogl)` throws
`Converting circular structure to JSON` and a whole-`account` copy carries DOM. Picking the five
scalar `account` fields avoids both. The header also recovers `account.class` (e.g. `3`=explorer),
which `db` alone lacks.

Capture paths (both emit the **same** envelope → same adapter):

- **Primary — button.** A "copy for OGame-agent" button (added via the planned OGLight mod, which
  already has `unsafeWindow` + a settings panel) runs `copy(envelope)` / `navigator.clipboard
.writeText(JSON.stringify(envelope))`. One click → paste into the web import dialog.
- **Fallback — console snippet.** Same object via the DevTools `copy()` helper. It also scrapes
  the planet list for **names** (OGLight never persists them — they live only in the page DOM), into
  an optional `planetNames` map (`celestialId → name`) the adapter folds onto `celestial/{id}/name`:
  ```js
  copy(
    (() => {
      const planetNames = {};
      document.querySelectorAll("#planetList .smallplanet").forEach((line) => {
        const pid = new URLSearchParams(
          line.querySelector(".planetlink")?.getAttribute("href"),
        ).get("cp");
        const name = line.querySelector(".planet-name")?.textContent?.trim();
        if (pid && name) planetNames[pid] = name;
      });
      return {
        DBName: ogl.DBName,
        server: ogl.server,
        account: {
          id: ogl.account.id,
          name: ogl.account.name,
          class: ogl.account.class,
          rank: ogl.account.rank,
          lang: ogl.account.lang,
        },
        db: ogl.db,
        planetNames,
      };
    })(),
  );
  ```
- **Later — HTTP push on save.** The same OGLight mod auto-POSTs the identical envelope to
  `POST /import` whenever OGLight persists. OGLight funnels all writes through one place —
  `GM_setValue(this.DBName, JSON.stringify(this.db))` ([oglight.js:590](../vendor/oglight.js))
  behind the `pendingSave` flag — so the hook is a single fire-and-forget call there. No button
  click, no clipboard: capture becomes continuous and automatic as you play. Server must treat
  these as idempotent (envelope `id` = content hash dedups identical saves) and be ready for
  frequent partial saves — which the merge model already handles.

Adapter defensiveness: even though the envelope is clean, the import boundary should tolerate stray
DOM/circular values (strip non-plain values) so a hand-built or future payload can't break ingest.

### Adapter consequences (locked)

- **Research is account-scoped, not per-planet.** The adapter reads research IDs from any one
  `myPlanets` entry and emits `account/research/{key}` facts once — do **not** fan research out
  per celestial (the per-planet copies are redundant).
- **Identity holds perfectly:** key celestials by their `myPlanets` id; `coords` is a mutable
  attribute. Moons are first-class `myPlanets` entries.
- **Catalog is bootstrapped from the payload itself** (`serverData`), not a hand-maintained table —
  though we still keep canonical keys so the model is stable across languages.
- **`lastRefresh` gives a real per-celestial `observedAt`** if we want it later; v1 stays
  `importedAt`-only as decided, but the field is there for free when merge correctness matters.

## 3. Capture model: immutable imports → merged projection

**Capture-first principle:** raw imports are the source of truth; current state and history are
**derived and rebuildable** by re-folding the import log. Improving an adapter and re-folding
corrects historical data without re-importing.

```ts
type FactPath = string;
// "celestial/{ogameId}/buildings/metalMine"
// "celestial/{ogameId}/resources/metal/amount"
// "celestial/{ogameId}/coordinates"            value = { galaxy, system, position, type }
// "account/research/energyTechnology"

type Fact = { kind: "set"; path: FactPath; value: Json } | { kind: "tombstone"; path: FactPath }; // e.g. a whole celestial removed

interface Import {
  // one immutable record per paste/push = a "version"
  id: string; // content hash (also dedups identical pastes)
  universeId: string; // e.g. "s251-en"
  accountId: { universeId: string; playerId: string };
  source: "oglight" | "infocomplete";
  sourceVersion: string; // '5.3.3' | '12.0.0'
  transport: "paste" | "http";
  reliability: "owned"; // tiebreaker for intel later
  importedAt: string; // ISO
  schemaVersion: number; // domain-model version, for migrations
  raw: string; // verbatim payload, never destructively re-parsed
  facts: Fact[]; // ONLY what the adapter actually observed
}
```

**Merge rules**

- **Absence = unknown, never zero.** An adapter emits a fact only for fields it observed; a source
  that doesn't report fleet asserts nothing about fleet.
- **Fold** = order imports by `importedAt`; `set` assigns value at path (last-write-wins),
  `tombstone` removes the subtree. Result = merged account/celestial tree (current state).
- **History** = facts grouped by path, ordered by `importedAt` (powers the viewer + analytics).
- **Conflict** = newest `importedAt` wins per path. `reliability` is a future tiebreaker.
- **Tombstones** in v1 are emitted manually (viewer "remove planet") or later auto-derived by
  diffing a full-account roster against current state. No source emits them today.

## 3a. Redundant-save suppression (realtime `POST /import`)

Auto-push-on-save (§2a) fires far more often than state actually changes. Most saves differ only in
**volatile, non-state fields**, so the envelope `id` content-hash alone never matches and every save
would become a transaction. Volatile fields seen in `db`: timestamps (`lastServerUpdate`,
`lastEmpire0/1Update`, `lastUserActivity`, per-celestial `lastRefresh`), UI/cosmetic state
(`options`, `lastPinnedList`, `lastTagUsed`, `page`, `cache.movements`, `previousFleet`), intel
churn (`udb`/`pdb` spy/activity timestamps), and **continuously-ticking resources**
(`metal/crystal/deut/...`). Strategy = two gates + a resource policy:

- **Gate 1 — canonical-hash ingest dedup (cosmetic saves).** Hash the _normalized facts the adapter
  emits_, not the raw envelope (i.e. run the adapter, drop volatile/cosmetic fields, hash the
  result). If the canonical hash equals the last accepted one, the save changed nothing meaningful →
  create **no transaction**. Removes the large majority of redundant saves.
- **Gate 2 — fact-level diff vs projection (partial no-ops).** Even when something changed, most
  paths didn't. Make the fold engine's per-path comparison the transaction boundary: an incoming
  `set` fact becomes a history/projection write **only if its value differs from current state**. An
  import with zero changed paths writes zero transactions. (Falls out of the existing merge engine.)
- **Resource policy (the continuous-data fork).** Resources change every save, so under Gate 2 they
  would always count as "changed" and defeat suppression. Treat them as **continuous facts** stored
  as `{ amount, observedAt, prod }`, and only write a new transaction when (a) the production **rate**
  changes (mine/plant built, item/officer expired), or (b) the actual amount **deviates from the
  predicted** `amount + prod·Δt` beyond a threshold (fleet landed, raid, manual spend). Routine
  ticking becomes a no-op; real events are still captured.

**Raw-log vs transactions.** Keep the raw import log append-only and cheap (NDJSON) — the gates
suppress _fact transactions_ (history/projection writes), **not** raw logging. This preserves the
"raw is the source of truth, projection is re-foldable" property while keeping history and the
viewer free of redundant revisions. (Alternative — drop at ingest when the canonical hash is
unchanged — is leaner on disk but loses the "saved at T, no change" audit trail; default to logging
raw.)

## 4. Domain model (read model / merged projection)

- **Universe** — id, name, lang, domain, server config (speeds, …) from OGLight `serverData`.
- **Account** — id, player name, class, research (account-wide), celestials[].
- **Celestial** (Planet | Moon) — internal id, type, name, coordinates, fields {used,max},
  temperature, diameter, resources, buildings, fleet, defense, lifeform.
- **Resources** — metal, crystal, deuterium, energy (+ food/population/darkmatter where relevant):
  amount, storage, production.
- **Buildings** — supplies + facilities, level per canonical key.
- **Research** — account-wide, level per canonical key.
- **Fleet / Defense** — count per canonical key.
- **Lifeform** — type, buildings, research (extensible).

**Identity**

- `UniverseId` — server id, e.g. `"s251-en"`.
- `AccountId` — `{ universeId, playerId }` (OGame internal player id).
- `CelestialId` — `{ accountId, ogameId, type }` (OGame internal planet/moon id).
- `Coordinates` — `{ galaxy, system, position, type }` — mutable attribute, not identity.

**Catalog** (static reference) — canonical keys for buildings/ships/research/defense, plus
per-source id maps (OGame numeric id ↔ key, InfoCompte numeric id ↔ key, OGLight key ↔ key).
Later: base costs/stats for analytics.

## 5. Packages & layout

```
packages/core/                     # single, isomorphic, pure TS, zod, ESM
  src/
    model/        domain types + zod schemas (entities, ids, Import, Fact)
    catalog/      canonical keys + per-source id maps (+ costs later)
    identity/     id build/parse, coordinate parsing
    facts/        FactPath builders, fold/merge engine, history grouping
    adapters/
      detect.ts         sniff format from raw payload (clipboard auto-route)
      oglight.ts        OGLight db JSON      -> Import
      infocomplete.ts   InfoCompte structured JSON -> Import (text = fallback)
      index.ts          registry: source -> adapter; parse(raw, hint?) -> Import
    index.ts

apps/web                           # viewer + import dialog (client-side parse, preview)
apps/api                           # POST /import (reuses core adapters) + read endpoints
apps/mcp (later)                   # read + analytics tools over the projection
```

Constraint: `packages/core` must be **isomorphic** (no node-only or browser-only APIs) so the web
app (client parse), the API (HTTP-push parse), and the future MCP app all import it.
`pnpm-workspace.yaml` must add `packages/*` (currently only `apps/*`).

## 6. Capture pipeline

```
OGLight "copy" button (or console copy() snippet) -> clipboard: { DBName, server, account, db }
  -> paste into web import dialog (textarea / clipboard read)
  -> detect(raw) -> source
  -> adapters[source].parse(raw) -> Import { facts[] }     (zod-validated; tolerant of stray DOM/circular)
  -> [client preview]
  -> POST /import
  -> append to immutable import log
  -> fold -> update merged projection (current state) + field history
  -> viewer / MCP read
```

The future OGLight HTTP push skips the clipboard and hits the same `POST /import` with the same
envelope and adapters. See §2a "Capture envelope & method" for the exact shape and the copy snippet.

## 7. Storage seam (deferred — separate task)

- `imports.ndjson` — append-only log of `Import` records (source of truth).
- `latest.json` (lowdb) — materialized merged projection, rebuildable by re-folding the log.
- Partitioned per universe/account.

## 8. Deferred / not blocking

- Storage internals (lowdb + NDJSON specifics).
- MCP tool surface, computed analytics, cost catalog.
- Intel-on-others (galaxy/espionage) + reliability tiers.
- InfoCompte text-export fallback adapter.
- Tombstone emission UX / auto-derivation from full-account rosters.
- Lifeform depth.
- Redundant-save suppression (§3a) — only needed once realtime auto-push lands; threshold values
  for the resource-deviation policy to be tuned then.

# OGame Agent — Reports & History (design note)

Status: **investigation / agreed direction**. Derives from [architecture.md](architecture.md)
(§3 capture model, §7 storage seam, §8 deferred intel) and the storage deep-dive. Scope: presenting
**historical data** (score, production over time) and capturing **espionage & combat reports** to
support reporting and raiding-target selection. API/storage details are continued in
[capture-api-and-storage.md](capture-api-and-storage.md).

## 1. Goals

1. **History views** — track values over time per universe/account (e.g. score, mine production /
   building levels, resources).
2. **Report capture** — ingest espionage and combat reports as immutable point-in-time events, to
   power reporting and raiding-target ranking.

The two goals share almost no machinery: history falls out of the existing fact/fold model; reports
need a **new event store** that deliberately bypasses the fold.

## 2. The capture hook: OGLight, not PTRE, not InfoCompte

### InfoCompte — not a source

No report parsing (incidental matches only in [`vendor/infocomplete.js`](../vendor/infocomplete.js)).
Ignore for this phase.

### PTRE-hijack (`/etc/hosts`) — works, but the worst option

PTRE (`class PTRE`, [oglight.js:12906](../vendor/oglight.js)) is the wrong interception point:

| Call                                              | Endpoint                             | Payload                              | Raiding value                                    |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------ |
| `postSpyReport` ([:13052](../vendor/oglight.js))  | `oglight_import.php`                 | **just `sr_id` (the `sr-…` key)**    | ✗ — a _pointer_; PTRE resolves the report itself |
| `postActivities` ([:13013](../vendor/oglight.js)) | `oglight_import_player_activity.php` | counter-spy activity (who spied you) | partial                                          |
| `postPositions` ([:13004](../vendor/oglight.js))  | `api_galaxy_import_infos.php`        | galaxy scan positions                | partial                                          |

Three problems:

1. **Carries the key, not the content.** `postSpyReport(message.api)` sends only `sr_id` — you'd
   capture `sr-…` and still have to call Gameforge's report API to get loot/fleet/def, when OGLight
   _already parsed the full report_ one function earlier.
2. **TLS breaks.** PTRE uses plain `fetch()` to `https://ptre.chez.gg/…`
   ([:12942](../vendor/oglight.js)), not `GM_xmlhttpRequest`. An `/etc/hosts` redirect fails cert
   validation (and CORS) unless you stand up a locally-trusted HTTPS cert.
3. **Reverse-engineering PTRE's wire format** instead of reading OGLight's clean in-memory objects.

### OGLight's `MessageManager` — the actual source

`readMessagesData()` ([oglight.js:8106](../vendor/oglight.js)) runs on the messages page and
dispatches per tab to parsers that extract the **complete** report from each message's
`rawData.dataset`:

- **Spy** — `readSpyData` ([:8187](../vendor/oglight.js)) builds the raiding payload and
  **persists** it to its own store `DBName + '_messages'`. Key fields include coordinates, target
  player/status/type/activity, resources, loot waves, fleet/defense/tech maps, value totals, hidden
  fleet/defense flags, and attack state
  ([:7993](../vendor/oglight.js), [:7998](../vendor/oglight.js)).
- **Combat** — `readCombatData` ([:8387](../vendor/oglight.js)): `fleets, rounds, result`, loot
  `gain{}`, `shipLost{}`, `isAttacker/isDefender/isWinner`, `isOwnPlanet`. **Parsed but NOT
  persisted** — the messageDB cleanup at [:8168](../vendor/oglight.js) only runs for the spy tab, so
  combat is used for stats/spytable then discarded. We must emit it ourselves.
- **Probe-only kills** — `readProbeData` ([:8371](../vendor/oglight.js)).

**Inherent limitation (same as PTRE):** reports are captured only when you visit the messages page
and paginate — OGLight hooks the paginators at [:7976](../vendor/oglight.js). This is pull-on-visit,
unlike the empire envelope which can auto-push on every save.

## 3. Recommended capture path

A small OGLight mod — the same userscript surface Phase 5 already calls for. Two fire-and-forget
hooks via `GM_xmlhttpRequest` (already granted, [:13](../vendor/oglight.js)) to dodge the CORS/TLS
wall the PTRE-hijack hits:

- **Spy:** at the end of `readSpyData`, where it does `this.messageDB[message.id] = message`
  ([:8275](../vendor/oglight.js)) — POST the `message`.
- **Combat:** at the end of `readCombatData` ([:8387](../vendor/oglight.js)) — POST it (OGLight never
  stores it).

Envelope mirrors the existing one (architecture §2a):

```js
{ DBName, server, account:{ id, name, class, rank, lang }, report:{ kind:'espionage'|'combat', ...message } }
```

POSTs to a new `POST /api/report`, with `/report` as the userscript-friendly root alias (mirroring
`/api/import` + `/import`). A batch alternative is to hook `saveMessagesDB()`
([:7998](../vendor/oglight.js)) and flush the whole `_messages` store, but per-report-on-parse is
simpler and is the only way to catch combat.

## 4. Storage & architecture fit

Reports are **immutable events**, not mutable state — so they must bypass `ImportStore.ingest()`,
which runs `filterMeaningfulFacts` + fold + last-write-wins ([storage.ts:193](../apps/api/src/storage.ts)).
A report is never "updated"; LWW has nothing to do, and folding reports into `latest.json` (loaded
whole into memory on every read, [:163](../apps/api/src/storage.ts)) would bloat it for no benefit.

Concrete shape for this repo:

1. **New event store, parallel to imports.** A Drizzle-managed SQLite database in the same data root,
   partitioned by `universe/account` columns rather than by folding into `latest.json`. New
   `POST /api/report`/`/report` endpoint and `ReportStore` class — does **not** touch `ingest`/fold
   for ordinary report persistence.
2. **New adapter + schema.** Add a report adapter plus a separate `reportSchema` in `packages/core`.
   The adapter returns a `ReportEvent` plus optional derived own-account facts. Only widen
   `importSourceSchema` ([import.ts:8](../packages/core/src/model/import.ts)) when derived report
   facts are actually fed into the existing fold.
3. **Espionage = intel-on-others = the deferred §8 layer.** Keyed by coordinates, target UID, and
   observation time; not folded into the own-empire projection. This is where `reliability`
   ([import.ts:15](../packages/core/src/model/import.ts)) finally matters: `owned` (your planet,
   from the envelope) vs `spied` (a report). Two reports on the same coords are two observations,
   not one merge.
4. **Reports may emit facts as a side-effect.** A combat report on _your own_ planet (`isOwnPlanet`,
   [:8397](../vendor/oglight.js)) legitimately produces fleet-loss / resource facts into the existing
   fold. The event is the source; facts are derived. That is the only crossover — keep the projection
   small.
5. **SQLite + Drizzle is justified here** (not for the envelope). Spy probes are spammy (tens of
   thousands of compact events) and raiding queries are inherently indexed ("best loot in g:s since
   T", "all reports on player Y"). Use Drizzle migrations in `apps/api`; `packages/core` stays
   isomorphic. Raw report retention is configurable (`full`, `hash-only`, `none`) so development can
   keep replay data while a stable install can save space.

This phase is also the natural moment to start capturing `db.udb`/`db.pdb` (currently ignored by the
adapter, architecture §2a/§8). `udb` carries other players' score + rankings + planet rosters +
activity — the core raiding-target dataset, which pairs directly with espionage reports.

## 4a. Report data model

Use Drizzle as the schema/migration layer over SQLite. The database is an application-owned query
store for report/intel data; the existing fact/fold files remain the own-empire projection path.

### `report_events`

One row per captured OGLight message report. This is the durable normalized event.

| Column                 | Notes                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `id`                   | Stable content/source hash; primary key.                                   |
| `universe_id`          | e.g. `s1-en`; indexed with `owner_player_id`.                              |
| `owner_player_id`      | The local account that captured the report.                                |
| `kind`                 | `espionage`, `combat`, or `probe`.                                         |
| `source`               | v1: `oglight-message`.                                                     |
| `source_version`       | OGLight version when available.                                            |
| `source_message_id`    | OGLight message id when available; indexed for dedup/debug.                |
| `api_key`              | `sr-...`/combat API key when OGLight exposes it.                           |
| `captured_at`          | Server receive time.                                                       |
| `observed_at`          | Report observation/message time when parseable; otherwise `null`.          |
| `raw_hash`             | Always stored.                                                             |
| `raw_retention`        | `full`, `hash-only`, or `none`.                                            |
| `coords_g/s/p/type`    | Target coordinates; nullable for weird/probe-only cases.                   |
| `target_player_uid`    | Future join to `udb` if known; nullable in v1.                             |
| `target_player_name`   | Name parsed from the report.                                               |
| `target_player_status` | Status letters when present.                                               |
| `target_activity`      | Activity marker / minutes when present.                                    |
| `target_is_active`     | OGLight boolean if available.                                              |
| `target_type`          | Planet/moon/debris/etc. as OGLight reports it.                             |
| `age_seconds`          | Report age if OGLight parsed it.                                           |
| `is_own_planet`        | Combat crossover flag; false/null for most espionage.                      |
| `is_attacker`          | Combat perspective flag.                                                   |
| `is_defender`          | Combat perspective flag.                                                   |
| `is_winner`            | Combat result flag.                                                        |
| `result`               | Combat result text/code.                                                   |
| `loot_metal`           | Query-fast loot/resource columns.                                          |
| `loot_crystal`         | Query-fast loot/resource columns.                                          |
| `loot_deuterium`       | Query-fast loot/resource columns.                                          |
| `gain_metal`           | Combat gain/plunder when this event is a raid result.                      |
| `gain_crystal`         | Combat gain/plunder when this event is a raid result.                      |
| `gain_deuterium`       | Combat gain/plunder when this event is a raid result.                      |
| `fleet_value`          | Espionage fleet value when available.                                      |
| `defense_value`        | Espionage defense value when available.                                    |
| `hidden_fleet`         | OGLight hidden-fleet flag.                                                 |
| `hidden_defense`       | OGLight hidden-defense flag.                                               |
| `is_attacked`          | OGLight says target is already under attack.                               |
| `created_at`           | Row creation time; mostly same as `captured_at`, useful for DB inspection. |

Primary query patterns:

- **Ripe-target search:** "all planets in G5 systems 100-200 where the latest/recent report shows
  more than 30 large-cargo worth of metal+crystal+deuterium in the last week." Store M/C/D and
  compute LC/SC-equivalent dynamically from current cargo capacity.
- **Raid-area recap:** "areas I raided yesterday", grouped from combat/raid events back into compact
  ranges like `G1 100-172, 350-390` and `G3 250-300`.
- **Fast-day target list:** "top 20 inactive planets I have earned from, sorted by MSU." This joins
  historical combat gains with latest inactive/espionage intelligence and ranks by normalized value.
- **Target history:** all reports for one coordinate/player over time.

These are mostly coordinate/time/loot queries. Deep item details (buildings, fleet, lifeform) are
loaded after selecting candidate reports, not used as the primary index path. Store base M/C/D
amounts; compute raw totals, MSU, LC-equivalent, SC-equivalent, or other ranking formulas at query
time so value definitions can evolve.

Suggested indexes:

- unique `id`.
- unique-ish dedup helper on `(universe_id, owner_player_id, kind, source_message_id)` where
  `source_message_id` is not null.
- `(universe_id, owner_player_id, kind, captured_at desc)` for recent report lists.
- `(universe_id, coords_g, coords_s, coords_p, coords_type, observed_at desc)` for target history.
- `(universe_id, owner_player_id, coords_g, coords_s, observed_at desc)` for galaxy/system-window
  searches.
- `(universe_id, owner_player_id, kind, observed_at desc)` plus query-time ordering expressions over
  `loot_metal`, `loot_crystal`, and `loot_deuterium` for raiding candidates.
- `(universe_id, owner_player_id, kind, coords_g, coords_s, observed_at desc)` plus query-time
  ordering expressions over loot M/C/D for "ripe targets in this galaxy/system range" queries.
- `(universe_id, owner_player_id, kind, observed_at desc)` plus query-time ordering expressions over
  `gain_metal`, `gain_crystal`, and `gain_deuterium` for "earned from" combat/raid rankings.
- `(universe_id, target_player_uid, observed_at desc)` once `udb` capture exists.

### `report_payloads`

Optional raw payload table. Keeping raw outside `report_events` keeps the hot query table narrow and
makes retention easy.

| Column      | Notes                                                    |
| ----------- | -------------------------------------------------------- |
| `report_id` | Primary key and foreign key to `report_events.id`.       |
| `raw_json`  | Verbatim request body, only when `raw_retention = full`. |
| `stored_at` | Timestamp for retention cleanup/debugging.               |

When retention is `hash-only` or `none`, no payload row is written. `raw_hash` on `report_events`
still supports dedup/debug identity.

### `report_resources`

Normalized resource observations. Espionage reports use this for target resources; combat can use it
for gains/losses if we want more detail than the query-fast columns.

| Column      | Notes                                                    |
| ----------- | -------------------------------------------------------- |
| `report_id` | Foreign key.                                             |
| `scope`     | `target`, `loot`, `gain`, or `loss`.                     |
| `resource`  | `metal`, `crystal`, `deuterium`, or future resource key. |
| `amount`    | Integer amount.                                          |

Primary key: `(report_id, scope, resource)`.

### `report_details`

Structured JSON for OGLight's parsed variable-detail blocks. This is the right default for report
details because we do not expect queries like "all planets where metal mine > 35"; we mostly need to
load reports over a time range, then compare the reported buildings/fleet/defense/tech details in
application code.

| Column      | Notes                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| `report_id` | Foreign key.                                                               |
| `json`      | Normalized detail object for fleet/defense/tech/buildings/lifeform/combat. |
| `schema`    | Detail schema version for future parser changes.                           |

Suggested JSON shape:

```ts
type ReportDetails = {
  espionage?: {
    fleet?: Record<string, number>;
    defense?: Record<string, number>;
    techs?: Record<string, number>;
    buildings?: Record<string, number>;
    lifeformBuildings?: Record<string, number>;
    lifeformResearch?: Record<string, number>;
  };
  combat?: {
    gain?: Record<string, number>;
    shipLost?: Record<string, number>;
    fleets?: unknown;
    rounds?: unknown;
  };
};
```

`report_events` keeps the columns needed to find the relevant time window quickly: universe/account,
kind, target coordinates/player, observed/captured time, loot totals, values, and flags. Once the
candidate reports are selected, the app can load their `report_details.json` and compute deltas such
as "fleet changed between two probes" or "building levels moved over time".

This keeps ingest simple, avoids a wide or noisy name/value table, and preserves room for OGLight's
detail shape to evolve. If a real indexed query appears later, promote that one detail to a column or
add a focused extract table.

### `report_components` (deferred)

A generic name/value table is only worth adding if we need item-key filtering across many reports,
for example "targets with at least N recyclers" or "reports where plasma technology >= 12".

| Column      | Notes                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| `report_id` | Foreign key.                                                                      |
| `scope`     | `fleet`, `defense`, `tech`, `building`, `lifeform_building`, `lifeform_research`. |
| `item_key`  | Canonical key when known; otherwise OGLight/raw key.                              |
| `quantity`  | Count/level.                                                                      |
| `value`     | Optional value column for maps where OGLight supplies one.                        |

Combat rounds/fleets can stay in raw payload for v1. If later combat analytics need round-by-round
data, add dedicated `combat_rounds` / `combat_round_components` tables rather than overloading the
summary row or generic component table.

### `report_derived_imports`

Only needed once combat reports emit own-account facts.

| Column       | Notes                                                                 |
| ------------ | --------------------------------------------------------------------- |
| `report_id`  | Foreign key to the source event.                                      |
| `import_id`  | Import id created for derived facts and passed through `ImportStore`. |
| `created_at` | Timestamp.                                                            |

This preserves the rule: the report event is the source; any projection mutation is derived and
traceable.

### Later intel tables

`db.udb`/`db.pdb` should not be squeezed into `report_events`. Model them as separate observation
streams:

- `intel_player_snapshots`: player UID, name, status, score/rank fields, alliance, observed time,
  source import id/hash.
- `intel_celestial_snapshots`: coords, player UID, planet id/moon id when known, activity/debris/home
  flags, observed time, source import id/hash.

Raiding queries then join latest intel snapshots to latest espionage reports by player UID and/or
coordinates.

## 5. History: what's free vs. what needs work

- **Mine production / building levels / resources over time — already captured.** Fold groups facts
  by path into history, exposed via `getHistory` ([storage.ts:183](../apps/api/src/storage.ts)).
  Charting `celestial/{id}/buildings/metalMine` history (level → derived production) or the resource
  production facts is a **viewer-only** feature — no new capture. Cheapest, highest-value first ship.
- **Score over time — partially captured already.** The OGLight adapter emits `account/rank`
  ([oglight.ts](../packages/core/src/adapters/oglight.ts)), so rank folds into history when an import
  is accepted. Caveats:
  - Suppression treats `account/rank` as volatile; rank-only saves are dropped and rank only rides
    along with another meaningful import. Reliable standalone score history needs either a dedicated
    score capture path or a suppression exception.
  - The score _breakdown_ (economy/research/military/honor) isn't in the base envelope — it comes
    from the highscore API (`players.xml`, which OGLight already fetches at [:2670](../vendor/oglight.js)).
    Capturing the breakdown needs a highscore fetch in the mod.
  - _Other players'_ scores for target-ranking live in `db.udb` — part of the intel layer (§4 item 3),
    not own-empire history.

## 6. Suggested sequencing

1. **History viewer** (no capture changes): chart existing fact history for mine levels,
   production, resources, and opportunistic rank observations. Decide separately whether rank-only
   saves should be admitted for a true score tracker.
2. **Report capture spine:** `ReportStore` + `POST /api/report`/`/report` + report adapter (events
   and optional own-planet facts), fed by the OGLight mod (§3).
3. **Intel layer:** capture `udb`/`pdb`, wire `reliability` tiers, join espionage reports + udb for
   raiding-target ranking. Migrate reports to SQLite when query needs arrive.

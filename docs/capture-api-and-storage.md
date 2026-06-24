# OGame Agent - Capture API & Report Storage

Status: **design draft**. Derives from [architecture.md](architecture.md) and
[reports-and-history.md](reports-and-history.md). Scope: the first server-side shape for capturing
espionage/combat reports from the OGLight mod, storing them as immutable Drizzle/SQLite events, and
keeping the existing own-empire fact/fold projection small.

## 1. Current code reality

The API already has a capture-first import path:

- `POST /api/import` and `/import` parse an OGLight envelope through `packages/core`, then call
  `ImportStore.ingest()` ([app.ts](../apps/api/src/app.ts)).
- `ImportStore` partitions data by `universeId/playerId`, appends accepted imports to
  `imports.ndjson`, and materializes `latest.json` from the folded log
  ([storage.ts](../apps/api/src/storage.ts)).
- Suppression intentionally drops `lastRefresh`-only and `account/rank`-only saves
  ([suppression/index.ts](../packages/core/src/suppression/index.ts)). Rank is captured, but it is
  only recorded when it rides along with another meaningful accepted import.

Report capture should reuse the partitioning, path hardening, and API alias pattern, but it should
not reuse `ImportStore.ingest()` for ordinary report persistence.

## 2. Inbound envelope

The OGLight mod should POST one parsed report at a time:

```ts
type ReportEnvelope = {
  DBName?: string;
  server?: { id?: string | number; lang?: string; name?: string };
  account?: {
    id?: string | number;
    name?: string;
    class?: string | number;
    rank?: string | number;
    lang?: string;
  };
  report: {
    kind: "espionage" | "combat" | "probe";
    id?: string;
    api?: string;
    [key: string]: unknown;
  };
};
```

Identity follows the same rule as OGLight imports: derive `{ universeId, playerId }` from `DBName`
first, then from `server + account`. The request body is stored verbatim as `raw`.

Recommended endpoints:

- `POST /api/report` - canonical API route.
- `POST /report` - root alias for the userscript, matching `/import`.

Both routes accept the envelope as JSON text and return a small ingest result:

```json
{
  "ok": true,
  "deduped": false,
  "id": "report_...",
  "kind": "espionage",
  "universeId": "s1-en",
  "accountId": { "universeId": "s1-en", "playerId": "100000" },
  "derivedFactCount": 0
}
```

## 2a. Raw retention policy

Raw report retention should be configurable. Espionage and combat reports are much more stable than
the large OGLight empire envelope, so keeping every raw report forever is useful during development
but should not be mandatory once the parser and schema settle.

Recommended setting:

```ts
type ReportRawRetention = "full" | "hash-only" | "none";
```

- `full` - store the verbatim request body in `ReportEvent.raw`. Best during development, parser
  work, and sample collection.
- `hash-only` - store `rawHash` and the normalized summary/facts, but not the full raw payload. This
  keeps dedup/debug identifiers while saving most space.
- `none` - store only the normalized event. Use only after the report parser is stable enough that
  rebuild-from-raw is no longer valuable.

Default to `full` while the feature is experimental. Later, expose it as an environment setting, for
example `OGAME_REPORT_RAW_RETENTION=full|hash-only|none`.

## 3. Core report model

Add a separate report model instead of widening `Import` for reports:

```ts
type ReportKind = "espionage" | "combat" | "probe";

type ReportEvent = {
  id: string;
  universeId: string;
  accountId: { universeId: string; playerId: string };
  kind: ReportKind;
  source: "oglight-message";
  sourceVersion: string;
  transport: "http";
  schemaVersion: number;
  capturedAt: string;
  observedAt?: string;
  raw?: string;
  rawHash: string;
  summary: ReportSummary;
  facts: Fact[];
};
```

`summary` is the query-friendly, stable subset. `rawHash` is always stored. `raw` is stored only when
the raw retention policy allows it.

For espionage:

- target coordinates and target type.
- target player name/status when present.
- resources and loot.
- fleet/defense/tech maps as OGLight parsed them.
- hidden fleet/defense flags.
- OGLight message id / `api` key when present.

For combat:

- result, winner/attacker/defender flags.
- gains/losses.
- own-planet flag.
- rounds/fleets in raw only for v1 unless a query needs them.

For probe-only kills:

- treat as `kind: "probe"` so the event is not lost, even if it has little raiding value.

The first implementation should validate this model with zod in `packages/core`, but keep it
isomorphic: no filesystem, SQLite, or Hono dependencies in core.

## 4. Deduplication

Messages are re-read when the user revisits or paginates the message page, so report ingest must be
idempotent.

Recommended id:

```ts
contentHash(
  JSON.stringify({
    universeId,
    playerId,
    kind,
    sourceMessageId: report.id ?? report.api ?? null,
    rawHash: contentHash(raw),
  }),
);
```

If OGLight supplies a stable `message.id`, duplicates collapse even if captured later. If not, the
raw hash keeps exact repeats from growing the log.

Dedup happens per account partition, before append.

## 5. Storage layout

Keep report capture parallel to imports, but use Drizzle-managed SQLite for reports instead of
folding them into `latest.json`:

```text
data/
  s1-en/
    100000/
      imports.ndjson
      latest.json
  reports.sqlite
  drizzle/
    ...
```

The initial database schema is described in
[reports-and-history.md §4a](reports-and-history.md#4a-report-data-model). `report_events` is the
durable normalized event table; `report_payloads` is optional and controlled by raw retention;
`report_resources` holds resource observations; `report_details` stores variable fleet/defense/
tech/building/lifeform detail maps as structured JSON.

`ReportStore` responsibilities:

1. Resolve and harden the same partition path style used by `ImportStore`.
2. Parse/validate the raw report envelope through the core report adapter.
3. Apply the configured raw retention policy.
4. Insert the normalized event through Drizzle, using `id`/source-message uniqueness for dedup.
5. Optionally feed derived own-account facts into `ImportStore`.
6. List/query report events for early UI work.

Initial read API:

- `GET /api/accounts/:universeId/:playerId/reports?kind=espionage&limit=100`
- `GET /api/accounts/:universeId/:playerId/reports/:reportId`

These should query Drizzle/SQLite. They should return summaries by default and include raw only
behind `?raw=1` when raw was retained.

## 6. Derived facts

Most reports are intel-on-others and should not enter the own-account projection.

The only v1 crossover is a combat report that OGLight marks as `isOwnPlanet`. For those, the report
adapter may emit facts, and the API can write them as a derived import:

- event is appended to `reports-YYYY-MM.ndjson` first.
- derived facts are ingested through `ImportStore` second.
- the derived import should use `source: "report"` once `importSourceSchema` is widened.
- reliability remains `"owned"` for own-account facts; `"spied"` belongs to the future intel model,
  not to the current own-empire projection.

For the first capture spine, it is acceptable to store reports with `facts: []` and defer derived
combat facts until we have real samples.

## 7. Drizzle migrations

Report storage should start with SQLite through Drizzle, not a handwritten SQL layer.

Recommended stack in `apps/api`:

- `drizzle-orm`
- `drizzle-kit`
- `better-sqlite3` initially

Keep Drizzle and the SQLite driver out of `packages/core`; core owns schemas/parsing only.

SQLite is the default install path. Postgres can remain a future option if the app becomes
multi-user or remote, but the first schema should avoid unnecessary SQLite-only tricks so the
Drizzle model can be ported later.

If raw retention is `full`, parser bugs can be repaired by reparsing `report_payloads.raw_json` into
new summary/component rows. If retention is `hash-only` or `none`, Drizzle migrations can still
evolve the normalized schema, but original OGLight payloads are no longer available for reparsing.

## 8. Implementation sequence

1. Add `ReportEvent` schemas and an OGLight report parser in `packages/core`.
2. Add Drizzle schema/migrations for `report_events`, `report_payloads`, `report_resources`, and
   `report_details`.
3. Add `ReportStore` in `apps/api`, sharing partition safety with `ImportStore` rather than copying
   it ad hoc.
4. Add configurable raw retention, defaulting to `full`.
5. Add `POST /api/report` and `/report` with e2e tests for insert, dedup, retention modes, and
   invalid payloads.
6. Add Drizzle-backed report list/read endpoints for a minimal viewer.
7. Wire the OGLight mod hooks and capture real samples.
8. Decide whether combat own-planet facts are worth deriving immediately or after sample review.

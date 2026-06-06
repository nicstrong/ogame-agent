# OGame Agent

Capture [OGame](https://www.ogame.gameforge.com) account data over time and serve it two ways: a
**viewer** (current state + history) and, later, an **MCP server** exposing read + analytics tools.

Data is captured by copy-pasting an [OGLight](https://github.com/igoo-OGL/OGLight) export into the web
import dialog (a future version will let a modified OGLight POST automatically). Raw imports are the
source of truth; current state and per-field history are **derived and rebuildable** by re-folding the
import log.

See [`docs/architecture.md`](docs/architecture.md) for the data model and
[`docs/implementation-plan.md`](docs/implementation-plan.md) for the phased build.

## Layout

```
packages/core   isomorphic TS: domain model, OGLight adapter, fact/fold engine (zod)
apps/api        Hono server: POST /import, append-only NDJSON log, lowdb projection, read endpoints
apps/web        React + shadcn viewer + import dialog
```

## Prerequisites

- Node 20+ and [pnpm](https://pnpm.io) 10+
- This repo uses [Vite+](https://viteplus.dev) (`vp`) for build/test/lint.

## Run

Install, then start **both** servers (the web app proxies `/api` → the API on `:3001`):

```bash
pnpm install
pnpm dev          # runs api (:3001) and web (:3000) together
```

Or run them separately:

```bash
pnpm --filter @ogame-agent/api dev    # http://localhost:3001
pnpm --filter @ogame-agent/web dev    # http://localhost:3000
```

Open http://localhost:3000 and use **Import…** to paste an OGLight export.

## Data

The API stores everything under `./data/` (relative to where the API process starts), partitioned per
`universe/account`, as an append-only `imports.ndjson` plus a materialized `latest.json`. Override the
location with `OGAME_DATA_DIR`. The `data/` directory is gitignored — your account data is never
committed.

## Develop

```bash
pnpm exec vp test     # run all tests
pnpm exec vp check    # format, lint, type-check
```

## `vendor/` (not included)

The design references the third-party userscripts **OGLight** and **InfoCompte** for provenance.
They are not redistributed here (`vendor/` is gitignored). To follow the source references in
`docs/architecture.md`, place `oglight.js` / `infocomplete.js` under `vendor/` locally.

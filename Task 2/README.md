# Task 2 — Usage Admin Console

React + Tailwind + Recharts admin UI for browsing account usage and editing per-account settings.

## Run (submission)

1. Build and push the frontend image, then put its name in `docker-compose.yml`:
   ```
   docker build -t YOUR_DOCKERHUB_USER/callzo-task2-frontend:1.0.0 .
   docker push YOUR_DOCKERHUB_USER/callzo-task2-frontend:1.0.0
   ```
2. `docker compose up` then open http://localhost:3000 (API health: http://localhost:8001/health).

The browser only talks to `/api/*` on the same origin; nginx proxies that to
`http://mock-api:8001`, so no API host is baked into the JS and no CORS is needed.

## Local development

- Mock API: official image (`docker compose up mock-api`), or
  `docker compose -f docker-compose.local.yml up --build` which builds a stand-in API
  from `mock-api/` (dev only, for machines where the official image will not run).
- Frontend: `npm ci && npm run dev` (Vite proxies `/api` to http://localhost:8001; override with `API_URL`).

## Design decisions

### State: where it lives and why

| Concern | Location | Why |
|---|---|---|
| Filters, sort, pagination, date range | **URL** (`useSearchParams`) | Shareable, back/forward, survives refresh |
| Selected row ID | **Client** (`useState`) | Survives page changes and background polls |
| Table / summary data | **Server** + short client cache | Mock API is source of truth |
| Settings draft | **Server** (per-step PUT) + local form | Restored on load; rollback on failed save |
| Current form step | **Client** | Pure UI navigation |

### Table + chart

- Server-side search (debounced 300 ms), filters, signup date range, column sorting.
- Date range drives both table and chart without full page reload.
- Poll every 15 s without losing selection (selection is by account ID).
- Summary endpoint fails ~1/5 times by design → chart shows inline error + retry; table stays usable.

### Settings form (4 steps)

- Identity → Plan & billing → Usage caps → Webhook.
- Save step writes to API; free navigation between steps.
- Server `422` errors shown on the correct step/field.
- **Deliberate API quirk:** after step 4 is saved, re-saving step 2 rejects `billing_country`. Form shows the server's message on step 2, keeps all input, and Submit still works with the saved values, so the user is never stuck.
- A failed save never overwrites what the user typed (any step); the step just stays "not saved" with the server's message.

### Accessibility & responsive

- Labels, `aria-*`, keyboard row selection, focus-visible outlines.
- Usable at 375 px (filters wrap, table scrolls horizontally).

## What was cut (and why)

- No Redux/Zustand — URL + hooks is enough.
- No virtualized table — 50 rows/page is fine.
- Explicit Save (not continuous keystroke autosave) — keeps the step-2 quirk predictable.
- No auth UI — mock API does not require it.

## Failure behavior

| Failure | UI |
|---|---|
| Accounts fetch error | Error + Retry |
| Summary 500 (random) | Chart-only error + Retry |
| Settings load error | Full-page error |
| Step validation 422 | Field errors on the correct step; input kept |
| Submit incomplete | Server message listing missing steps |

## Project layout

```
task2/
  mock-api/          # Local API matching Task2_spec.md (amd64-friendly)
  src/
    components/
    hooks/
    lib/
    pages/
  Dockerfile
  docker-compose.yml
```

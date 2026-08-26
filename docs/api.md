# HTTP API (summary)

Base: `http://127.0.0.1:7420` (local only).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Liveness |
| GET/POST | `/api/agents` | List / create |
| PATCH/DELETE | `/api/agents/:slug` | Update / delete |
| POST | `/api/agents/:slug/run` | Run (streams via SSE) |
| GET | `/api/workflows` | List routines |
| POST | `/api/workflows` | Create |
| PATCH | `/api/workflows/:slug` | `{ enabled }` |
| DELETE | `/api/workflows/:slug` | Remove |
| POST | `/api/workflows/:slug/run` | Manual run |
| POST | `/api/workflows/record` | Save chat tools as routine |
| POST | `/api/hooks/:path` | Webhook trigger |
| GET | `/api/providers` | Catalog + models |
| PUT/DELETE | `/api/providers/:id` | Set/clear key |
| GET/PUT | `/api/config` | Model, browser, sandbox |
| GET | `/api/browser/status` | Playwright status |
| POST | `/api/browser/install` | Install Chromium |
| GET | `/api/events` | SSE event stream |
| GET | `/api/permissions/pending` | Open asks |
| POST | `/api/permissions/respond` | `{ requestId, decision, rememberSession? }` |

CORS allows local origins including Tauri; methods include **PATCH**.

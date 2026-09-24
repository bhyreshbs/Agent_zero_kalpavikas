# Production Rehost Checklist (audit only; no code changed)

## 1. What must be updated
- `backend/src/server.js`: hard-coded CORS origins `http://localhost:5173` and `https://agent-zero-rvu.vercel.app`. Set `CORS_ORIGIN` to the new frontend URL (no code change needed) or edit the list; drop the old domain if not yours.
- Delete stub files `backend/src/db/supabaseClient.js` and `frontend/src/lib/supabase.js` (empty; the only Supabase refs left in source).
- Optional cleanup: `DEPLOYMENT_VERCEL_SUPABASE.md`, `SUPABASE_NEW_PROJECT_SETUP.md`, `supabase/`, `migrate.ps1`, `backend/rewrite2.js`, SQLite-era `backend/test/*`, `test-sqlite.mjs`, `test_flow.js` (`npm test` fails), `Stitch-Design/`, `*.supabase.backup` env files (old secrets; git-ignored, never commit).
- `TEST TEAM` (team + auth user + 1 game session) still exists in InsForge: remove before the event (not referenced in code).
- `DATABASE_URL`: URL-encode the `@` in the password (`%40`); change `sslmode=require` to `verify-full` to silence the pg warning.
- Rotate the InsForge user API key pasted in chat; use fresh `ADMIN_SECRET` and `DEMO_MODE_SECRET` in production.

## 2. Required environment variables
Backend (Vercel project, root `backend`):
`INSFORGE_URL`, `INSFORGE_API_KEY`, `DATABASE_URL`, `ADMIN_SECRET`, `CORS_ORIGIN` (comma list, no trailing slash), `NODE_ENV=production`, `DB_POOL_MAX` (1-3; InsForge max_connections=30), `DEMO_MODE_ENABLED=false`, `GAME_DURATION_SECONDS`, `MAX_RECOVERIES`, `INITIAL_LIVES`, `RECOVERY_WINDOW_SECONDS`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_JSON_MODE`.
Optional: `SECURE_MODE_ENABLED`, `FULLSCREEN_REQUIRED`, `VIOLATION_COOLDOWN_SECONDS`, `GEMINI_*`, `GROQ_*`. `PORT` is unused on Vercel.
Frontend (Vercel project, root `frontend`): `VITE_API_BASE=https://<backend-domain>/api` (build-time; redeploy after changing). No other vars.
Local `backend/.env` has `NODE_ENV=development` and `DEMO_MODE_ENABLED=true`: do not copy those to Vercel.

## 3. URLs to change
- `VITE_API_BASE`: new backend URL + `/api` (currently `/api` dev proxy).
- `CORS_ORIGIN`: new frontend URL.
- `server.js` line ~26: old `agent-zero-rvu.vercel.app`.
- InsForge base `https://9ccec64b.ap-southeast.insforge.app` stays if the same project is reused.
- Remaining localhost refs are dev-only: `vite.config.js` proxy, `server.js` dev listen log.

## 4. Vercel settings
- Backend: root `backend`, `vercel.json` (`@vercel/node`, catch-all to `src/server.js`), no build command. App is default-exported and `listen` is skipped when `NODE_ENV=production`. Health: `/api/health`. `trust proxy` = 1.
- Frontend: root `frontend`, Vite preset, build `vite build`, output `dist`, SPA rewrite in `frontend/vercel.json`. Local build passes (only a >500 kB chunk warning).

## 5. InsForge settings
- Project Agent-Zero (appkey `9ccec64b`), 3 migrations applied; RLS on all 7 tables.
- Auth: email verification OFF, public sign-up disabled (backend registers via admin key), password min 6.
- Data (last verified): 45 real teams + TEST TEAM, 126 members. Re-verify counts before launch.
- Admin access is via `ADMIN_SECRET` header, not an InsForge user.
- Known limits: refresh tokens not revoked on logout; admin reset-password uses a relink workaround.

## 6. Pre-deployment tests
1. Frontend build (done, passes). 2. Backend syntax check and production-mode import of `server.js` (done, passes).
3. Deploy backend; GET `/api/health`. 4. Deploy frontend with `VITE_API_BASE`; no CORS errors in the browser.
5. Team login (mixed-case name), tutorial, a level, leaderboard.
6. `/admin` login and admin actions. 7. `/api/demo/*` returns 404. 8. Concurrent login load test against the 30-connection DB limit.

## 7. Blockers
- No hard blockers. Required before go-live: set `CORS_ORIGIN` and `VITE_API_BASE`, `DEMO_MODE_ENABLED=false`, remove TEST TEAM, rotate leaked key and secrets.
- Risk: each Vercel instance holds up to `DB_POOL_MAX` connections; many instances could reach 30.
- InsForge region is ap-southeast (Singapore), not Mumbai; expect extra latency.

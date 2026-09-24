# Agent Zero — Supabase → InsForge Migration Audit

Status: **audit only.** Nothing has been migrated. No application code, database, or Supabase resource was changed while producing this document. Contains no secret values.

- InsForge project: **Agent-Zero** (`9f225aac-7c0f-4236-bbaf-ba95fb4ceee8`), app key `9ccec64b`, region **ap-southeast**
- API base: `https://9ccec64b.ap-southeast.insforge.app`
- Project state at audit time: **empty** — 0 tables in `public`, 0 functions, 0 users, 0 buckets. Email/password auth is enabled.
- Facts about InsForge below were read from the linked project with the CLI (read-only queries, `docs auth`, `metadata`) and the installed InsForge skills. Anything I could not confirm is marked **VERIFY**.

---

## 1. Current architecture

```
Browser (React/Vite)  ──►  Vercel (frontend project)
   │  fetch /api/*
   ▼
Vercel (backend project)  Express (backend/src/server.js)
   ├─ Auth:   @supabase/supabase-js (service role) ──► Supabase Auth
   └─ Data:   node-postgres Pool (DATABASE_URL, transaction pooler :6543) ──► Supabase Postgres
```

- **Frontend** never talks to the database. It calls only the Express API (`VITE_API_BASE`). It uses `@supabase/supabase-js` (anon key) **only as a session store**: `setSession()` after login, `getSession()` inside `getToken()` (auto-refresh), `signOut()`, and `isLoggedIn()` reads the supabase-js localStorage key directly.
- **Team login**: `POST /api/auth/login` → look up `teams` by `team_name` → `supabaseAdmin.auth.signInWithPassword({ email: <slug>@agentzero.internal, password })` → returns `access_token`/`refresh_token` to the browser.
- **Every player request**: `requireTeamAuth` → `supabaseAdmin.auth.getUser(token)` → `SELECT * FROM teams WHERE auth_user_id = $1` → rejects disqualified teams.
- **Admin**: not a Supabase user. `x-admin-secret` header compared with `ADMIN_SECRET` (`requireAdminAuth`). The admin UI keeps the secret in `sessionStorage`.
- **Team creation** (admin): `auth.admin.createUser({ email, password, email_confirm: true })` then `INSERT INTO teams`. **Password reset** (admin): `auth.admin.updateUserById(id, { password })`.
- **Game state**: all in Postgres (`game_sessions` row per team; `level_results`, `security_events`, `audit_log`, `admin_config`). Server-authoritative timer, lives, level, recovery, pause. State polled by the client every 4 s.
- **Postgres role**: the backend connects with the database owner string, which bypasses RLS. RLS only protects direct access with the public anon key.
- **No** Supabase Storage, Realtime, Edge Functions, PostgREST/`supabase.from()` queries, triggers or DB functions are used.

## 2. Target InsForge architecture

```
Browser (React/Vite)  ──►  Vercel (frontend project)
   │  fetch /api/*
   ▼
Vercel (backend project)  Express (unchanged routes)
   ├─ Auth:   InsForge Auth REST/SDK (admin API key, server-only) ──► https://<appkey>.<region>.insforge.app/api/auth/*
   └─ Data:   node-postgres Pool (InsForge direct Postgres URL)  ──► <appkey>.<region>.database.insforge.app:5432/insforge
```

Confirmed InsForge facts that shape the design:

| Item | Finding |
|---|---|
| Postgres | PostgreSQL **15.18**; extensions present: `pgcrypto`, `pg_cron`, `vector`, `http`, `pg_stat_statements` |
| Roles | `anon`, `authenticated`, `project_admin`, `postgres` |
| Auth schema | `auth.users(id uuid, email, password, email_verified, created_at, updated_at, profile jsonb, metadata jsonb, is_project_admin, is_anonymous)`; helper functions `auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()` all exist |
| Direct DB access | `insforge db connection-string` returns a **direct** Postgres URL (`postgres@<appkey>.ap-southeast.database.insforge.app:5432/insforge?sslmode=require`) — **not a pooler** |
| Connection limit | `max_connections = 30` on this instance (**important — see Risks**) |
| Auth settings | email/password on; **`requireEmailVerification = true`**, `disableSignup = false`, password min length 6; OAuth providers github/google listed; SMTP not configured |
| Token model | `POST /api/auth/sessions` (password sign-in) returns `accessToken` (+ `refreshToken` when `client_type` is `server`/`mobile`/`desktop`); `POST /api/auth/refresh`; `GET /api/auth/sessions/current` returns `{user:{id,email,role}}` for a Bearer token; `POST /api/auth/logout` |
| Admin auth endpoints documented | list users, get user, **delete users**, anon token, auth config get/update. **No documented admin "create user without verification" or "set password" endpoint.** |

The Express backend and the Postgres data model stay. Only the identity provider and the connection string change. The browser does not need the InsForge SDK if login/refresh stay proxied through Express.

---

## 3. Supabase dependency inventory

17 tracked files mention Supabase; 4 more frontend files depend on the auth helpers indirectly.

### 3.1 Backend

| File | Purpose | Supabase feature | InsForge replacement | Unchanged? | Effort |
|---|---|---|---|---|---|
| `backend/src/db/supabaseClient.js` | Service-role client used by auth middleware and routes | `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` | `createAdminClient({ baseUrl: INSFORGE_URL, apiKey: INSFORGE_API_KEY })` from `@insforge/sdk`, or plain `fetch` to `/api/auth/*` with the admin key | No (rewrite, ~10 lines) | S |
| `backend/src/middleware/auth.js` (`requireTeamAuth`) | Verifies bearer token → team | `supabaseAdmin.auth.getUser(token)` | `GET /api/auth/sessions/current` with the token (or verify the JWT locally with the project JWT secret — **VERIFY** secret is retrievable via `secrets`). Team lookup by `auth_user_id = user.id` is unchanged. `requireAdminAuth` untouched | Partly | S–M |
| `backend/src/routes/auth.js` | Team login | `auth.signInWithPassword` | `POST /api/auth/sessions?client_type=server` (`method: password`) returns access + refresh tokens. Response shape to the browser must carry both tokens (today it already returns both) | Partly | M |
| `backend/src/routes/admin.js` `POST /teams/create` | Create Auth user + team | `auth.admin.createUser({ email_confirm: true })` | `POST /api/auth/users?client_type=server`. **Requires `requireEmailVerification=false`** (else user gets no session and must verify an `@agentzero.internal` mailbox that does not exist). **VERIFY** whether the admin API key can register users while `disableSignup=true` | Partly | M |
| `backend/src/routes/admin.js` `POST /teams/:id/reset-password` | Admin sets new password | `auth.admin.updateUserById(id,{password})` | **No documented equivalent.** Workaround: create a new user with the same email, `UPDATE teams SET auth_user_id` to the new id, then delete the old user via the admin delete endpoint (order matters: `teams.auth_user_id` is `ON DELETE CASCADE`, deleting first would delete the team and its session). Alternative: InsForge email-reset flow (not usable with fake emails). **VERIFY** for a supported admin password update | No | M–L |
| `backend/src/db/index.js` | `pg.Pool` on `DATABASE_URL`, helpers, `getClient()`, config seeding | Only the URL/host (transaction pooler) | Same code, new `DATABASE_URL` from `db connection-string`. Pool `max` (20) must drop below the 30-connection instance limit; SSL settings re-tested | Yes (config only) | S |
| `backend/src/server.js` | Required-env warning list, CORS allow-list | Names `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Rename to `INSFORGE_URL`, `INSFORGE_API_KEY`. Hard-coded `agent-zero-rvu.vercel.app` origin stays or is removed | Minor edit | S |
| `backend/package.json` | Dependency | `@supabase/supabase-js` | remove; add `@insforge/sdk` if used | — | S |
| `backend/.env.example` | Env template | Supabase names | new names (below) | — | S |
| `backend/src/engine/*`, `routes/game.js`, `routes/leaderboard.js`, `routes/demo.js` | Game/leaderboard/demo | Only `pg` via `db/index.js` | none | **Yes** | none |
| `backend/test/*`, `test-sqlite.mjs`, `test_flow.js` | Legacy SQLite-era harness | none (stale, target `DATABASE_FILE`) | n/a | Not runnable today; unrelated | none |

### 3.2 Frontend

| File | Purpose | Supabase feature | InsForge replacement | Effort |
|---|---|---|---|---|
| `frontend/src/lib/supabase.js` | Browser client | `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` | Delete, or replace with an InsForge SDK client **only if** the browser talks to InsForge directly (not needed if Express proxies login/refresh) | S |
| `frontend/src/api/client.js` | `setSession`, `getToken` (auto-refresh), `logout`, `isLoggedIn` (reads `sb-<ref>-auth-token` from localStorage), `request()` adds `Authorization` | supabase-js session persistence + auto refresh | Own small token store: keep `{accessToken, refreshToken, expiresAt}` in localStorage, attach access token, refresh via `POST /api/auth/refresh` when near expiry (or on 401), clear on logout. `isLoggedIn` reads the new key. **Decision needed:** refresh via a new Express route vs browser → InsForge directly (see Risks) | M–L |
| `frontend/src/pages/Login.jsx` | Calls `api.login`, then `setSession(session)` | via `client.js` | unchanged call sites if `client.js` keeps the same exported names | none/S |
| `frontend/src/pages/Landing.jsx` | `logout()` then reload | via `client.js` | unchanged | none |
| `frontend/src/components/TopNav.jsx` | `isLoggedIn()`; log-out button clears legacy `az_*` keys but **does not call `logout()`/sign out** | via `client.js` | see note in 9; behavior differs from Landing's Log Out (existing) | S |
| `frontend/src/pages/GamePage.jsx` | `getToken()` for the `beforeunload` exit beacon; `isLoggedIn()` | via `client.js` | unchanged if `getToken` stays async | none |
| `frontend/src/hooks/useGame.js`, `AgentChat.jsx`, `RecoveryModal.jsx`, `useSecurityMonitor.js`, `Admin.jsx`, `Leaderboard.jsx` | call `api`/`adminApi` | none directly | unchanged | none |
| `frontend/package.json`, `frontend/.env.example` | dependency + env names | `@supabase/supabase-js`, `VITE_SUPABASE_*` | remove/replace | S |
| `frontend/src/pages/Admin.jsx` | one UI string "…Supabase authentication pool" | text only | cosmetic wording change | S |

### 3.3 Database / docs / deployment

| File | Notes |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Reusable with small edits (section 4). Re-home as an InsForge migration (`db migrations new`). Keep the original until cutover is verified. |
| `README.md` (one incidental line), `DEPLOYMENT_VERCEL_SUPABASE.md`, `SUPABASE_NEW_PROJECT_SETUP.md` | Superseded by an InsForge setup doc after migration. |
| `backend/vercel.json`, `frontend/vercel.json` | Provider-neutral — **unchanged**. |
| `migrate.ps1` | Unrelated leftover; do not run. |

---

## 4. Database migration

### 4.1 Schema (from `001_initial_schema.sql`)

| Table | Key columns / constraints |
|---|---|
| `teams` | PK `id uuid default gen_random_uuid()`; `auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE`; `team_name UNIQUE NOT NULL`; `member1/2/3`, `contact`; CHECKs on `payment_status` (pending/verified/rejected), `registration_status` (registered/checked_in/disqualified), `role` (PLAYER/VOLUNTEER/ADMIN); `created_at timestamptz` |
| `game_sessions` | PK `id`; `team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE` and **`UNIQUE(team_id)`**; `status` CHECK (not_started, tutorial, active, critical, recovering, paused, completed, failed, disqualified); timers `started_at`, `completed_at`, `time_paused_seconds`, `paused_at`, `recovery_started_at`; counters `current_level`, `lives`, `max_lives_gained`, `score`, `recovery_attempts/successes`, `focus_violations`, `security_warnings`, `security_life_penalties`; `last_violation_at/reason`; JSONB `behaviour_flags`, `agent_memory`, `level_states` |
| `level_results` | PK `id`; `session_id → game_sessions ON DELETE CASCADE`; `level`, `attempts`, `failures`, `completed (int 0/1)`, `score`, timestamps. **No unique (session_id, level).** |
| `admin_config` | PK `key text`, `value text`; 9 seeded keys |
| `audit_log` | PK `id`; `actor text`, `action text`, `detail text` (JSON string), `created_at` |
| `security_events` | PK `id`; `session_id`/`team_id` FKs (cascade); `type` CHECK (warning/life_penalty); `reason`; `penalty_applied int` |
| Indexes | `idx_sessions_status`, `idx_sessions_team`, `idx_level_results_sess`, `idx_security_events_ses`, `idx_teams_auth_user` (plus implicit unique indexes) |
| Triggers / functions | **None** in the schema; none required by the app |
| Extension | `pgcrypto` (already installed on InsForge) |

### 4.2 RLS (all six tables `ENABLE ROW LEVEL SECURITY`)
- `teams_own_read`, `sessions_own_read`, `results_own_read` (SELECT to `authenticated`, own rows via `auth.uid()`), `config_authenticated_read` (SELECT, all authenticated).
- `audit_log`, `security_events`: RLS on, **no policy** (deny all but the owner role).

### 4.3 Reusability with InsForge
- **Reusable nearly verbatim.** `auth.users(id)` and `auth.uid()` exist in InsForge; `authenticated`/`anon` roles exist; PG15 and `pgcrypto` are present; the policy DO-blocks are standard SQL.
- Recommended edits: (a) apply as an InsForge migration file via `db migrations new` / `db migrations up`; (b) InsForge grants broad default DML to runtime roles on `public` tables and lets RLS decide — for `audit_log`, `security_events`, `teams`, `game_sessions`, `level_results`, `admin_config` add explicit `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon, authenticated` (and `REVOKE ALL` on the two RLS-no-policy tables) so security does not rely on RLS alone; (c) keep `ON DELETE CASCADE` semantics in mind for auth-user deletion (section 5).
- InsForge exposes `public` tables through its REST API to holders of the anon key, exactly like Supabase, so RLS + revokes are mandatory, not optional.
- No destructive SQL is needed to initialise a fresh project.

### 4.4 Transactions
See section 12.

---

## 5. Auth migration (mapping)

| Concern | Supabase today | InsForge target |
|---|---|---|
| Team login | server-side `signInWithPassword` with derived email | `POST /api/auth/sessions?client_type=server` from Express (email derivation `<slug>@agentzero.internal` unchanged) |
| Create team account | `auth.admin.createUser` (`email_confirm:true`) | `POST /api/auth/users?client_type=server`; project setting `requireEmailVerification` must be **false** (via `config apply`, a supported knob). Public sign-up is currently open (`disableSignup=false`) — see section 6 |
| Password reset | `auth.admin.updateUserById` | no documented admin endpoint → relink-then-delete approach (section 3.1) or confirm a supported route with InsForge |
| Access token | Supabase JWT (1 h default) | InsForge JWT (`role: authenticated`, sub = user id) |
| Token verification | `auth.getUser(token)` (network call) | `GET /api/auth/sessions/current` (network call) **or** local JWT verify with the project's JWT secret (fewer round trips; **VERIFY** secret access) |
| Refresh | supabase-js auto-refresh in the browser | explicit: `POST /api/auth/refresh` with the refresh token (server/mobile client type); the browser client store must do this itself |
| Logout | `supabase.auth.signOut()` | `POST /api/auth/logout` and clear the local token store |
| Frontend auth state | supabase-js localStorage key `sb-<ref>-auth-token`, read synchronously by `isLoggedIn()` | new localStorage key owned by `client.js`; `isLoggedIn()` reads it |
| Expired sessions | supabase-js refreshes silently | need refresh-on-401 or pre-expiry refresh in `client.js`; on refresh failure clear and route to `/login` |
| Admin auth | `ADMIN_SECRET` header | **unchanged** (independent of InsForge) |
| Team accounts | Supabase auth users + `teams` rows | InsForge auth users + `teams` rows; `teams.auth_user_id` must be re-pointed at new InsForge user ids |

InsForge's own dashboard "project admin" accounts are separate from Agent Zero's admin console and are not used by the app.

## 6. Security

- **Authorization layers are unchanged and must stay:** (1) team JWT → `teams` lookup → disqualified check → `req.team`; every game query is scoped by `req.team.id`; (2) admin routes gated by `ADMIN_SECRET`; (3) RLS as defence in depth against anon-key access.
- **Do not weaken:** keep RLS enabled on all tables; add the explicit REVOKEs from 4.3; keep the backend DB role server-only; never expose the InsForge API key (it is a full-access admin key, equivalent to a service role) in any `VITE_*` variable.
- **New consideration — open sign-up:** InsForge `POST /api/auth/users` is public when `disableSignup=false`. Anyone could create an `authenticated` auth user. They would have no `teams` row, so `requireTeamAuth` returns 401 for all game routes, but they would satisfy `config_authenticated_read` and could burn auth rate limits. Mitigations to decide: set `disableSignup=true` **if** the admin API key can still register users (VERIFY); otherwise drop or narrow `config_authenticated_read` (the app does not need it because the backend reads config with the owner role) and rate-limit at the edge.
- **Verification setting:** `requireEmailVerification` must be false for fake team emails, which makes every registered address auto-usable; acceptable because the address space is not user-supplied.
- **Admin secret:** unchanged; still compared in plain equality (existing).
- **Existing gaps noticed (not caused by migration):** the TopNav Log out button clears only legacy `az_*` keys and never ends the Supabase session; team name lookup exposes distinguishable 401 vs 403 messages.

## 7. Backend files requiring modification

| File | What | Why | InsForge feature |
|---|---|---|---|
| `backend/src/db/supabaseClient.js` | Replace client (rename file optional) | remove Supabase dependency | admin SDK client / REST + API key |
| `backend/src/middleware/auth.js` | Swap `getUser` for InsForge session check | token verification | `GET /api/auth/sessions/current` or JWT secret |
| `backend/src/routes/auth.js` | Swap sign-in call; return tokens | login | `POST /api/auth/sessions` (`client_type=server`) |
| `backend/src/routes/admin.js` | Swap create-user and reset-password logic | account management | `POST /api/auth/users`, delete-users endpoint |
| `backend/src/db/index.js` | New `DATABASE_URL`, pool size ≤ safe share of 30, revisit SSL option | direct (non-pooled) Postgres | `db connection-string` |
| `backend/src/server.js` | env names in the startup check | rename | — |
| `backend/package.json`, `.env.example` | deps and env | rename | — |
| Optional: new `POST /api/auth/refresh` route | proxy refresh | browser has no supabase-js auto-refresh | `POST /api/auth/refresh` |

## 8. Frontend files requiring modification

| File | What | Why |
|---|---|---|
| `frontend/src/api/client.js` | own token store, refresh, logout, `isLoggedIn` | supabase-js removed |
| `frontend/src/lib/supabase.js` | delete/replace | no supabase client |
| `frontend/package.json`, `.env.example` | remove supabase-js, env names | cleanup |
| `frontend/src/components/TopNav.jsx` | (optional) make Log out use `logout()` | consistent sign-out (existing inconsistency) |
| `frontend/src/pages/Admin.jsx` | wording only | remove "Supabase" from UI text |

`Login.jsx`, `Landing.jsx`, `GamePage.jsx`, hooks and all other pages keep working unchanged if `client.js` keeps the exports `api`, `adminApi`, `setSession`, `getToken`, `logout`, `isLoggedIn`.

---

## 9. Environment variables

| Supabase (current) | InsForge (target) | Where | Notes |
|---|---|---|---|
| `SUPABASE_URL` | `INSFORGE_URL` = `https://9ccec64b.ap-southeast.insforge.app` | backend | |
| `SUPABASE_SERVICE_ROLE_KEY` | `INSFORGE_API_KEY` (project admin key, from the linked project) | backend only | full-access; never in `VITE_*`; never commit |
| `DATABASE_URL` (pooler :6543) | `DATABASE_URL` from `insforge db connection-string` (direct :5432, `sslmode=require`) | backend | URL-encode the password |
| `VITE_SUPABASE_URL` | none (or `VITE_INSFORGE_URL` if the browser calls InsForge) | frontend | not needed in the proxied design |
| `VITE_SUPABASE_ANON_KEY` | none (or `VITE_INSFORGE_ANON_KEY` from `secrets get ANON_KEY`) | frontend | public key only |
| `ADMIN_SECRET`, `CORS_ORIGIN`, `NODE_ENV`, `PORT`, game config, AI vars, demo vars | unchanged | backend | |
| `VITE_API_BASE` | unchanged | frontend | |

Local secrets live in `.env` files (git-ignored). The CLI keeps its own key in `.insforge/project.json` (git-ignored).

---

## 10. Data migration (not performed)

Source: current Supabase Postgres (read-only export). Target: InsForge Postgres (direct URL). Suggested method: `pg_dump --data-only` per table, or `COPY … TO/FROM`, or `insforge db import <file>` for SQL; load with `ON CONFLICT DO NOTHING` semantics where possible. Insert order (FK dependencies): `admin_config` → `teams` → `game_sessions` → `level_results` → `security_events` → `audit_log`.

| Data | Approach |
|---|---|
| `teams` | Copy rows preserving `id`. **Re-map `auth_user_id`** to new InsForge auth users (see auth row). |
| Users / auth | **Cannot be moved as-is.** Supabase auth users/password hashes live in `auth.users` of the old project; InsForge's `auth.users` is a managed schema (writing directly is discouraged and the hash format compatibility is **VERIFY**). Recommended: recreate each team account through the API (deterministic email from team name), issue new passwords, then update `teams.auth_user_id`. |
| Game state / run state / timer / recovery / completion | Row copy of `game_sessions` (status, `started_at`, `paused_at`, `time_paused_seconds`, `recovery_started_at`, lives, `current_level`, JSONB state). No transformation needed; column types are identical. |
| Scores, completed sectors | `game_sessions.score`, `level_results` rows — copy as-is. |
| Leaderboard | Not stored: computed from `game_sessions` ⨝ `teams` on request. Nothing to migrate. |
| Security history, audit trail | `security_events`, `audit_log` — copy as-is (optional but recommended). |
| Config | `admin_config`: keep the live values (they override the seed); `ON CONFLICT (key) DO UPDATE` for the rows you want to carry over. |
| Everything else | No other persistent data (no storage buckets, no files). |

Freeze writes before the final copy: put the site in maintenance (backend stopped or admin registration closed and no active runs). Take a fresh Supabase-side dump and keep it untouched as the rollback.

## 11. Game-state safety

Every listed item lives in one `game_sessions` row (plus `level_results`), so a row-for-row copy preserves it:

| State | Where stored | Preserved by row copy? |
|---|---|---|
| Active game, current level | `status`, `current_level`, `level_states` | Yes |
| Timer | `started_at`, `time_paused_seconds`, `paused_at`, `game_duration_seconds` | Values yes. **Caveat:** the engine computes time from wall-clock `now()`; a run that is *running* during the downtime keeps consuming its clock. Migrate when no team is mid-run, or pause runs first. |
| Paused / between sectors | `status='paused'` with `paused_at` null/non-null (transition vs admin pause) | Yes |
| Completed sectors | `level_results.completed`, `current_level` | Yes |
| Recovery state | `status`, `recovery_started_at`, `recovery_attempts/successes` | Yes (an in-progress recovery window expires by wall-clock) |
| Team status | `teams.registration_status/payment_status`, disqualified sessions | Yes |
| Leaderboard | derived | Yes |
| Completion / game-over | `status` completed/failed, `completed_at`, `score` | Yes |
| Logged-in browser sessions | Supabase JWTs | **No** — every player must log in again after cutover |

## 12. Transactions and atomicity

Every place that relies on Postgres row locks or multi-statement atomicity uses node-postgres over a single pooled connection in `backend/src/engine/gameEngine.js`:

| Function (approx. lines) | Pattern | Why it matters |
|---|---|---|
| `exitSession` (~204–240) | `BEGIN; SELECT … FOR UPDATE; UPDATE game_sessions …; COMMIT` | prevents double-counted elapsed time |
| `applyAction` (~345–557) | `BEGIN; SELECT … FOR UPDATE`; timer expiry check; life/level/score changes; `level_results` updates; `saveSession`-style UPDATE; `COMMIT`. Early-return branches `ROLLBACK`/release. | serialises concurrent actions per team |
| chat handler (~739–810) | `BEGIN; SELECT … FOR UPDATE`; merge agent memory; `COMMIT` | serialises chat with actions |
| single statements | `createSession` `INSERT … ON CONFLICT (team_id) DO NOTHING`; admin disqualify (2 UPDATEs, not transactional today) | uniqueness guard relies on the constraint |

To preserve this on InsForge: **keep `pg` with the direct Postgres URL** (an SDK/REST/PostgREST client cannot run interactive transactions). Keep the `UNIQUE(team_id)` constraint. Keep the idempotent-`release` patch in `backend/src/db/index.js` (the engine currently releases early and again in `finally`). Re-run a concurrency check (two simultaneous actions for one team) after cutover.

---

## 13. Deployment

**Local development:** `backend/.env`: `INSFORGE_URL`, `INSFORGE_API_KEY`, `DATABASE_URL` (direct URL), plus unchanged variables. `frontend/.env`: `VITE_API_BASE=/api` (Vite proxy to `:4000` unchanged). Restart the backend after any `.env` change (`node --watch` does not watch `.env`); rebuild/restart the frontend for `VITE_*` changes.

**Vercel backend project (root `backend`):** replace Supabase variables with `INSFORGE_URL`, `INSFORGE_API_KEY`, `DATABASE_URL`; keep `ADMIN_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`. `vercel.json` unchanged. Serverless instances each open their own pool: set a small pool `max` so total connections across instances stay under 30.

**Vercel frontend project (root `frontend`):** remove `VITE_SUPABASE_*` (and add `VITE_INSFORGE_*` only if the browser talks to InsForge). Redeploy so the bundle is rebuilt; `vercel.json` rewrites unchanged.

**InsForge project settings** (via `config plan/apply`, never raw HTTP): `requireEmailVerification=false`; decide `disableSignup`; password minimum stays ≥ 6; allowed redirect URLs not needed.

---

## 14. Test plan (run against a branch or the empty project first)

1. **Admin login** — `/admin` with `ADMIN_SECRET`; dashboard loads; config shows seeded values.
2. **Create team** — Register Squad succeeds; row in `teams`; user in InsForge auth (verify `email_verified` behaviour); duplicate name rejected.
3. **Team login** — `/login` succeeds; wrong password fails with the same message as before.
4. **Lobby** — loads; disqualified team gets 403.
5. **Start Level 1** — session created; state polling every 4 s.
6. **Game state** — refresh mid-level keeps level, lives, timer.
7. **Gameplay action** — action applied; life loss; score change; concurrent double-click does not double-apply (row lock).
8. **Timer** — counts down; expiry moves to failed at `game_duration_seconds`.
9. **Pause / Resume** — admin pause → player sees paused screen; resume continues clock.
10. **Level transition** — complete a level → map → next level enters without getting stuck (`ENTER_SECTOR`).
11. **Recovery** — lose all lives → recovery puzzle → success (+1 shield) and failure paths; window expiry.
12. **Security** — fullscreen exit / tab switch → warning then penalty; `security_events` row.
13. **Leaderboard** — `/leaderboard` with admin secret lists the team with correct rank.
14. **Completion** — finish level 5 → completion + final reveal; **game over** → terminated screen.
15. **Logout** — clears session; protected calls return 401.
16. **Re-login**, **refresh page**, **reconnect** (kill network briefly, reload) — session resumes, expired access token refreshes, refresh failure lands on `/login`.
17. **Admin actions** — pause/resume, +1 life, reset, disqualify, payment status, score breakdown, security log, CSV export, config save, **reset password**.
18. **Security checks** — anon key cannot read/write any table; authenticated non-team user gets 401 on game routes.
19. **Load** — ~30 simultaneous team logins/polls: no `too many connections`.

## 15. Recommended migration order

1. Rotate/revoke the user API key used for CLI access once the audit and setup are done (it was shared in chat).
2. Create an InsForge **backend branch** (or use the empty project) for rehearsal.
3. Add the schema as an InsForge migration (`db migrations new` → `up`) with the extra REVOKEs; verify with `db tables/policies/indexes`.
4. Set auth config (`requireEmailVerification=false`, decide `disableSignup`) with `config plan/apply`.
5. Prototype the three auth calls (register server-type user, password sign-in, `sessions/current`) with a throwaway test team; **resolve the VERIFY items** (admin register with sign-up disabled, admin password change, JWT secret access).
6. Swap the backend auth layer (`supabaseClient.js`, `middleware/auth.js`, `routes/auth.js`, `routes/admin.js`) behind the same route contracts.
7. Swap `frontend/src/api/client.js` token handling; keep exported names.
8. Local end-to-end run of section 14.
9. Data migration rehearsal on the branch with a copy of production data.
10. Deploy backend to Vercel with new env, then frontend; run section 14 again in production.
11. Cutover window: freeze, final export/import, recreate team accounts, remap `auth_user_id`, hand out new passwords.
12. Keep Supabase untouched and read-only for a rollback period; delete only after sign-off.

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **`max_connections = 30`, direct (unpooled) DB** | Vercel serverless instances × pool `max=20` will exhaust connections under event load | Lower pool max (e.g. 3–5), keep instances few, consider a persistent Express host (InsForge compute) instead of many serverless instances, test with load |
| No documented admin password-set endpoint | Admin "Reset Password" cannot be a one-line swap | relink-then-delete workaround; confirm a supported API with InsForge |
| `requireEmailVerification=true` today | Team creation via API yields users who cannot sign in | set to false before creating teams |
| Open sign-up (`disableSignup=false`) | anonymous auth users can be created (no game access, but noise/abuse) | test if the admin key can register with sign-ups disabled; otherwise narrow the `authenticated` read policy and rate-limit |
| Refresh handling moves to our code | users logged out mid-game if refresh is wrong | implement refresh-on-401 + pre-expiry refresh; test long sessions |
| Browser CORS/cookies if the browser calls InsForge directly | web client uses httpOnly cookie + CSRF | prefer proxying through Express (`client_type=server`) |
| Token verification adds a network hop per request | latency on the 4 s polling of every team | verify JWT locally with the project secret if obtainable |
| `auth.users` FK is `ON DELETE CASCADE` | deleting an auth user deletes the team, session and results | never delete auth users without first re-pointing `teams.auth_user_id` |
| Region ap-southeast vs India audience | extra latency (Vercel region/ Mumbai users → Singapore DB) | pick a nearby Vercel function region; measure |
| SSL: URL says `sslmode=require`, code sets `ssl` only in production | local connect failures or cert warnings | test locally and in production; align `ssl` option |
| Data migration while runs are live | wall-clock timers keep consuming time | freeze/pause first |
| All players logged out at cutover | mid-run interruption | do the cutover between rounds/before the event |
| Pasted API key exposure | account-level access | revoke and recreate the user API key after this work |

## 17. File change summary

**Reusable unchanged:** `backend/src/engine/*`, `routes/game.js`, `routes/leaderboard.js`, `routes/demo.js`, `backend/vercel.json`, `frontend/vercel.json`, `frontend/vite.config.js`, all frontend pages/components/hooks except those listed below, `backend/src/db/index.js` (except env/pool settings).

**Require modification:** `backend/src/db/supabaseClient.js`, `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `backend/src/routes/admin.js`, `backend/src/server.js` (env names), `backend/src/db/index.js` (pool/SSL config), `backend/package.json`, `backend/.env.example`, `frontend/src/api/client.js`, `frontend/src/lib/supabase.js`, `frontend/package.json`, `frontend/.env.example`; optional: `frontend/src/components/TopNav.jsx`, `frontend/src/pages/Admin.jsx` (wording).

**Delete only after successful migration:** `frontend/src/lib/supabase.js` (if replaced), `supabase/` directory, `DEPLOYMENT_VERCEL_SUPABASE.md`, `SUPABASE_NEW_PROJECT_SETUP.md`, `migrate.ps1`, `@supabase/supabase-js` dependencies.

**New files:** InsForge migration SQL (`insforge/migrations/…` or `migrations/…` via `db migrations new`), a new setup document (`INSFORGE_SETUP.md`), optionally a small `backend/src/routes/` refresh handler.

**Database changes:** apply schema + RLS + REVOKEs to InsForge Postgres; seed/copy `admin_config`; recreate team auth users; remap `teams.auth_user_id`.

**Environment changes:** section 9.

**Deployment changes:** section 13.

**Side effects of the CLI link step (already applied, not application code):** `.gitignore` gained an "InsForge & AI agent skills" block; `AGENTS.md` and `.insforge/project.json` (git-ignored, contains the project admin key) were created; InsForge skills were installed into the user's global agent-skills folder.

# Agent Zero — New Supabase Project Setup

Use this when moving the game to a **new** Supabase project. It contains no real secrets: every value is a placeholder such as `NEW_SUPABASE_URL`. Never paste real keys into this file or commit `.env` files (they are git-ignored).

Nothing in the repository points at a hard-coded Supabase project. The project is chosen entirely by environment variables (see section 4), so moving projects needs **no code changes**.

---

## 1. New project creation checklist

- [ ] Create the project at https://database.new (do this manually).
- [ ] **Region: Mumbai (`ap-south-1`, South Asia)** — closest to the event location.
- [ ] Save the database password in a password manager (needed for `NEW_DATABASE_URL`).
- [ ] Note the **Project URL** and **Project Reference ID** (Project Settings → General / API).
- [ ] Leave the old project untouched until the new one is fully tested.

---

## 2. Database migration

There is exactly one migration file: `supabase/migrations/001_initial_schema.sql`.

Run it once, in the **new** project only: Dashboard → **SQL Editor → New query** → paste the whole file → **Run**.

It creates (all `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, no drops, no deletes, safe to re-run):

| Object | Details |
|---|---|
| Extension | `pgcrypto` |
| Tables | `teams`, `game_sessions`, `level_results`, `admin_config`, `audit_log`, `security_events` |
| Foreign keys | `teams.auth_user_id → auth.users(id)` (cascade), `game_sessions.team_id → teams(id)`, `level_results.session_id`, `security_events.session_id / team_id` (all cascade) |
| Constraints | unique `team_name`, unique `auth_user_id`, one session per team (`UNIQUE(team_id)`), CHECKs on `payment_status`, `registration_status`, `role`, `game_sessions.status`, `security_events.type` |
| Indexes | `idx_sessions_status`, `idx_sessions_team`, `idx_level_results_sess`, `idx_security_events_ses`, `idx_teams_auth_user` |
| Seed data | `admin_config` defaults: `game_duration_seconds=900`, `max_recoveries=3`, `initial_lives=5`, `recovery_window_seconds=30`, `registration_open=true`, `event_started=false`, `secure_mode_enabled=true`, `fullscreen_required=true`, `violation_cooldown_seconds=2` |
| RLS | enabled on all six tables (see section 3) |

The migration defines **no functions and no triggers**, and the application does not need any.

Verification performed against the code (queries in `backend/src/**`): every table and column the backend reads or writes exists in the migration (`game_sessions` UPDATE/INSERT columns, `level_results`, `security_events`, `audit_log(actor, action, detail)`, `teams`, `admin_config`), and every config key read via `getConfig(...)` is seeded.

The only change made to the migration was to wrap the four `CREATE POLICY` statements in existence-checked `DO $$ … $$` blocks, because `CREATE POLICY` has no `IF NOT EXISTS`, which made the script fail on a second run. The policy definitions are unchanged. The file has **not** been executed against a live database from this repository.

---

## 3. Row Level Security

The Express backend connects with the Postgres connection string and the `service_role` key, both of which bypass RLS, so all game traffic works normally. RLS only blocks direct access with the public anon key.

| Table | Policy | Rule |
|---|---|---|
| `teams` | `teams_own_read` (SELECT, authenticated) | `auth_user_id = auth.uid()` |
| `game_sessions` | `sessions_own_read` | own team's session only |
| `level_results` | `results_own_read` | own session's results only |
| `admin_config` | `config_authenticated_read` | any signed-in user (values are not secret) |
| `audit_log`, `security_events` | none (RLS on) | denied to everyone except service role |

After running the migration, check **Authentication → Policies** shows these four policies and RLS enabled on all six tables. The Supabase Security Advisor should report no "RLS disabled" warnings.

---

## 4. Environment variables

### Where the project is referenced
- `backend/src/db/supabaseClient.js` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `backend/src/db/index.js` — `DATABASE_URL` (pg pool; SSL on when `NODE_ENV=production`)
- `frontend/src/lib/supabase.js` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `frontend/src/api/client.js` — reads `VITE_SUPABASE_URL` to find the stored session key, and `VITE_API_BASE`
- Templates only (placeholders): `backend/.env.example`, `frontend/.env.example`

### Backend (`backend/.env` locally; Vercel project with root directory `backend`)
| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `NEW_SUPABASE_URL` | e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `NEW_SUPABASE_SERVICE_ROLE_KEY` | secret; backend only |
| `DATABASE_URL` | `NEW_DATABASE_URL` | Transaction pooler string, port `6543`, Mumbai host `…ap-south-1.pooler.supabase.com`; copy it exactly from Project Settings → Database → Connection string |
| `ADMIN_SECRET` | `YOUR_ADMIN_SECRET` | not stored in Supabase; reuse or rotate |
| `NODE_ENV` | `production` on Vercel | turns on DB SSL |
| `CORS_ORIGIN` | `https://YOUR_FRONTEND_URL` | comma-separated list allowed |
| `PORT` | `4000` | local only |
| `GAME_DURATION_SECONDS`, `MAX_RECOVERIES`, `INITIAL_LIVES`, `RECOVERY_WINDOW_SECONDS` | optional | only used to seed `admin_config` when a key is missing |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_JSON_MODE` | optional | unrelated to Supabase; keep as is |
| `DEMO_MODE_ENABLED`, `DEMO_MODE_SECRET` | `false` on the event build | |

### Frontend (`frontend/.env` locally; Vercel project with root directory `frontend`)
| Variable | Value |
|---|---|
| `VITE_API_BASE` | `https://YOUR_BACKEND_URL/api` (locally `/api`, proxied to port 4000) |
| `VITE_SUPABASE_URL` | `NEW_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `NEW_SUPABASE_ANON_KEY` (public key only) |

### Vercel
Two separate Vercel projects are used (see `DEPLOYMENT_VERCEL_SUPABASE.md`). Put the backend table above into the **backend** project and the frontend table into the **frontend** project, for the Production environment (and Preview if you use it). `VITE_*` values are baked in at build time, so **redeploy the frontend after changing them**. Never put `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` or `ADMIN_SECRET` in a `VITE_` variable.

---

## 5. Supabase Auth requirements

How the app uses Auth: admins create each team through the backend (`auth.admin.createUser` with `email_confirm: true`) using a generated address `<team-name-slug>@agentzero.internal`; teams then log in through the backend with team name + password (`signInWithPassword`); the browser stores the returned session with the anon-key client; the backend validates every request with `auth.getUser(token)`.

Settings in the new project (Authentication):
- [ ] **Email provider: ENABLED** (required — team login is email + password behind the scenes). Do not disable the provider.
- [ ] **Allow new users to sign up: OFF** (teams are created by the admin only; the service role still creates users when signups are off).
- [ ] "Confirm email" may stay on or off — admin-created users are pre-confirmed.
- [ ] Minimum password length: keep at least 6 (the app enforces 6+).
- [ ] No SMTP, OAuth, redirect URLs or email templates are needed, since no emails are sent.
- [ ] Optional: raise the auth rate limits for the event day if many teams log in at once.

> The older `DEPLOYMENT_VERCEL_SUPABASE.md` said to "disable Email Signups"; that wording was corrected because disabling the Email provider itself would break every login.

---

## 6. Accounts to recreate manually

There is **no Supabase admin user**. Admin access is the `ADMIN_SECRET` environment variable, entered on `/admin`. Nothing to create in Auth for the admin.

Teams cannot be copied automatically: auth users and passwords live in the old project and cannot be exported as usable passwords. After the new project is live:
1. Open `/admin`, enter `ADMIN_SECRET`.
2. Use **Register Squad** to recreate each team with its name, a new password, members and contact.
3. Hand the new passwords to the teams. Old sessions and scores are not carried over (start of a fresh event).
4. Re-set each team's payment status in the manifest table if you track it.
5. Delete/clear the browser storage of any device that used the old project (old `sb-…-auth-token` entries become invalid), or ask players to log in again.

Suggested first team: a `TEST TEAM` for the checks in section 8.

---

## 7. Exact order of the migration

1. Create the new Supabase project (Mumbai). Save the DB password.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor. Confirm no errors.
3. Verify tables, seeded `admin_config` rows and RLS/policies (section 3).
4. Configure Auth (section 5).
5. Copy from Project Settings → API: Project URL, anon key, service_role key. Copy from Database → Connection string: the transaction pooler URL.
6. **Local test first:** put the new values in `backend/.env` and `frontend/.env` (do this only when you are ready; keep the old values saved). Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`). Run section 8.
7. Update the **backend** Vercel project variables; redeploy. Check `/api/health`.
8. Update the **frontend** Vercel project variables; redeploy (rebuild, since `VITE_*` are compile-time).
9. Set the backend `CORS_ORIGIN` to the final frontend URL if it changed; redeploy backend.
10. Recreate teams in `/admin` (section 6).
11. Re-run section 8 against production.
12. Keep the old project read-only for a few days as a fallback, then retire it manually.

---

## 8. Post-migration testing checklist

- [ ] Backend starts with no `[WARN] … unset` messages and logs "PostgreSQL connected. Admin config defaults ensured."
- [ ] `GET /api/health` returns `{"ok":true,…}`.
- [ ] `/admin` accepts `ADMIN_SECRET`, dashboard loads, Event Configuration shows the seeded values.
- [ ] Register Squad creates a team (a row appears in `teams` and a user in Auth → Users).
- [ ] Duplicate team name is rejected.
- [ ] The team can log in at `/login` and reaches the lobby.
- [ ] A wrong password shows an error and does not log in.
- [ ] Start game → tutorial → Level 1; timer runs, lives show, refresh keeps the session.
- [ ] Complete a level → map → next level loads (session resumes without getting stuck).
- [ ] Lose a life; trigger recovery; complete recovery.
- [ ] Leaving fullscreen shows the warning, then a shield penalty; a row is written to `security_events`.
- [ ] Admin actions work: pause/resume, +1 life, reset, disqualify, payment status, score breakdown, security log, CSV export, config save.
- [ ] Leaderboard (via admin) shows the team.
- [ ] Direct anon-key access to tables is denied (RLS): e.g. `select * from teams` with the anon key returns nothing.
- [ ] A disqualified team cannot log in.
- [ ] Production: no CORS errors in the browser console, and the network tab shows requests going to the new backend and new `*.supabase.co` project only.

---

## 9. Things noticed while inspecting (no action taken)

- `backend/src/server.js` always allows `http://localhost:5173` and `https://agent-zero-rvu.vercel.app` for CORS in addition to `CORS_ORIGIN`. Fine, but remove the hard-coded Vercel host if the frontend URL changes.
- `migrate.ps1` is a leftover script that copies files from a backup folder and runs `git add/commit`. It is unrelated to Supabase; do not run it.
- `level_results` has no unique `(session_id, level)` constraint, so `demo.js`'s `ON CONFLICT DO NOTHING` cannot dedupe there. Left unchanged to avoid altering behaviour.
- `frontend/dist/` is a stale build that embeds the old project URL; it is git-ignored. Rebuild after switching the variables.
- With `NODE_ENV` not set to `production`, the pg pool connects without SSL. Supabase accepts this unless "Enforce SSL" is turned on; if it is, run the backend locally with `NODE_ENV=production` or leave SSL enforcement off.

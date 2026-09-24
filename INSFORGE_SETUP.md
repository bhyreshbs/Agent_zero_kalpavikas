# Agent Zero — InsForge setup

Agent Zero now uses **InsForge Auth + PostgreSQL** (replacing Supabase). Architecture is unchanged:

```
Browser (React) → Vercel → Express backend → InsForge (Auth REST + direct Postgres)
```

The browser talks only to the Express API. Express talks to InsForge. No secrets in `VITE_*` variables.

## Environment variables (no values here)

**Backend** (`backend/.env`, Vercel backend project)

| Variable | Purpose |
|---|---|
| `INSFORGE_URL` | Project base URL, `https://<appkey>.<region>.insforge.app` |
| `INSFORGE_API_KEY` | Project admin API key (full access, server only) |
| `DATABASE_URL` | Direct Postgres URL from `npx @insforge/cli db connection-string` (URL-encode special characters in the password) |
| `DB_POOL_MAX` | Connections per server instance (default **3**, see below) |
| `ADMIN_SECRET`, `CORS_ORIGIN`, `NODE_ENV`, `PORT`, game/AI/demo vars | unchanged |

**Frontend** (`frontend/.env`, Vercel frontend project): only `VITE_API_BASE`.

## Database

`migrations/20260924184754_initial-agent-zero-schema.sql` (applied with `npx @insforge/cli db migrations up --all`) is a 1:1 port of the old schema: same tables, columns, keys, indexes, CHECK constraints, seed config and RLS policies, plus explicit `REVOKE`s so `anon`/`authenticated` have no write access and no access to `audit_log`/`security_events`. The backend uses the database owner role, so RLS only guards direct REST access.

## Auth

Project auth settings (applied with `npx @insforge/cli config apply`):
- `require_email_verification = false` (team emails are internal `<slug>@agentzero.internal`)
- `disable_signup = true` — public sign-up is closed; the backend still registers teams with the admin API key (verified).

Flow: `POST /api/auth/login` (InsForge password sign-in) returns `access_token` + `refresh_token` to the browser; `POST /api/auth/refresh` (new) and `POST /api/auth/logout` (new) proxy InsForge. Access tokens live 15 minutes.

Client (`frontend/src/api/client.js`): session in `localStorage['az_session']`; the access token is refreshed shortly before expiry; on a 401 it refreshes **once** (shared across concurrent calls) and retries **once**; a rejected refresh clears the session and goes to `/login`; a temporary auth outage (5xx/network) never logs the player out.

Known limits:
- **Admin "Reset Password"**: InsForge documents no admin set-password call, so the team's auth user is replaced (same email, new password) using the documented register/delete endpoints; the team row is detached first so game data is never cascade-deleted. If the request fails halfway, run it again.
- **Logout does not revoke the refresh token on InsForge** (tested: a refresh token still works after `/api/auth/logout` for server-type sessions). The client deletes its copy; a stolen refresh token would remain valid until InsForge expires it.
- The backend remembers a verified access token for 15 s to avoid one InsForge call per request; team status (e.g. disqualified) is still read from the database on every request.

## PostgreSQL connection pool

InsForge's database is a **direct** endpoint with `max_connections = 30` shared with InsForge's own services.
- `DB_POOL_MAX` default **3** per instance, idle connections closed after 10 s.
- Game transactions hold one connection and also run inner queries, so at most `DB_POOL_MAX - 1` transactions run at once per instance (others queue up to 10 s); one connection is always free. This removed a connection-exhaustion deadlock seen with small pools.
- Budget: `DB_POOL_MAX × (concurrent Vercel instances)` must stay well below 30. Raise `DB_POOL_MAX` only after checking how many instances run at once.
- SSL comes from `sslmode=require` in `DATABASE_URL`, locally and in production (verified with a real connection). node-postgres prints a warning about future `sslmode` semantics; harmless.

## Local development

```
cd backend && npm run dev     # or: node src/server.js   (--watch does not reload .env)
cd frontend && npm run dev
```

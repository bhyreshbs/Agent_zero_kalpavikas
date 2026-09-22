# Agent Zero: Production Deployment Guide

This guide details exactly how to deploy the Agent Zero platform for a live event using **Vercel** for the frontend/backend and **Supabase** for the database/auth layer.

---

## 1. Supabase Setup

**A. Project Creation**
1. Create a new Supabase project at [database.new](https://database.new).
2. Save your **Project Password**.

**B. Database Migration**
1. Go to the SQL Editor in your Supabase dashboard.
2. Open `supabase/migrations/001_initial_schema.sql` from this repository.
3. Paste the contents into the SQL Editor and click **Run**.
4. This will create the `teams`, `game_sessions`, `level_results`, and `admin_config` tables along with Row Level Security (RLS) policies.

**C. Auth Settings**
1. Go to **Authentication > Providers**.
2. **Disable** Email Signups (teams must be created by the admin, self-registration is forbidden).
3. Ensure Email & Password login is **Enabled**.

**D. Required Keys**
You will need to fetch the following keys from **Project Settings > API**:
- **Project URL** (`SUPABASE_URL` / `VITE_SUPABASE_URL`)
- **anon** `public` key (`VITE_SUPABASE_ANON_KEY`)
- **service_role** `secret` key (`SUPABASE_SERVICE_ROLE_KEY`) — **Never expose this to the frontend!**
- **Database URL** (`DATABASE_URL`) from **Project Settings > Database > Connection String (Transaction Pooler)** (Ends with `6543/postgres`).

---

## 2. Backend Vercel Deployment

The Express API is designed to run seamlessly as serverless functions on Vercel.

**A. Deployment**
1. Go to Vercel and click **Add New > Project**.
2. Select your repository.
3. **Important:** Set the **Root Directory** to `backend`.
4. The Build Command can remain the default (`npm run build`, which is a no-op since it's just raw Node.js/Express) or leave it empty.
5. Vercel will automatically use `backend/vercel.json` and `@vercel/node` to run `src/server.js`.

**B. Environment Variables**
Configure the following environment variables in Vercel before deploying:
- `NODE_ENV`: `production`
- `CORS_ORIGIN`: `https://YOUR_FRONTEND_VERCEL_URL.vercel.app` (The URL where the frontend will be deployed. Allows the frontend to securely communicate with the API).
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase **secret** service role key.
- `DATABASE_URL`: The Transaction Pooler Connection String (Port 6543).
- `ADMIN_SECRET`: Generate a highly secure password for the Admin Console.
- `DEMO_MODE_ENABLED`: `false` (Optional, disables demo/test routes entirely).

**C. Testing the API**
Once deployed, visit `https://YOUR_BACKEND_URL.vercel.app/api/health`. You should receive a JSON response: `{"ok":true,"name":"agent-zero-backend"}`.

---

## 3. Frontend Vercel Deployment

**A. Deployment**
1. Go back to the Vercel dashboard and click **Add New > Project**.
2. Select the *same* repository.
3. **Important:** Set the **Root Directory** to `frontend`.
4. Framework Preset should automatically be detected as **Vite**.
5. Build Command: `npm run build`
6. Output Directory: `dist`

**B. Environment Variables**
Configure the following environment variables:
- `VITE_API_BASE`: `https://YOUR_BACKEND_URL.vercel.app/api` (The deployed backend URL).
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase **public** anon key.

**C. SPA Rewrites**
The `frontend/vercel.json` already contains the rewrite rules `/(.*) -> /index.html` necessary for React Router to work correctly on Vercel.

---

## 4. Deployment Order

1. **Supabase:** Must be set up first to retrieve connection strings and API keys.
2. **Backend:** Deploy the backend next. You need its deployed Vercel URL to configure the frontend.
3. **Frontend:** Deploy the frontend last, providing the backend URL as `VITE_API_BASE`.
4. **Backend (Update):** Once the frontend is deployed, update the backend's `CORS_ORIGIN` variable with the final frontend URL.

---

## 5. Production Flow

During the live event, the flow works exactly as follows:
1. **Admin Creation:** Organizer visits `/admin` on the frontend, logs in with `ADMIN_SECRET`, and clicks **Create Team**.
2. **Team Login:** The newly created team is given their `Team Name` and `Password`. They visit `/login` to authenticate. (Registration is disabled).
3. **Timer Starts:** When the team completes the tutorial and enters Sector 1, the backend sets `started_at` and starts the 15-minute global timer countdown.
4. **Sector Pauses:** Upon completing Sector 1, the timer strictly pauses (`status = 'paused'`). The time spent in the lobby *does not count* against the 15 minutes.
5. **Next Sector:** When they enter Sector 2, the timer resumes exactly where it left off.
6. **Game Completion:** When the final sector is completed (or the timer expires), the session drops into a terminal state and the final score is recorded.

---

## 6. Security Checklist

- [ ] **NEVER** commit `.env` files to the repository.
- [ ] **NEVER** expose the `SUPABASE_SERVICE_ROLE_KEY` to the frontend (`VITE_...`).
- [ ] **NEVER** expose the `DATABASE_URL` or `ADMIN_SECRET` to the frontend.
- [ ] **DO** verify that the frontend is only using `VITE_SUPABASE_ANON_KEY`.
- [ ] **DO** ensure Row Level Security (RLS) is enabled in Supabase (run the migration script!).
- [ ] **DO** verify `CORS_ORIGIN` is strictly set to your production frontend URL (and not `*` or `localhost`).

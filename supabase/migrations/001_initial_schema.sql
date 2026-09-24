-- ============================================================================
-- Agent Zero — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TEAMS
-- password_hash is removed — Supabase Auth handles passwords securely.
-- auth_user_id links each team to its Supabase Auth account.
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id        UUID        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name           TEXT        NOT NULL UNIQUE,
  member1             TEXT        NOT NULL,
  member2             TEXT        NOT NULL,
  member3             TEXT,
  contact             TEXT        NOT NULL,
  payment_status      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','verified','rejected')),
  registration_status TEXT        NOT NULL DEFAULT 'registered'
    CHECK (registration_status IN ('registered','checked_in','disqualified')),
  role                TEXT        NOT NULL DEFAULT 'PLAYER'
    CHECK (role IN ('PLAYER','VOLUNTEER','ADMIN')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GAME SESSIONS
-- JSON TEXT columns become JSONB — auto-parsed by pg driver.
-- Timestamps become TIMESTAMPTZ (UTC-aware).
-- UNIQUE(team_id) is preserved — one session per team.
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                 UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_seed               TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started','tutorial','active','critical',
      'recovering','paused','completed','failed','disqualified'
    )),
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  game_duration_seconds   INTEGER     NOT NULL,
  current_level           INTEGER     NOT NULL DEFAULT 0,
  lives                   INTEGER     NOT NULL,
  max_lives_gained        INTEGER     NOT NULL DEFAULT 0,
  score                   INTEGER     NOT NULL DEFAULT 0,
  recovery_attempts       INTEGER     NOT NULL DEFAULT 0,
  recovery_successes      INTEGER     NOT NULL DEFAULT 0,
  behaviour_flags         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  agent_memory            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  level_states            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  time_paused_seconds     INTEGER     NOT NULL DEFAULT 0,
  paused_at               TIMESTAMPTZ,
  recovery_started_at     TIMESTAMPTZ,
  focus_violations        INTEGER     NOT NULL DEFAULT 0,
  security_warnings       INTEGER     NOT NULL DEFAULT 0,
  security_life_penalties INTEGER     NOT NULL DEFAULT 0,
  last_violation_at       TIMESTAMPTZ,
  last_violation_reason   TEXT,
  UNIQUE(team_id)
);

-- ============================================================================
-- LEVEL RESULTS
-- completed stays INTEGER (0/1) — engine uses it as boolean-compatible int.
-- ============================================================================
CREATE TABLE IF NOT EXISTS level_results (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  level        INTEGER     NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  failures     INTEGER     NOT NULL DEFAULT 0,
  completed    INTEGER     NOT NULL DEFAULT 0,
  score        INTEGER     NOT NULL DEFAULT 0
);

-- ============================================================================
-- ADMIN CONFIG  (key-value store — unchanged structure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECURITY EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id         UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('warning','life_penalty')),
  reason          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  penalty_applied INTEGER     NOT NULL DEFAULT 0
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_team       ON game_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_level_results_sess  ON level_results(session_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ses ON security_events(session_id);
CREATE INDEX IF NOT EXISTS idx_teams_auth_user     ON teams(auth_user_id);

-- ============================================================================
-- SEED DEFAULT ADMIN CONFIG
-- ============================================================================
INSERT INTO admin_config (key, value) VALUES
  ('game_duration_seconds',    '900'),
  ('max_recoveries',           '3'),
  ('initial_lives',            '5'),
  ('recovery_window_seconds',  '30'),
  ('registration_open',        'true'),
  ('event_started',            'false'),
  ('secure_mode_enabled',      'true'),
  ('fullscreen_required',      'true'),
  ('violation_cooldown_seconds','2')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- The Express backend uses the service_role key which bypasses RLS entirely,
-- so all game operations work unrestricted through the API.
-- These policies only protect against direct Supabase client access.
-- ============================================================================
ALTER TABLE teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Policies are created inside guarded DO blocks so this script can be re-run
-- safely (CREATE POLICY has no IF NOT EXISTS). Nothing is dropped or altered.

-- Teams: a team can only read its own row
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teams' AND policyname = 'teams_own_read') THEN
    CREATE POLICY teams_own_read ON teams
      FOR SELECT TO authenticated
      USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- Sessions: a team can only read its own session
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_sessions' AND policyname = 'sessions_own_read') THEN
    CREATE POLICY sessions_own_read ON game_sessions
      FOR SELECT TO authenticated
      USING (team_id IN (SELECT id FROM teams WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

-- Level results: a team can only read its own results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'level_results' AND policyname = 'results_own_read') THEN
    CREATE POLICY results_own_read ON level_results
      FOR SELECT TO authenticated
      USING (session_id IN (
        SELECT gs.id FROM game_sessions gs
        JOIN teams t ON t.id = gs.team_id
        WHERE t.auth_user_id = auth.uid()
      ));
  END IF;
END $$;

-- Admin config: all authenticated users can read (game settings are not secret)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_config' AND policyname = 'config_authenticated_read') THEN
    CREATE POLICY config_authenticated_read ON admin_config
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- Audit log & security events: no direct access — service_role only
-- (RLS enabled with no permissive policy = denied for all non-service roles)

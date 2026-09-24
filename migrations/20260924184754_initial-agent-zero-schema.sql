-- ============================================================================
-- Agent Zero — InsForge PostgreSQL schema (ported 1:1 from
-- supabase/migrations/001_initial_schema.sql).
--
-- Data model is unchanged. InsForge-specific notes:
--   * gen_random_uuid() is built in (PostgreSQL 15); pgcrypto is already installed.
--   * auth.users(id) and auth.uid() exist in InsForge and are only referenced here.
--   * The Express backend connects with the database owner role (bypasses RLS).
--     RLS + explicit REVOKEs below only protect direct access by the anon key /
--     signed-in users through InsForge's REST layer.
--   * No BEGIN/COMMIT: the migration runner wraps this file in a transaction.
-- ============================================================================

-- ============================================================================
-- TEAMS  (auth_user_id links each team to its InsForge Auth account)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
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
-- GAME SESSIONS  (one per team; all run/timer/recovery state lives here)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                 UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
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
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.level_results (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  level        INTEGER     NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  failures     INTEGER     NOT NULL DEFAULT 0,
  completed    INTEGER     NOT NULL DEFAULT 0,
  score        INTEGER     NOT NULL DEFAULT 0
);

-- ============================================================================
-- ADMIN CONFIG (key-value)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECURITY EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.security_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  team_id         UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('warning','life_penalty')),
  reason          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  penalty_applied INTEGER     NOT NULL DEFAULT 0
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_team       ON public.game_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_level_results_sess  ON public.level_results(session_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ses ON public.security_events(session_id);
CREATE INDEX IF NOT EXISTS idx_teams_auth_user     ON public.teams(auth_user_id);

-- ============================================================================
-- SEED DEFAULT ADMIN CONFIG (same defaults the backend seeds on boot)
-- ============================================================================
INSERT INTO public.admin_config (key, value) VALUES
  ('game_duration_seconds',     '900'),
  ('max_recoveries',            '3'),
  ('initial_lives',             '5'),
  ('recovery_window_seconds',   '30'),
  ('registration_open',         'true'),
  ('event_started',             'false'),
  ('secure_mode_enabled',       'true'),
  ('fullscreen_required',       'true'),
  ('violation_cooldown_seconds','2')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PRIVILEGES  (defence in depth — InsForge grants broad DML on public tables to
-- runtime roles by default and relies on RLS; narrow that explicitly)
-- ============================================================================
REVOKE ALL ON public.teams           FROM anon, authenticated;
REVOKE ALL ON public.game_sessions   FROM anon, authenticated;
REVOKE ALL ON public.level_results   FROM anon, authenticated;
REVOKE ALL ON public.admin_config    FROM anon, authenticated;
REVOKE ALL ON public.audit_log       FROM anon, authenticated;
REVOKE ALL ON public.security_events FROM anon, authenticated;

-- Only the four read policies below are needed; SELECT is the only privilege granted.
GRANT SELECT ON public.teams         TO authenticated;
GRANT SELECT ON public.game_sessions TO authenticated;
GRANT SELECT ON public.level_results TO authenticated;
GRANT SELECT ON public.admin_config  TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- A team can only read its own row
CREATE POLICY teams_own_read ON public.teams
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- A team can only read its own session
CREATE POLICY sessions_own_read ON public.game_sessions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT id FROM public.teams WHERE auth_user_id = auth.uid()));

-- A team can only read its own level results
CREATE POLICY results_own_read ON public.level_results
  FOR SELECT TO authenticated
  USING (session_id IN (
    SELECT gs.id FROM public.game_sessions gs
    JOIN public.teams t ON t.id = gs.team_id
    WHERE t.auth_user_id = auth.uid()
  ));

-- Game settings are not secret: any signed-in user may read them
CREATE POLICY config_authenticated_read ON public.admin_config
  FOR SELECT TO authenticated
  USING (true);

-- audit_log and security_events: RLS enabled, no policy and no grants =
-- inaccessible to anon/authenticated (owner/service access only).

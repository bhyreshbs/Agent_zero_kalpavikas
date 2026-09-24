-- ============================================================================
-- team_members — one row per registered participant (event registration CSV).
--
-- Every column is TEXT and stores the CSV value exactly as exported; empty CSV
-- cells are stored as NULL (nothing is invented, normalised or reformatted).
-- `team_id` links the participant to the game team (public.teams).
-- Personal data: RLS is enabled with NO policy and all client-role privileges
-- are revoked, so only the backend (database owner role) can read or write it.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_order        INTEGER     NOT NULL,               -- 1 = Team Leader, then CSV order
  source_team_id      TEXT        NOT NULL,               -- CSV "Team ID"
  source_team_name    TEXT        NOT NULL,               -- CSV "Team Name"
  candidate_role      TEXT        NOT NULL CHECK (candidate_role IN ('Team Leader','Team Member')),
  candidate_name      TEXT        NOT NULL,
  candidate_email     TEXT        NOT NULL,
  candidate_mobile    TEXT        NOT NULL,
  candidate_gender    TEXT,
  candidate_location  TEXT,
  user_type           TEXT,
  domain              TEXT,
  course              TEXT,
  specialization      TEXT,
  course_type         TEXT,
  course_duration     TEXT,
  year_of_graduation  TEXT,
  organisation        TEXT,
  designation         TEXT,
  registration_time   TEXT,
  differently_abled   TEXT,
  reg_status          TEXT,                               -- 'Complete' / 'Incomplete' as exported
  ref_code            TEXT,
  payment_status      TEXT,                               -- as exported ('paid')
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_order)
);

-- Exactly one Team Leader per team, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_one_leader
  ON public.team_members (team_id) WHERE candidate_role = 'Team Leader';

-- A participant is registered once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_email
  ON public.team_members (lower(candidate_email));

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);

REVOKE ALL ON public.team_members FROM anon, authenticated;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: inaccessible to anon/authenticated; backend (owner role) only.

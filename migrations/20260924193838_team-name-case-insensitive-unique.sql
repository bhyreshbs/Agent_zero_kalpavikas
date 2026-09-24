-- Team-name login is case-insensitive and ignores surrounding spaces.
-- This index makes that safe at the database level: two teams whose names differ
-- only by capitalisation or leading/trailing spaces can never both exist, so a
-- case-insensitive lookup can never match more than one team.
-- Adds an index only: no team name, password or row is changed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_team_name_ci
  ON public.teams (lower(btrim(team_name)));

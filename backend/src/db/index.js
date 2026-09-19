import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DATABASE_FILE || path.join(__dirname, '../../data/agentzero.sqlite');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema. Kept intentionally simple (SQLite, zero external dependency, zero
// hosting cost) per spec section 35 (Cost Control) and section 19 (Tech
// Stack: "choose ONE coherent backend"). Swappable for Postgres later by
// re-implementing this file only — nothing above the db layer touches SQL
// directly.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id                  TEXT PRIMARY KEY,
  team_name           TEXT NOT NULL UNIQUE,
  member1             TEXT NOT NULL,
  member2             TEXT NOT NULL,
  member3             TEXT,
  contact             TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  payment_status      TEXT NOT NULL DEFAULT 'pending', -- pending | verified | rejected
  registration_status TEXT NOT NULL DEFAULT 'registered', -- registered | checked_in | disqualified
  role                TEXT NOT NULL DEFAULT 'PLAYER', -- PLAYER | VOLUNTEER | ADMIN
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id                   TEXT PRIMARY KEY,
  team_id              TEXT NOT NULL REFERENCES teams(id),
  game_seed            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'not_started',
    -- not_started | tutorial | active | critical | recovering | paused | completed | failed | disqualified
  started_at           TEXT,
  completed_at         TEXT,
  game_duration_seconds INTEGER NOT NULL,
  current_level        INTEGER NOT NULL DEFAULT 0, -- 0 = tutorial
  lives                INTEGER NOT NULL,
  max_lives_gained     INTEGER NOT NULL DEFAULT 0,
  score                INTEGER NOT NULL DEFAULT 0,
  recovery_attempts    INTEGER NOT NULL DEFAULT 0,
  recovery_successes   INTEGER NOT NULL DEFAULT 0,
  behaviour_flags      TEXT NOT NULL DEFAULT '{}', -- JSON: leftChoices, rightChoices, agentTrustCount, etc.
  agent_memory         TEXT NOT NULL DEFAULT '{}', -- JSON: per-agent memory of what's been said/done
  level_states         TEXT NOT NULL DEFAULT '{}', -- JSON: per-level mutable state
  time_paused_seconds  INTEGER NOT NULL DEFAULT 0, -- accumulated pause duration, subtracted from elapsed time
  paused_at            TEXT,
  recovery_started_at  TEXT, -- server timestamp when the current recovery puzzle was issued; authoritative 30s deadline
  focus_violations       INTEGER NOT NULL DEFAULT 0, -- total detected "left the game" events, server-deduplicated
  security_warnings      INTEGER NOT NULL DEFAULT 0, -- how many of those were violation #1 (warning only, no life lost)
  security_life_penalties INTEGER NOT NULL DEFAULT 0, -- how many cost a life (violation #2+)
  last_violation_at      TEXT, -- server timestamp of the most recent violation, used for dedup/cooldown
  last_violation_reason  TEXT, -- visibility_hidden | fullscreen_exit | window_blur
  UNIQUE(team_id) -- one active/lifetime session per team; re-runs go through admin reset
);

CREATE TABLE IF NOT EXISTS level_results (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES game_sessions(id),
  level         INTEGER NOT NULL, -- 0 = tutorial, 1-5 = main levels
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  failures      INTEGER NOT NULL DEFAULT 0,
  completed     INTEGER NOT NULL DEFAULT 0, -- boolean
  score         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor      TEXT NOT NULL, -- 'admin' | teamId | 'system'
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS security_events (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES game_sessions(id),
  team_id        TEXT NOT NULL REFERENCES teams(id),
  type           TEXT NOT NULL, -- warning | life_penalty
  reason         TEXT NOT NULL, -- visibility_hidden | fullscreen_exit | window_blur
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  penalty_applied INTEGER NOT NULL DEFAULT 0 -- boolean: did this event cost a life
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_level_results_session ON level_results(session_id);
CREATE INDEX IF NOT EXISTS idx_security_events_session ON security_events(session_id);
`);

// Lightweight migration for DBs created before a column existed. CREATE TABLE IF NOT
// EXISTS above only helps fresh databases; existing ones need an explicit ALTER TABLE.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('game_sessions', 'recovery_started_at', 'recovery_started_at TEXT');
ensureColumn('game_sessions', 'focus_violations', 'focus_violations INTEGER NOT NULL DEFAULT 0');
ensureColumn('game_sessions', 'security_warnings', 'security_warnings INTEGER NOT NULL DEFAULT 0');
ensureColumn('game_sessions', 'security_life_penalties', 'security_life_penalties INTEGER NOT NULL DEFAULT 0');
ensureColumn('game_sessions', 'last_violation_at', 'last_violation_at TEXT');
ensureColumn('game_sessions', 'last_violation_reason', 'last_violation_reason TEXT');

// Seed default admin-config values if absent.
const defaults = {
  game_duration_seconds: process.env.GAME_DURATION_SECONDS || '900',
  max_recoveries: process.env.MAX_RECOVERIES || '3',
  initial_lives: process.env.INITIAL_LIVES || '5',
  recovery_window_seconds: process.env.RECOVERY_WINDOW_SECONDS || '30',
  registration_open: 'true',
  event_started: 'false',
  // Secure Game Mode / anti-cheat (spec Part 3). Only admins can change these
  // (routes/admin.js is the only writer of admin_config); the player frontend
  // reads them read-only via getClientState().secureMode.
  secure_mode_enabled: process.env.SECURE_MODE_ENABLED || 'true',
  fullscreen_required: process.env.FULLSCREEN_REQUIRED || 'true',
  violation_cooldown_seconds: process.env.VIOLATION_COOLDOWN_SECONDS || '2',
};
const insertDefault = db.prepare(
  `INSERT INTO admin_config (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO NOTHING`
);
for (const [k, v] of Object.entries(defaults)) insertDefault.run(k, String(v));

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM admin_config WHERE key = ?').get(key);
  return row ? row.value : undefined;
}

export function setConfig(key, value) {
  db.prepare(
    `INSERT INTO admin_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

export function logAudit(actor, action, detail = null) {
  db.prepare(
    `INSERT INTO audit_log (id, actor, action, detail) VALUES (lower(hex(randomblob(8))), ?, ?, ?)`
  ).run(actor, action, detail ? JSON.stringify(detail) : null);
}

/**
 * Database layer — PostgreSQL via node-postgres (pg).
 *
 * Replaces the previous SQLite/better-sqlite3 layer. Connects to the
 * Supabase PostgreSQL database using DATABASE_URL.
 *
 * Key design decisions:
 * - pg.Pool for connection pooling (handles 30+ concurrent teams safely)
 * - All helpers are async (await at call sites in engine/routes)
 * - dbGet / dbAll / dbRun mirror the old synchronous prepare().get/all/run API
 * - getClient() returns a pooled client for explicit transactions
 * - JSONB columns are auto-parsed by pg driver — no JSON.parse needed
 */
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ---------------------------------------------------------------------------
// Core query helpers
// ---------------------------------------------------------------------------

/** Run a query, return first row or null. Replaces prepare().get() */
export async function dbGet(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] ?? null;
}

/** Run a query, return all rows. Replaces prepare().all() */
export async function dbAll(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

/** Run a non-SELECT query. Returns { rowCount, rows }. Replaces prepare().run() */
export async function dbRun(sql, params = []) {
  const r = await pool.query(sql, params);
  return { rowCount: r.rowCount, rows: r.rows };
}

/** Get a pool client for manual transaction management. */
export async function getClient() {
  return pool.connect();
}

// ---------------------------------------------------------------------------
// Config helpers (preserved API from old db/index.js)
// ---------------------------------------------------------------------------

export async function getConfig(key) {
  const row = await dbGet('SELECT value FROM admin_config WHERE key = $1', [key]);
  return row ? row.value : undefined;
}

export async function setConfig(key, value) {
  await dbRun(
    `INSERT INTO admin_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

export async function logAudit(actor, action, detail = null) {
  await dbRun(
    `INSERT INTO audit_log (actor, action, detail) VALUES ($1, $2, $3)`,
    [actor, action, detail ? JSON.stringify(detail) : null]
  );
}

// ---------------------------------------------------------------------------
// Startup: seed admin_config defaults (idempotent — ON CONFLICT DO NOTHING)
// Called from server.js once on boot.
// ---------------------------------------------------------------------------
export async function initializeDatabase() {
  const defaults = {
    game_duration_seconds:     process.env.GAME_DURATION_SECONDS    || '900',
    max_recoveries:            process.env.MAX_RECOVERIES            || '3',
    initial_lives:             process.env.INITIAL_LIVES             || '5',
    recovery_window_seconds:   process.env.RECOVERY_WINDOW_SECONDS   || '30',
    registration_open:         'true',
    event_started:             'false',
    secure_mode_enabled:       process.env.SECURE_MODE_ENABLED       || 'true',
    fullscreen_required:       process.env.FULLSCREEN_REQUIRED       || 'true',
    violation_cooldown_seconds: process.env.VIOLATION_COOLDOWN_SECONDS || '2',
  };
  for (const [k, v] of Object.entries(defaults)) {
    await dbRun(
      `INSERT INTO admin_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [k, String(v)]
    );
  }
  console.log('[DB] PostgreSQL connected. Admin config defaults ensured.');
}

/**
 * Database layer — PostgreSQL via node-postgres (pg).
 *
 * Replaces the previous SQLite/better-sqlite3 layer. Connects to the
 * InsForge PostgreSQL database using DATABASE_URL.
 *
 * Key design decisions:
 * - pg.Pool for connection pooling (handles 30+ concurrent teams safely)
 * - All helpers are async (await at call sites in engine/routes)
 * - dbGet / dbAll / dbRun mirror the old synchronous prepare().get/all/run API
 * - getClient() returns a pooled client for explicit transactions
 * - JSONB columns are auto-parsed by pg driver — no JSON.parse needed
 */
import pg from 'pg';

// The InsForge database is a DIRECT (unpooled) Postgres endpoint with
// max_connections = 30 shared with InsForge's own services. Every serverless
// instance owns its own pool, so the per-instance cap must be small:
//   DB_POOL_MAX (default 3) x concurrent Vercel instances must stay well under 30.
// Idle connections are released after 10 s so scaled-down instances free their slots.
const POOL_MAX = Math.max(1, Number.parseInt(process.env.DB_POOL_MAX, 10) || 3);

// SSL: the InsForge URL carries sslmode=require. When the URL already specifies
// sslmode, node-postgres takes SSL settings from it; otherwise fall back to
// SSL in production only (certificate not verified, as before).
const urlHasSslMode = /[?&]sslmode=/.test(process.env.DATABASE_URL || '');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(urlHasSslMode
    ? {}
    : { ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }),
  max: POOL_MAX,
  idleTimeoutMillis: 10_000,
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

/**
 * Get a client for manual transaction management.
 *
 * Two safeguards live here because the game engine's transactions
 * (gameEngine.js) hold a client for the whole action AND call pool.query()
 * (getClientState, logAudit) while holding it, and release the client on early
 * return paths as well as in `finally`:
 *
 *  1. Concurrency cap. Each open transaction needs one extra pooled connection for
 *     those inner pool.query() calls. If every connection were held by a
 *     transaction, all of them would wait forever for a connection (deadlock).
 *     So at most POOL_MAX - 1 transactional clients exist at once; one connection
 *     is always left for plain queries. Extra callers queue (10 s cap).
 *  2. Per-checkout handle. The pooled client object is reused by the next caller,
 *     so calling release() a second time on the raw object would release someone
 *     else's checkout. Callers get a one-shot handle instead: release() is
 *     idempotent, and query() on a released handle is refused (ROLLBACK is a no-op).
 */
const MAX_TX_CLIENTS = Math.max(1, POOL_MAX - 1);
const SLOT_WAIT_MS = 10_000;
let slotsInUse = 0;
const slotWaiters = [];

function acquireSlot() {
  if (slotsInUse < MAX_TX_CLIENTS) {
    slotsInUse += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const waiter = { resolve, timer: null };
    waiter.timer = setTimeout(() => {
      const i = slotWaiters.indexOf(waiter);
      if (i >= 0) slotWaiters.splice(i, 1);
      reject(new Error('Database busy: too many concurrent game transactions.'));
    }, SLOT_WAIT_MS);
    slotWaiters.push(waiter);
  });
}

function releaseSlot() {
  const next = slotWaiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // slot is handed over, slotsInUse unchanged
  } else {
    slotsInUse -= 1;
  }
}

export async function getClient() {
  await acquireSlot();
  let raw;
  try {
    raw = await pool.connect();
  } catch (err) {
    releaseSlot();
    throw err;
  }
  const rawRelease = raw.release; // this checkout's own release function
  let released = false;
  return {
    query: (...args) => {
      if (released) {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 });
        return Promise.reject(new Error('Database client was already released.'));
      }
      return raw.query(...args);
    },
    release: (err) => {
      if (released) return;
      released = true;
      try { rawRelease(err); } finally { releaseSlot(); }
    },
  };
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

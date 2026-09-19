// Server-authoritative timing — spec section 22. The client only ever displays
// what the server reports; it never owns the countdown.

export function elapsedSeconds(session) {
  if (!session.started_at) return 0;
  const start = new Date(session.started_at + 'Z').getTime();
  const now = Date.now();
  const pausedExtra =
    session.status === 'paused' && session.paused_at
      ? Math.floor((now - new Date(session.paused_at + 'Z').getTime()) / 1000)
      : 0;
  const raw = Math.floor((now - start) / 1000) - session.time_paused_seconds - pausedExtra;
  return Math.max(0, raw);
}

export function remainingSeconds(session) {
  const remaining = session.game_duration_seconds - elapsedSeconds(session);
  return Math.max(0, remaining);
}

export function isExpired(session) {
  return session.started_at !== null && remainingSeconds(session) <= 0 && session.status !== 'completed';
}

// Server-authoritative recovery deadline (spec: "server must reject recovery
// submissions after 30 seconds" — the frontend's countdown is display-only).
export function recoveryElapsedSeconds(session) {
  if (!session.recovery_started_at) return Infinity;
  const start = new Date(session.recovery_started_at + 'Z').getTime();
  return (Date.now() - start) / 1000; // fractional — compared against window in isRecoveryExpired
}

export function isRecoveryExpired(session, windowSeconds) {
  return recoveryElapsedSeconds(session) >= windowSeconds;
}

// For a session that has already ended (completed/failed/disqualified), the
// displayed remaining-time must be a frozen figure from the moment it ended —
// not a live recompute against Date.now(), which would keep drifting
// (decreasing, then clamping to 0) every time the results screen re-polls
// after the run is actually over.
export function finalRemainingSeconds(session) {
  if (!session.started_at || !session.completed_at) return remainingSeconds(session);
  const start = new Date(session.started_at + 'Z').getTime();
  const end = new Date(session.completed_at + 'Z').getTime();
  const elapsed = Math.max(0, Math.floor((end - start) / 1000) - (session.time_paused_seconds || 0));
  return Math.max(0, session.game_duration_seconds - elapsed);
}

// Millisecond-resolution versions of the above, used only for scoring. A
// team's competitive score should distinguish finishes even a few hundred
// milliseconds apart, which second-level rounding could otherwise collapse
// into a tie. Only meaningful once a run is actually finalized (completed_at
// set) — returns 0 elapsed / full remaining otherwise.
export function finalElapsedMs(session) {
  if (!session.started_at || !session.completed_at) return 0;
  const start = new Date(session.started_at + 'Z').getTime();
  const end = new Date(session.completed_at + 'Z').getTime();
  const elapsed = end - start - (session.time_paused_seconds || 0) * 1000;
  return Math.max(0, elapsed);
}

export function finalRemainingMs(session) {
  const totalMs = (session.game_duration_seconds || 0) * 1000;
  return Math.max(0, totalMs - finalElapsedMs(session));
}

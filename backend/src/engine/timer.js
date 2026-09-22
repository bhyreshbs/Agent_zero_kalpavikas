// Server-authoritative timing — spec section 22. The client only ever displays
// what the server reports; it never owns the countdown.

// TIMING MAPPING (No DB Migration):
// - started_at: Global run start (when Sector 1 starts)
// - time_paused_seconds: Accumulated active gameplay seconds from completed sectors
// - paused_at: activeStartedAt timestamp while the current sector is active
// - game_duration_seconds: 900
// - status: 'active' when running, 'transition' when paused between sectors

export function elapsedSeconds(session) {
  if (!session.started_at) return 0;
  
  let elapsed = session.time_paused_seconds || 0;
  
  // If the timer is actively running in a sector, add the time since this sector started.
  // The 'paused_at' field acts as the 'activeStartedAt' timestamp.
  if (session.status === 'active' && session.paused_at) {
    const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
    const start = pAt.getTime();
    elapsed += Math.floor((Date.now() - start) / 1000);
  }
  
  return Math.max(0, elapsed);
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
  const rAt = session.recovery_started_at instanceof Date ? session.recovery_started_at : new Date(session.recovery_started_at + (session.recovery_started_at.endsWith('Z') ? '' : 'Z'));
  const start = rAt.getTime();
  return (Date.now() - start) / 1000; // fractional — compared against window in isRecoveryExpired
}

export function isRecoveryExpired(session, windowSeconds) {
  return recoveryElapsedSeconds(session) >= windowSeconds;
}

// For a session that has already ended (completed/failed/disqualified), the
// displayed remaining-time must be a frozen figure from the moment it ended —
// not a live recompute against Date.now(), which would keep drifting.
// Since `finalizeRun` will have already folded the final active sector's time
// into `time_paused_seconds`, we can just read that accumulated value directly.
export function finalRemainingSeconds(session) {
  if (!session.started_at || !session.completed_at) return remainingSeconds(session);
  const elapsed = session.time_paused_seconds || 0;
  return Math.max(0, session.game_duration_seconds - elapsed);
}

// Millisecond-resolution versions of the above, used only for scoring.
export function finalElapsedMs(session) {
  if (!session.started_at || !session.completed_at) return 0;
  // Fallback to second precision since accumulated elapsed time is stored in seconds
  return (session.time_paused_seconds || 0) * 1000;
}

export function finalRemainingMs(session) {
  const totalMs = (session.game_duration_seconds || 0) * 1000;
  return Math.max(0, totalMs - finalElapsedMs(session));
}

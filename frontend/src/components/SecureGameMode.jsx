// UI for Secure Game Mode / anti-cheat (spec Part 3): the one-time gate shown
// before the competitive timer starts, and the warning/violation overlay
// shown when the server confirms a detected violation. Both use Agent Zero's
// own visual language (terminal panel, monospace, accent/danger colors) —
// deliberately NOT a generic browser alert() or a plain lockdown-app style.

// Fullscreen API varies slightly across browsers; this never throws even
// where it's unsupported (e.g. some in-app/embedded browsers) — Secure Game
// Mode still works (violations are still detected/reported), it just can't
// force fullscreen there.
export async function tryEnterFullscreen() {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!request) return false;
  try {
    await request.call(el);
    return true;
  } catch {
    return false;
  }
}

export function isFullscreenSupported() {
  return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || document.documentElement.msRequestFullscreen);
}

export function SecureGameGate({ onEnter, fullscreenRequired }) {
  return (
    <div className="az-security-overlay">
      <div className="az-glass-panel az-security-panel">
        <span className="az-badge az-security-badge">
          <span className="az-status-beacon" />
          SECURE GAME MODE // ACTIVE SURVEILLANCE
        </span>
        <h3 className="az-title az-security-title">STATION INTEGRITY PROTOCOL</h3>
        <p className="az-security-lead">Agent Zero surveillance must remain focused during your run.</p>
        <p className="az-hint az-security-hint">
          Leaving the game tab, minimizing the window, or exiting full-screen is detected and penalized.
        </p>
        <div className="az-security-rules">
          <div className="az-security-rule-row">
            <span className="az-security-rule-num">1st</span>
            <span className="az-security-rule-text">Violation — <strong style={{ color: 'var(--az-accent)' }}>TACTICAL WARNING</strong></span>
          </div>
          <div className="az-security-rule-row">
            <span className="az-security-rule-num">Further</span>
            <span className="az-security-rule-text">Violations — <strong style={{ color: 'var(--az-danger)' }}>-1 SHIELD LIFE</strong></span>
          </div>
        </div>
        {!fullscreenRequired ? null : !isFullscreenSupported() ? (
          <p className="az-hint" style={{ marginTop: 14, opacity: 0.7 }}>
            Fullscreen isn't supported in this browser — focus monitoring still applies.
          </p>
        ) : null}
        <button
          className="az-btn-primary az-btn-large az-security-btn"
          onClick={onEnter}
        >
          ENTER SECURE GAME MODE ▸
        </button>
      </div>
    </div>
  );
}

export function SecurityViolationModal({ violation, onReturn }) {
  if (!violation) return null;
  const first = violation.warning;
  return (
    <div className="az-security-overlay">
      <div className={`az-glass-panel az-security-panel ${first ? 'is-warning' : 'az-security-panel-danger'}`}>
        <span className={`az-badge ${first ? 'az-badge-warning' : 'az-badge-danger'}`}>
          <span className={first ? 'az-warning-dot' : 'az-danger-dot'} />
          {first ? 'SECURITY WARNING' : 'CONTAINMENT BREACH // VIOLATION'}
        </span>
        <h3 className="az-title" style={{ color: first ? 'var(--az-amber)' : 'var(--az-danger)', margin: '10px 0 6px' }}>
          {first ? 'FOCUS LOST DETECTED' : 'UNAUTHORIZED TAB SWITCH'}
        </h3>
        <p style={{ margin: '10px 0 14px', fontSize: '1.05rem' }}>
          {first ? 'You left the Agent Zero game session.' : 'You left the active simulation again.'}
        </p>
        {first ? (
          <div className="az-security-violation-detail">
            <p className="az-hint">This is your FIRST security violation. No life has been lost.</p>
            <p className="az-hint" style={{ color: 'var(--az-amber)' }}>Further violations will cost 1 shield life.</p>
          </div>
        ) : (
          <div className="az-security-violation-detail">
            <p style={{ color: 'var(--az-danger)', fontWeight: 'bold', fontSize: '1.2rem' }}>-1 SHIELD LIFE PENALTY</p>
          </div>
        )}
        <button
          className={first ? 'az-btn-secondary az-btn-large' : 'az-btn-danger az-btn-large'}
          style={{ marginTop: 20, width: '100%' }}
          onClick={onReturn}
        >
          Return To Mission ▸
        </button>
      </div>
    </div>
  );
}


import { useState } from 'react';

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

// Blocks the whole game until the browser is genuinely fullscreen. `onEnter`
// must resolve to the real fullscreen state so a rejected request is never
// treated as success.
export function FullscreenRequiredGate({ onEnter, wasViolation }) {
  const [rejected, setRejected] = useState(false);
  const supported = isFullscreenSupported();
  return (
    <div className="ds-page ds-page-embed">
      <div className="ds-overlay" style={{ zIndex: 9000, background: 'var(--ds-bg)' }}>
        <div
          className="ds-modal ds-modal-sm"
          role="alertdialog"
          aria-modal="true"
          style={{ borderColor: wasViolation ? 'var(--ds-danger)' : 'var(--ds-primary)' }}
        >
          <div className="ds-modal-header">
            <span className={`ds-badge ${wasViolation ? 'ds-badge-danger' : ''}`}>
              <span className={`ds-dot ${wasViolation ? 'ds-dot-danger' : 'ds-dot-warn'}`} />
              {wasViolation ? 'Security violation // Fullscreen lost' : 'Security gate // Fullscreen'}
            </span>
          </div>
          <div className="ds-modal-body ds-stack">
            <h3 className="ds-card-title" style={{ color: wasViolation ? 'var(--ds-danger-text)' : 'var(--ds-primary)' }}>
              Fullscreen required
            </h3>
            <p className="ds-body" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>
              Mission execution requires a fullscreen environment.
            </p>
            <p className="ds-mono-sm" style={{ margin: 0 }}>Return to fullscreen to continue.</p>
            {!supported && (
              <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>
                This browser does not support fullscreen. Open the game in a fullscreen-capable browser to play.
              </p>
            )}
            {rejected && supported && (
              <p className="ds-alert ds-alert-warn" role="alert" style={{ margin: 0 }}>
                The browser did not enter fullscreen. Try again, or press F11.
              </p>
            )}
          </div>
          <div className="ds-modal-footer">
            <button
              className="ds-btn ds-btn-primary ds-btn-block"
              disabled={!supported}
              onClick={async () => { setRejected(!(await onEnter())); }}
            >
              Enter fullscreen to continue ▸
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SecureGameGate({ onEnter, fullscreenRequired }) {
  return (
    <div className="ds-page ds-page-embed">
      <div className="ds-overlay" style={{ zIndex: 60 }}>
        <div className="ds-modal ds-modal-sm" role="dialog" aria-modal="true">
          <div className="ds-modal-header">
            <span className="ds-badge ds-badge-chamfer">
              <span className="ds-dot ds-dot-live" /> Secure game mode // Active surveillance
            </span>
          </div>
          <div className="ds-modal-body ds-stack">
            <h3 className="ds-card-title">Station Integrity Protocol</h3>
            <p className="ds-body" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>
              Agent Zero surveillance must remain focused during your run.
            </p>
            <p className="ds-mono-sm" style={{ margin: 0 }}>
              Leaving the game tab, minimizing the window, or exiting full-screen is detected and penalized.
            </p>
            <div className="ds-list ds-card-inset ds-mono">
              <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                <span className="ds-label">1st violation</span>
                <span className="ds-badge">Tactical warning</span>
              </div>
              <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                <span className="ds-label">Further violations</span>
                <span className="ds-badge ds-badge-danger">-1 shield life</span>
              </div>
            </div>
            {!fullscreenRequired ? null : !isFullscreenSupported() ? (
              <p className="ds-alert ds-alert-warn" style={{ margin: 0 }}>
                Fullscreen isn't supported in this browser — focus monitoring still applies.
              </p>
            ) : null}
          </div>
          <div className="ds-modal-footer">
            <button className="ds-btn ds-btn-primary ds-btn-block" onClick={onEnter}>
              Enter secure game mode ▸
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SecurityViolationModal({ violation, onReturn }) {
  if (!violation) return null;
  const first = violation.warning;
  return (
    <div className="ds-page ds-page-embed">
      <div className="ds-overlay" style={{ zIndex: 60 }}>
        <div
          className="ds-modal ds-modal-sm"
          role="alertdialog"
          aria-modal="true"
          style={{ borderColor: first ? 'var(--ds-primary)' : 'var(--ds-danger)' }}
        >
          <div className="ds-modal-header">
            <span className={`ds-badge ${first ? '' : 'ds-badge-danger'}`}>
              <span className={`ds-dot ${first ? 'ds-dot-warn' : 'ds-dot-danger'}`} />
              {first ? 'Security warning' : 'Containment breach // Violation'}
            </span>
          </div>
          <div className="ds-modal-body ds-stack">
            <h3 className="ds-card-title" style={{ color: first ? 'var(--ds-primary)' : 'var(--ds-danger-text)' }}>
              {first ? 'Focus lost detected' : 'Unauthorized tab switch'}
            </h3>
            <p className="ds-body" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>
              {first ? 'You left the Agent Zero game session.' : 'You left the active simulation again.'}
            </p>
            {first ? (
              <>
                <p className="ds-alert" style={{ margin: 0 }}>This is your FIRST security violation. No life has been lost.</p>
                <p className="ds-alert ds-alert-warn" style={{ margin: 0 }}>Further violations will cost 1 shield life.</p>
              </>
            ) : (
              <p className="ds-alert ds-alert-error" style={{ margin: 0, fontWeight: 600 }}>-1 SHIELD LIFE PENALTY</p>
            )}
          </div>
          <div className="ds-modal-footer">
            <button
              className={`ds-btn ds-btn-block ${first ? 'ds-btn-secondary' : 'ds-btn-danger'}`}
              onClick={onReturn}
            >
              Return to mission ▸
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useGame } from '../hooks/useGame.js';
import TopNav from '../components/TopNav.jsx';
import { sfx } from '../sound.js';

export default function Lobby() {
  const nav = useNavigate();
  const { state, loading, error, start } = useGame();

  useEffect(() => {
    if (state && state.status !== 'not_started') nav('/play');
  }, [state, nav]);

  async function handleStart() {
    sfx.click();
    sfx.levelTransition();
    await start();
    nav('/play');
  }

  return (
    <div className="az-lobby-page">
      <div className="az-scene-bg" />
      <TopNav />
      <main className="az-shell az-lobby-shell" style={{ maxWidth: 680 }}>
        <div className="az-lobby-header">
          <span className="az-badge az-lobby-badge">
            <span className="az-status-beacon" />
            MISSION STAGING AREA
          </span>
          <h2 className="az-title az-lobby-title">TEAM LOBBY</h2>
          <p className="az-hint az-lobby-hint">You are connected to Echo Station. Waiting for team leader to start the game.</p>
        </div>

        <div className="az-glass-panel az-lobby-panel">
          {loading && (
            <div className="az-telemetry-sync-notice">
              <span className="az-telemetry-dot" /> SYNCHRONIZING SECURE SESSION TELEMETRY…
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p className="az-error az-lobby-error">{error}</p>
              <p className="az-hint" style={{ marginBottom: 18 }}>
                Please authorize with your assigned squad credentials.
              </p>
              <div className="az-actions" style={{ justifyContent: 'center' }}>
                <button className="az-btn-secondary" onClick={() => nav('/login')}>
                  Squad Login
                </button>
              </div>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="az-lobby-grid">
                <div className="az-lobby-stat-card">
                  <div className="az-sub az-lobby-stat-label">TEAM TELEMETRY</div>
                  <div className="az-lobby-stat-val">SYNCHED</div>
                  <span className="az-lobby-stat-dot" />
                </div>
                <div className="az-lobby-stat-card">
                  <div className="az-sub az-lobby-stat-label">SHARED CLOCK</div>
                  <div className="az-lobby-stat-val">15:00</div>
                  <span className="az-lobby-stat-dot" />
                </div>
                <div className="az-lobby-stat-card">
                  <div className="az-sub az-lobby-stat-label">STARTING LIVES</div>
                  <div className="az-lobby-stat-val">5 SHIELDS</div>
                  <span className="az-lobby-stat-dot" />
                </div>
              </div>

              <div className="az-lobby-briefing-box">
                <p className="az-lobby-lead">
                  Your shared squad session, synchronized timer, and life pool are ready.
                </p>
                <p className="az-hint az-lobby-disclaimer">
                  Once you initiate the orientation, the competitive clock will start when the tutorial concludes. All teammates share the same session.
                </p>
              </div>

              <button
                className="az-btn-primary az-btn-large az-lobby-cta"
                onClick={handleStart}
                onMouseEnter={() => sfx.hover()}
              >
                INITIATE ORIENTATION PROTOCOL ▸
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

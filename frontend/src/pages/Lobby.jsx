import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useGame } from '../hooks/useGame.js';
import TopNav from '../components/TopNav.jsx';
import { tryEnterFullscreen } from '../components/SecureGameMode.jsx';
import { sfx } from '../sound.js';

export default function Lobby() {
  const nav = useNavigate();
  const { state, loading, error, start } = useGame();
  const teamName = localStorage.getItem('az_team_name');

  useEffect(() => {
    if (state && state.status !== 'not_started') nav('/play');
  }, [state, nav]);

  async function handleStart() {
    sfx.click();
    sfx.levelTransition();
    tryEnterFullscreen(); // must run inside the click gesture, before any await
    await start();
    nav('/play');
  }

  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <TopNav />
      <main className="ds-container ds-stack" style={{ maxWidth: 720, gap: 'var(--ds-space-lg)' }}>
        <header className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
          <div className="ds-row">
            <span className="ds-badge ds-badge-chamfer">Mission staging area</span>
            {teamName && <span className="ds-badge ds-badge-muted">Unit: {teamName}</span>}
          </div>
          <h1 className="ds-title">Team Lobby</h1>
          <p className="ds-mono-sm" style={{ margin: 0 }}>
            You are connected to Echo Station. Waiting for team leader to start the game.
          </p>
        </header>

        <div className="ds-card">
          <div className="ds-card-header">
            <span className="ds-label">Session status</span>
            <span className="ds-mono-sm">
              <span className={`ds-dot ${loading ? 'ds-dot-warn' : error ? 'ds-dot-danger' : 'ds-dot-live'}`} />{' '}
              {loading ? 'Syncing' : error ? 'Offline' : 'Linked'}
            </span>
          </div>

          <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
            {loading && (
              <p className="ds-loading"><span className="ds-spinner" /> Synchronizing secure session telemetry…</p>
            )}

            {error && (
              <div className="ds-stack">
                <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>{error}</p>
                <p className="ds-mono-sm" style={{ margin: 0 }}>Please authorize with your assigned squad credentials.</p>
                <div className="ds-row">
                  <button className="ds-btn ds-btn-secondary" onClick={() => nav('/login')}>Squad login</button>
                </div>
              </div>
            )}

            {!loading && !error && (
              <>
                <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--ds-space-sm)' }}>
                  <div className="ds-stat">
                    <span className="ds-label">Team telemetry</span>
                    <span className="ds-stat-value" style={{ fontSize: 18 }}>SYNCHED</span>
                  </div>
                  <div className="ds-stat">
                    <span className="ds-label">Shared clock</span>
                    <span className="ds-stat-value" style={{ fontSize: 18 }}>15:00</span>
                  </div>
                  <div className="ds-stat">
                    <span className="ds-label">Starting lives</span>
                    <span className="ds-stat-value" style={{ fontSize: 18 }}>5 SHIELDS</span>
                  </div>
                </div>

                <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
                  <p className="ds-body" style={{ margin: 0 }}>
                    Your shared squad session, synchronized timer, and life pool are ready.
                  </p>
                  <p className="ds-mono-sm" style={{ margin: 0 }}>
                    Once you initiate the orientation, the competitive clock will start when the tutorial concludes. All teammates share the same session.
                  </p>
                </div>

                <button
                  className="ds-btn ds-btn-primary ds-btn-block"
                  style={{ minHeight: 52 }}
                  onClick={handleStart}
                  onMouseEnter={() => sfx.hover()}
                >
                  Initiate orientation protocol ▸
                </button>
              </>
            )}
          </div>
        </div>
      </main>
      <div className="ds-footer-strip">Echo Station // Staging depot // Authorized eyes only</div>
    </div>
  );
}

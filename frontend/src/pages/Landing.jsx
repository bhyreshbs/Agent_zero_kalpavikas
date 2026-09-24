import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HeroCanvas from '../components/three/HeroCanvas.jsx';
import { IconPlay } from '../components/GameIcons.jsx';
import TopNav from '../components/TopNav.jsx';
import { tryEnterFullscreen } from '../components/SecureGameMode.jsx';
import { sfx } from '../sound.js';
import { isLoggedIn, logout } from '../api/client.js';

export default function Landing() {
  const loggedIn = isLoggedIn();
  const [showBriefing, setShowBriefing] = useState(false);
  const teamName = localStorage.getItem('az_team_name');

  useEffect(() => {
    if (!showBriefing) return undefined;
    const onKey = (e) => e.key === 'Escape' && setShowBriefing(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showBriefing]);

  return (
    <div className="az-gamemenu-screen">
      {/* 3D background with Spline robot (unchanged) */}
      <HeroCanvas />

      {/* Shared Agent Zero header */}
      <TopNav />

      <div className="ds-page ds-page-embed">
        <main className="az-gamemenu-body ds-landing-body">
          <div className="ds-landing-dock">
            {/* Main menu */}
            <aside className="ds-card ds-card-glass">
              <div className="ds-card-header">
                <span className="ds-badge ds-badge-chamfer">
                  <span className="ds-dot ds-dot-live" /> Main menu
                </span>
                <span className="ds-mono-sm">SEC-v4.2</span>
              </div>

              <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
                {loggedIn && teamName && (
                  <span className="ds-mono-sm">Operative unit: <span className="ds-accent">{teamName}</span></span>
                )}
                <Link
                  to={loggedIn ? '/map' : '/login'}
                  className="ds-btn ds-btn-primary ds-btn-block"
                  style={{ justifyContent: 'space-between', minHeight: 56 }}
                  onClick={() => { sfx.click(); tryEnterFullscreen(); }}
                  onMouseEnter={() => sfx.hover()}
                >
                  <span className="ds-stack" style={{ gap: 0, alignItems: 'flex-start' }}>
                    <span>{loggedIn ? 'Resume game' : 'Start game'}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', opacity: 0.75 }}>Enter Echo Station</span>
                  </span>
                  <IconPlay size={16} />
                </Link>
              </div>

              <nav className="ds-menu" aria-label="Main menu" style={{ borderTop: '1px solid var(--ds-frame)' }}>
                <Link to={loggedIn ? '/play' : '/login'} className="ds-menu-item" onClick={() => { sfx.click(); if (loggedIn) tryEnterFullscreen(); }} onMouseEnter={() => sfx.hover()}>
                  <span className="ds-menu-index">01</span>
                  <span className="ds-menu-name">How to play (tutorial)</span>
                  <span className="ds-menu-arrow">›</span>
                </Link>
                <Link to="/map" className="ds-menu-item" onClick={() => sfx.click()} onMouseEnter={() => sfx.hover()}>
                  <span className="ds-menu-index">02</span>
                  <span className="ds-menu-name">Level map</span>
                  <span className="ds-menu-arrow">›</span>
                </Link>
                <a
                  href="#protocol-dossier"
                  role="button"
                  className="ds-menu-item"
                  onClick={(e) => { e.preventDefault(); sfx.click(); setShowBriefing(true); }}
                  onMouseEnter={() => sfx.hover()}
                >
                  <span className="ds-menu-index">03</span>
                  <span className="ds-menu-name">Game rules</span>
                  <span className="ds-menu-arrow">›</span>
                </a>
                {loggedIn && (
                  <a
                    href="#logout"
                    role="button"
                    className="ds-menu-item"
                    onClick={async (e) => {
                      e.preventDefault();
                      sfx.click();
                      await logout();
                      window.location.reload();
                    }}
                    onMouseEnter={() => sfx.hover()}
                  >
                    <span className="ds-menu-index">04</span>
                    <span className="ds-menu-name">Log out</span>
                    <span className="ds-menu-arrow">›</span>
                  </a>
                )}
              </nav>
            </aside>

            {/* Mission directive */}
            <div className="ds-card ds-card-glass">
              <div className="ds-card-header">
                <span className="ds-label ds-accent">Your mission</span>
                <span className="ds-stamp">Top secret // Zero</span>
              </div>
              <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
                <p className="ds-body" style={{ margin: 0 }}>
                  &ldquo;Enter the station, find the missing AI Core, and escape before time runs out.&rdquo;
                </p>
                <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                  <span className="ds-mono-sm">Status: <span style={{ color: 'var(--ds-success-text)' }}>Secure</span></span>
                  <span className="ds-mono-sm">Target: Agent Zero</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Game rules modal */}
        {showBriefing && (
          <div className="ds-overlay" onClick={() => setShowBriefing(false)}>
            <div className="ds-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="ds-modal-header">
                <div className="ds-stack" style={{ gap: 4 }}>
                  <span className="ds-label">Echo Station</span>
                  <h3 className="ds-card-title">Game rules</h3>
                </div>
                <button className="ds-modal-close" onClick={() => setShowBriefing(false)} aria-label="Close">✕</button>
              </div>

              <div className="ds-modal-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
                <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 'var(--ds-space-sm)' }}>
                  {[['5', 'Initial lives'], ['5', 'Sectors'], ['15M', 'Chrono'], ['2–3', 'Unit size'], ['TIER-1', 'Clearance']].map(([v, l]) => (
                    <div key={l} className="ds-card-inset" style={{ padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                      <div className="ds-num" style={{ fontSize: 20, lineHeight: '28px' }}>{v}</div>
                      <span className="ds-label">{l}</span>
                    </div>
                  ))}
                </div>

                <ol className="ds-body" style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 15, lineHeight: '24px' }}>
                  <li><strong>Assemble Operatives:</strong> Squad of 2–3 players under shared telemetry (₹100 squad verification).</li>
                  <li><strong>Facility Infiltration:</strong> 15-minute countdown starts upon entering the facility.</li>
                  <li><strong>Talk to Survive:</strong> Use the chat box to communicate. You must negotiate, lie, or reassure the AI to open new paths.</li>
                  <li><strong>Navigate 5 Sectors:</strong> Solve interactive physical and social puzzles.</li>
                  <li><strong>Emergency Recovery:</strong> Failures cost lives; enter emergency AI chamber to restore shields.</li>
                  <li><strong>Unmask Agent Zero:</strong> Face the autonomous facility overseer in the central core.</li>
                  <li><strong>Tactical Leaderboard:</strong> Fastest surviving teams win the operation.</li>
                </ol>
              </div>

              <div className="ds-modal-footer">
                <button className="ds-btn ds-btn-primary" onClick={() => setShowBriefing(false)}>
                  Acknowledge directive ▸
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

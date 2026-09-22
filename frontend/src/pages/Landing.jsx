import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HeroCanvas from '../components/three/HeroCanvas.jsx';
import MuteToggle from '../components/MuteToggle.jsx';
import { IconPlay, IconBook, IconTrophy, IconKey, IconMap, IconGear, IconStar, IconUser } from '../components/GameIcons.jsx';
import { sfx } from '../sound.js';
import { isLoggedIn, logout } from '../api/client.js';

export default function Landing() {
  const nav = useNavigate();
  const loggedIn = isLoggedIn();
  const [showBriefing, setShowBriefing] = useState(false);

  return (
    <div className="az-gamemenu-screen">
      {/* 3D Background with Robot Character & Floating City */}
      <HeroCanvas />

      {/* Top Header Bar - Tactical Game HUD */}
      <header className="az-gamemenu-topbar">
        <div className="az-brand-hud">
          <div className="az-brand-sigil">
            <span className="az-sigil-delta">▲</span>
            <span className="az-sigil-tag">OPS</span>
          </div>
          <div className="az-brand-meta">
            <div className="az-brand-title">AGENT ZERO</div>
            <div className="az-brand-subtitle">ESCAPE ROOM // ECHO STATION</div>
          </div>
        </div>

        {/* Top-Right Player Profile HUD Widget */}
        <div className="az-operative-hud">
          <Link
            to={loggedIn ? "/map" : "/login"}
            className="az-operative-badge"
            onClick={() => sfx.click()}
            onMouseEnter={() => sfx.hover()}
          >
            <div className="az-badge-status-ring">
              <IconUser size={13} color="#00f0ff" />
            </div>
            <div className="az-badge-intel">
              <div className="az-badge-callsign">{loggedIn ? "PLAYER PROFILE" : "GUEST PLAYER"}</div>
              <div className="az-badge-clearance">STATUS: READY TO PLAY</div>
            </div>
          </Link>
          <div className="az-hud-actions">
            <MuteToggle />
            <button
              className="az-hud-icon-btn"
              onClick={() => { sfx.click(); setShowBriefing(true); }}
              title="System Dossier & Rules"
              onMouseEnter={() => sfx.hover()}
            >
              <IconGear size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Content Layer */}
      <main className="az-gamemenu-body">
        {/* Left Action Menu Column - Compact Tactical Console & Independent Directive */}
        <div className="az-gamemenu-left-dock">
          <aside className="az-command-console">
            <div className="az-console-header">
              <div className="az-console-badge">
                <span className="az-pulse-beacon" />
                <span className="az-console-title">MAIN MENU</span>
              </div>
              <div className="az-console-code">SEC-v4.2</div>
            </div>

            <Link
              to={loggedIn ? "/map" : "/login"}
              className="az-btn-tactical-play az-console-primary-link"
              onClick={() => sfx.click()}
              onMouseEnter={() => sfx.hover()}
            >
              <div className="az-tactical-play-content">
                <span className="az-tactical-play-label">{loggedIn ? "RESUME GAME" : "START GAME"}</span>
                <span className="az-tactical-play-sub">ENTER ECHO STATION</span>
              </div>
              <div className="az-tactical-play-chevron">
                <IconPlay size={16} />
              </div>
            </Link>

            <nav className="az-console-nav">
              <Link to={loggedIn ? "/play" : "/login"} className="az-console-item" onClick={() => sfx.click()} onMouseEnter={() => sfx.hover()}>
                <span className="az-item-index">01</span>
                <span className="az-item-name">How to Play (Tutorial)</span>
                <span className="az-item-arrow">›</span>
              </Link>
              <Link to="/map" className="az-console-item" onClick={() => sfx.click()} onMouseEnter={() => sfx.hover()}>
                <span className="az-item-index">02</span>
                <span className="az-item-name">Level Map</span>
                <span className="az-item-arrow">›</span>
              </Link>
              <Link to="/leaderboard" className="az-console-item" onClick={() => sfx.click()} onMouseEnter={() => sfx.hover()}>
                <span className="az-item-index">03</span>
                <span className="az-item-name">Leaderboard</span>
                <span className="az-item-arrow">›</span>
              </Link>
              <a
                href="#protocol-dossier"
                role="button"
                className="az-console-item"
                onClick={(e) => { e.preventDefault(); sfx.click(); setShowBriefing(true); }}
                onMouseEnter={() => sfx.hover()}
              >
                <span className="az-item-index">04</span>
                <span className="az-item-name">Game Rules</span>
                <span className="az-item-arrow">›</span>
              </a>
              {loggedIn && (
                <a
                  href="#logout"
                  role="button"
                  className="az-console-item"
                  onClick={async (e) => {
                    e.preventDefault();
                    sfx.click();
                    await logout();
                    window.location.reload();
                  }}
                  onMouseEnter={() => sfx.hover()}
                >
                  <span className="az-item-index">05</span>
                  <span className="az-item-name">Log Out</span>
                  <span className="az-item-arrow">›</span>
                </a>
              )}
            </nav>
          </aside>

          {/* Independent Floating Tactical Directive Widget */}
          <div className="az-standalone-directive">
            <div className="az-directive-header">
              <span className="az-directive-pulse" />
              <span className="az-directive-label">YOUR MISSION</span>
            </div>
            <p className="az-directive-msg">
              &ldquo;Enter the station, find the missing AI Core, and escape before time runs out.&rdquo;
            </p>
            <div className="az-directive-meta">
              <span>STATUS: SECURE</span>
              <span>TARGET: AGENT ZERO</span>
            </div>
          </div>
        </div>
      </main>

      {/* Settings / Operation Briefing Modal */}
      {showBriefing && (
        <div className="az-admin-modal-overlay" onClick={() => setShowBriefing(false)}>
          <div className="az-glass-panel az-briefing-modal" onClick={(e) => e.stopPropagation()}>
            <div className="az-admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="az-status-beacon" />
                <h3 style={{ margin: 0, fontFamily: 'var(--az-font-display)', letterSpacing: '0.12em' }}>
                  ECHO STATION // GAME RULES
                </h3>
              </div>
              <button className="az-admin-modal-close" onClick={() => setShowBriefing(false)}>✕</button>
            </div>

            <div className="az-stat-grid" style={{ margin: '14px 0 20px' }}>
              <div className="az-stat-card"><div className="az-stat-value">5</div><div className="az-sub az-stat-label">INITIAL LIVES</div></div>
              <div className="az-stat-card"><div className="az-stat-value">5</div><div className="az-sub az-stat-label">SECTORS</div></div>
              <div className="az-stat-card"><div className="az-stat-value">15M</div><div className="az-sub az-stat-label">CHRONO</div></div>
              <div className="az-stat-card"><div className="az-stat-value">2–3</div><div className="az-sub az-stat-label">UNIT SIZE</div></div>
              <div className="az-stat-card"><div className="az-stat-value">TIER-1</div><div className="az-sub az-stat-label">CLEARANCE</div></div>
            </div>

            <ol className="az-protocols-list" style={{ fontSize: '0.94rem' }}>
              <li><strong>Assemble Operatives:</strong> Squad of 2–3 players under shared telemetry (₹100 squad verification).</li>
              <li><strong>Facility Infiltration:</strong> 15-minute countdown starts upon entering the facility.</li>
              <li><strong>Talk to Survive:</strong> Use the chat box to communicate. You must negotiate, lie, or reassure the AI to open new paths.</li>
              <li><strong>Navigate 5 Sectors:</strong> Solve interactive physical and social puzzles.</li>
              <li><strong>Emergency Recovery:</strong> Failures cost lives; enter emergency AI chamber to restore shields.</li>
              <li><strong>Unmask Agent Zero:</strong> Face the autonomous facility overseer in the central core.</li>
              <li><strong>Tactical Leaderboard:</strong> Fastest surviving teams win the operation.</li>
            </ol>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button className="az-btn-primary" onClick={() => setShowBriefing(false)}>
                Acknowledge Directive ▸
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



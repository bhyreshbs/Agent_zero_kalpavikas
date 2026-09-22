import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../hooks/useGame.js';
import { IconTrophy, IconMap, IconGear, IconStar, IconLock, IconCheck, IconPlay, IconShield, IconHome, IconUser } from '../components/GameIcons.jsx';
import { sfx } from '../sound.js';

// 5 Main Chapters matching the progression in the reference
const MISSIONS = [
  { index: 0, title: 'System Access', code: 'SEC-01', subtitle: 'Bypass biometric gateway' },
  { index: 1, title: 'Investigate the Server', code: 'SEC-02', subtitle: 'Extract corrupted auth keys' },
  { index: 2, title: 'Analyse the Logs', code: 'SEC-03', subtitle: 'Decode prompt injection traces' },
  { index: 3, title: 'Contain the Threat', code: 'SEC-04', subtitle: 'Isolate compromised subnet' },
  { index: 4, title: 'Final Response', code: 'SEC-05', subtitle: 'Confront Agent Zero core' },
];

export default function LevelMap() {
  const nav = useNavigate();
  const { state, loading } = useGame();
  const [toast, setToast] = useState(null);

  const currentLevel = !state ? 0 : state.status === 'completed' ? 5 : (state.currentLevel ?? 0);
  const completedCount = Math.min(5, Math.max(0, currentLevel));
  const progressPercent = Math.round((completedCount / 5) * 100);

  function handleSelectLevel(index) {
    if (index > currentLevel && state?.status !== 'completed') {
      sfx.fail();
      setToast(`MISSION LOCKED — Complete Level ${currentLevel + 1} first.`);
      setTimeout(() => setToast(null), 2500);
      return;
    }
    sfx.click();
    nav('/play');
  }

  return (
    <div className="az-map-screen">
      {/* Top Tactical Navigation Header */}
      <header className="az-map-nav-header">
        <div className="az-map-brand">
          <span className="az-brand-icon-shield">▲</span>
          <div className="az-map-brand-text">
            <span className="az-brand-title">AGENT ZERO</span>
            <span className="az-brand-motto">Think • Plan • Act • Solve</span>
          </div>
        </div>

        <nav className="az-map-nav-tabs">
          <Link to="/" className="az-map-nav-tab" onClick={() => sfx.click()}>
            <span className="az-nav-tab-icon"><IconHome size={14} /></span> Home
          </Link>
          <div className="az-map-nav-tab is-active">
            <span className="az-nav-tab-icon"><IconMap size={14} /></span> Levels
          </div>
          <Link to="/leaderboard" className="az-map-nav-tab" onClick={() => sfx.click()}>
            <span className="az-nav-tab-icon"><IconTrophy size={14} /></span> Leaderboard
          </Link>
          <Link to="/admin" className="az-map-nav-tab" onClick={() => sfx.click()}>
            <span className="az-nav-tab-icon"><IconGear size={14} /></span> Settings
          </Link>
        </nav>

        <div className="az-map-user-pill">
          <div className="az-user-avatar-circle">
            <span className="az-user-fallback-icon"><IconUser size={14} /></span>
          </div>
          <div className="az-user-info-text">
            <span className="az-user-name">{state?.teamName || 'Harshitha'}</span>
            <span className="az-user-level-badge">Level {currentLevel + 1}</span>
          </div>
          <button 
            className="az-user-settings-btn" 
            title="Tactical Settings"
            onClick={() => { sfx.click(); nav('/admin'); }}
          >
            <IconGear size={14} />
          </button>
          <button 
            className="az-user-settings-btn" 
            title="Terminate Link (Log Out)"
            style={{ marginLeft: 4, color: 'var(--az-danger)' }}
            onClick={() => {
              sfx.click();
              localStorage.removeItem('az_token');
              localStorage.removeItem('az_team_id');
              localStorage.removeItem('az_team_secret');
              nav('/');
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 'bold' }}>⏻</span>
          </button>
        </div>
      </header>

      {/* Main Progression Area */}
      <main className="az-map-main-canvas">
        {/* Left Side: Tactical Command Sidebar */}
        <aside className="az-map-progress-sidebar">
          {/* Operative Dossier Briefing Card */}
          <div className="az-progress-card">
            <div className="az-progress-card-header">
              <h3 className="az-progress-card-title">Your Progress</h3>
              <span className="az-card-badge-status">
                {currentLevel >= 5 ? 'COMPLETED' : 'IN MISSION'}
              </span>
            </div>
            
            <div className="az-progress-bar-wrap">
              <div className="az-progress-bar-meta">
                <span className="az-progress-label">Security Clearance</span>
                <span className="az-progress-bar-text">{completedCount} / 5 Levels</span>
              </div>
              <div className="az-progress-bar-track">
                <div 
                  className="az-progress-bar-fill" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="az-progress-star-badge">
              <span className="az-star-icon"><IconStar size={16} /></span>
              <div className="az-star-text-col">
                <span className="az-star-text">Level {currentLevel + 1} Operative</span>
                <span className="az-star-sub">Special Operations Field Clearance</span>
              </div>
            </div>

            <div className="az-progress-stat-row">
              <div className="az-stat-mini">
                <span className="az-stat-mini-label">Score</span>
                <span className="az-stat-mini-val az-accent-text">{state?.score || 0} XP</span>
              </div>
              <div className="az-stat-mini">
                <span className="az-stat-mini-label">Shields</span>
                <span className="az-stat-mini-val" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {Array.from({ length: Math.max(1, state?.lives || 5) }).map((_, i) => (
                    <IconShield key={i} size={13} color="#10b981" fill />
                  ))}
                </span>
              </div>
            </div>

            {/* Current Target Focus Panel */}
            <div className="az-target-sector-box">
              <span className="az-target-sector-lbl">CURRENT OBJECTIVE</span>
              <div className="az-target-sector-desc">
                <span className="az-target-code">SEC-0{Math.min(5, currentLevel + 1)}</span>
                <span className="az-target-name">{MISSIONS[Math.min(4, currentLevel)].title}</span>
              </div>
            </div>

            <button 
              className="az-btn-primary az-progress-deploy-btn"
              onClick={() => { sfx.click(); nav('/play'); }}
            >
              <IconPlay size={15} style={{ marginRight: 8 }} /> DEPLOY TO SECTOR {Math.min(5, currentLevel + 1)}
            </button>
          </div>

          {/* Quick System Directive */}
          <div className="az-map-directive-card">
            <div className="az-directive-header">
              <span className="az-directive-dot" />
              <span className="az-directive-title">TACTICAL DIRECTIVE</span>
            </div>
            <p className="az-directive-text">
              Infiltrate corrupted network sectors sequentially. Neutralize rogue Agent Zero countermeasures, extract auth tokens, and restore subnet integrity.
            </p>
          </div>
        </aside>

        {/* Center/Right: Floating Isometric Islands Map */}
        <div className="az-isometric-map-viewport">
          {/* Animated Ambient Space Dust */}
          <div className="az-cosmic-bg-layer">
            <div className="az-cosmic-nebula" />
            <div className="az-cosmic-stars" />
            <div className="az-cosmic-grid" />
          </div>

          {/* Connected Pathway Container */}
          <div className="az-island-nodes-container">
            {/* SVG Dotted Energy Conduit Lines (in exact 1000x500 coordinate space) */}
            <svg className="az-map-energy-svg" viewBox="0 0 1000 500" preserveAspectRatio="none">
              <defs>
                <linearGradient id="azConduitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.95" />
                  <stop offset="25%" stopColor="#38bdf8" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
                  <stop offset="75%" stopColor="#6366f1" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.95" />
                </linearGradient>
                <filter id="azGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Underlying Neon Rail */}
              <path 
                d="M 20 340 L 100 340 C 180 340, 220 160, 300 160 C 380 160, 420 340, 500 340 C 580 340, 620 160, 700 160 C 780 160, 820 340, 900 340 L 980 340" 
                fill="none" 
                stroke="rgba(56, 189, 248, 0.15)" 
                strokeWidth="7" 
                strokeLinecap="round"
              />

              {/* Pulsing Energy Conduit Stream */}
              <path 
                d="M 20 340 L 100 340 C 180 340, 220 160, 300 160 C 380 160, 420 340, 500 340 C 580 340, 620 160, 700 160 C 780 160, 820 340, 900 340 L 980 340" 
                fill="none" 
                stroke="url(#azConduitGrad)" 
                strokeWidth="3.5" 
                strokeDasharray="10 12" 
                className="az-energy-stream"
                filter="url(#azGlowFilter)"
              />

              {/* Docking Rings Under Each Node Center */}
              {[
                { cx: 100, cy: 340 },
                { cx: 300, cy: 160 },
                { cx: 500, cy: 340 },
                { cx: 700, cy: 160 },
                { cx: 900, cy: 340 },
              ].map((pt, i) => (
                <g key={i} className="az-conduit-dock">
                  <circle cx={pt.cx} cy={pt.cy} r="18" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx={pt.cx} cy={pt.cy} r="5" fill={i <= completedCount ? '#00f0ff' : '#1e293b'} filter={i <= completedCount ? 'url(#azGlowFilter)' : undefined} />
                </g>
              ))}
            </svg>

            {/* 5 Progression Islands */}
            {MISSIONS.map((mission, idx) => {
              const isCompleted = idx < currentLevel;
              const isCurrent = idx === currentLevel;
              const isLocked = idx > currentLevel;
              const isUpper = idx % 2 === 1; // 1 (SEC-02) and 3 (SEC-04) are upper; 0, 2, 4 are lower

              return (
                <div 
                  key={mission.index} 
                  className={`az-island-node-wrapper az-node-pos-${idx} ${isUpper ? 'is-upper' : 'is-lower'} ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''} ${isLocked ? 'is-locked' : ''}`}
                  onClick={() => handleSelectLevel(idx)}
                >
                  {/* Info Card (positioned strictly above or below the platform to never overlap the conduit) */}
                  <div className="az-island-info-card">
                    <div className="az-card-top-row">
                      <span className="az-card-code-badge">{mission.code}</span>
                      <span className="az-card-level-label">LVL {idx + 1}</span>
                    </div>
                    <h4 className="az-island-title">{mission.title}</h4>
                    <p className="az-island-subtitle">{mission.subtitle}</p>
                    <div className="az-island-status-pill">
                      {isCompleted ? (
                        <span className="az-status-verified">
                          <IconCheck size={11} color="#10b981" /> VERIFIED
                        </span>
                      ) : isCurrent ? (
                        <span className="az-status-active">
                          <span className="az-live-dot" /> ACTIVE SECTOR
                        </span>
                      ) : (
                        <span className="az-status-locked">
                          <IconLock size={10} color="#64748b" /> ENCRYPTED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Optical Data Stem Linking Card to Platform */}
                  <div className="az-card-connector-stem">
                    <div className="az-stem-line" />
                    <div className="az-stem-dot" />
                  </div>

                  {/* Floating Holographic Platform */}
                  <div className="az-island-platform">
                    <div className="az-platform-top">
                      {isCompleted && (
                        <div className="az-platform-badge-verified" title="Sector Secured">
                          <span className="az-verified-check"><IconCheck size={13} color="#ffffff" /></span>
                        </div>
                      )}
                      {isCurrent && (
                        <div className="az-platform-active-beacon" title="Active Target Sector">
                          <div className="az-beacon-ring" />
                          <div className="az-beacon-core"><IconPlay size={10} color="#05070a" /></div>
                        </div>
                      )}
                      {isLocked && (
                        <div className="az-platform-badge-locked" title="Sector Encrypted">
                          <span className="az-lock-icon"><IconLock size={12} color="#94a3b8" /></span>
                        </div>
                      )}

                      {/* Sci-Fi Hologram Rings & Sector Tag on Platform Surface */}
                      <div className="az-platform-surface-grid">
                        <div className="az-surface-ring" />
                        <span className="az-platform-sector-num">0{idx + 1}</span>
                      </div>
                    </div>
                    <div className="az-platform-base" />
                    <div className="az-platform-glow" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {toast && <div className="az-map-toast">{toast}</div>}
    </div>
  );
}

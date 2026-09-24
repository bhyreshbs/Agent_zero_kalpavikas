import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../hooks/useGame.js';
import { IconLock, IconCheck, IconPlay, IconShield } from '../components/GameIcons.jsx';
import TopNav from '../components/TopNav.jsx';
import { tryEnterFullscreen } from '../components/SecureGameMode.jsx';
import { sfx } from '../sound.js';
import { chapterFor, levelLabel, levelCode, levelTitle, LEVEL_COUNT } from '../story.js';

// Sector list derived from the engine's own level definitions (story.js CHAPTERS): index 0 is the
// orientation, 1-5 are the levels, 5 is the final boss. Same index, same name as the HUD and the
// gameplay that loads for that index.
const MISSIONS = Array.from({ length: LEVEL_COUNT + 1 }, (_, index) => ({
  index,
  title: levelTitle(index),
  code: levelCode(index),
  subtitle: chapterFor(index).tagline,
  boss: index === LEVEL_COUNT,
}));

export default function LevelMap() {
  const nav = useNavigate();
  const { state } = useGame();
  const [toast, setToast] = useState(null);

  const currentLevel = !state ? 0 : state.status === 'completed' ? MISSIONS.length : (state.currentLevel ?? 0);
  const completedCount = Math.min(MISSIONS.length, Math.max(0, currentLevel));
  const progressPercent = Math.round((completedCount / MISSIONS.length) * 100);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  // The game only ever loads the CURRENT level, so only the current sector (or, once the run is
  // over, any sector -> the results) can be entered. A finished sector must not open a different
  // level's gameplay under its own name.
  function handleSelectLevel(index) {
    if (state?.status !== 'completed') {
      if (index > currentLevel) {
        sfx.fail();
        showToast(`SECTOR LOCKED — Complete ${levelLabel(currentLevel)} first.`);
        return;
      }
      if (index < currentLevel) {
        sfx.fail();
        showToast(`${levelLabel(index)} is already secured — the run continues at ${levelLabel(currentLevel)}.`);
        return;
      }
    }
    sfx.click();
    tryEnterFullscreen(); // user gesture: request fullscreen before the level loads
    nav('/play');
  }

  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <TopNav currentLevel={currentLevel} />

      <main className="ds-container ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
        <header className="ds-stack" style={{ gap: 4 }}>
          <span className="ds-label">Echo Station facility schematic</span>
          <h1 className="ds-title">Sector Map</h1>
        </header>

        <div className="ds-split">
          {/* Progress sidebar */}
          <aside className="ds-stack" style={{ gap: 'var(--ds-space-md)' }}>
            <div className="ds-card">
              <div className="ds-card-header">
                <h2 className="ds-card-title">Your Progress</h2>
                <span className={`ds-badge ${currentLevel >= MISSIONS.length ? 'ds-badge-success' : ''}`}>
                  {currentLevel >= MISSIONS.length ? 'Completed' : 'In mission'}
                </span>
              </div>

              <div className="ds-card-body ds-stack">
                <div className="ds-stack" style={{ gap: 'var(--ds-space-xs)' }}>
                  <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                    <span className="ds-label">Security clearance</span>
                    <span className="ds-mono">{completedCount} / {MISSIONS.length} sectors</span>
                  </div>
                  <div className="ds-progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                <div className="ds-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--ds-space-sm)' }}>
                  <div className="ds-card-inset" style={{ padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                    <span className="ds-label">Level</span>
                    <div className="ds-num" style={{ fontSize: 18, lineHeight: '26px' }}>{currentLevel >= MISSIONS.length ? 'Mission complete' : `${levelLabel(currentLevel)} operative`}</div>
                  </div>
                  <div className="ds-card-inset" style={{ padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                    <span className="ds-label">Score</span>
                    <div className="ds-num ds-accent" style={{ fontSize: 18, lineHeight: '26px' }}>{state?.score || 0} XP</div>
                  </div>
                </div>

                <div className="ds-card-inset" style={{ padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
                  <span className="ds-label">Shields</span>
                  <div className="ds-row" style={{ gap: 4, minHeight: 26 }}>
                    {currentLevel >= 4 ? (
                      <span className="ds-mono" style={{ color: 'var(--ds-success-text)' }}>UNLIMITED</span>
                    ) : (
                      Array.from({ length: Math.max(1, state?.lives || 5) }).map((_, i) => (
                        <IconShield key={i} size={14} color="#5e7862" fill />
                      ))
                    )}
                  </div>
                </div>

                <hr className="ds-divider ds-divider-amber" style={{ margin: 0 }} />

                <div className="ds-stack" style={{ gap: 4 }}>
                  <span className="ds-label ds-accent">Current objective</span>
                  <div className="ds-row" style={{ flexWrap: 'nowrap', gap: 'var(--ds-space-sm)' }}>
                    <span className="ds-badge">{levelCode(Math.min(MISSIONS.length - 1, currentLevel))}</span>
                    <span className="ds-h2" style={{ fontSize: 18, lineHeight: '24px' }}>{MISSIONS[Math.min(MISSIONS.length - 1, currentLevel)].title}</span>
                  </div>
                </div>

                <button
                  className="ds-btn ds-btn-primary ds-btn-block"
                  onClick={() => { sfx.click(); tryEnterFullscreen(); nav('/play'); }}
                  onMouseEnter={() => sfx.hover()}
                >
                  <IconPlay size={14} /> {currentLevel === 0 ? 'Begin orientation' : currentLevel >= MISSIONS.length ? 'View results' : `Deploy to ${levelLabel(currentLevel)}`}
                </button>
              </div>
            </div>

            <div className="ds-card">
              <div className="ds-card-header">
                <span className="ds-label ds-accent">Tactical directive</span>
              </div>
              <div className="ds-card-body">
                <p className="ds-mono-sm" style={{ margin: 0, lineHeight: '20px' }}>
                  Infiltrate corrupted network sectors sequentially. Neutralize rogue Agent Zero countermeasures, extract auth tokens, and restore subnet integrity.
                </p>
              </div>
            </div>
          </aside>

          {/* Sector schematic */}
          <section className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
            <div className="ds-row" style={{ justifyContent: 'space-between' }}>
              <h2 className="ds-h2">Facility sectors</h2>
              <span className="ds-badge ds-badge-muted">{completedCount} / {MISSIONS.length} secured</span>
            </div>

            <div className="ds-sector-list">
              {MISSIONS.map((mission, idx) => {
                const isCompleted = idx < currentLevel;
                const isCurrent = idx === currentLevel;
                const isLocked = idx > currentLevel;
                const stateClass = isCompleted ? 'is-completed' : isCurrent ? 'is-current' : 'is-locked';

                return (
                  <div
                    key={mission.index}
                    className={`ds-sector ${stateClass}${mission.boss ? ' is-boss' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-disabled={isLocked}
                    onClick={() => handleSelectLevel(idx)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectLevel(idx); } }}
                  >
                    <div className="ds-stack" style={{ gap: 4, minWidth: 0 }}>
                      <div className="ds-row" style={{ gap: 'var(--ds-space-sm)' }}>
                        <span className={`ds-badge ds-badge-chamfer${mission.boss ? ' ds-badge-danger' : ''}`}>{mission.code}</span>
                        <span className="ds-mono-sm">{levelLabel(idx)}</span>
                        {mission.boss && <span className="ds-stamp">Final boss</span>}
                      </div>
                      <h3 className="ds-card-title" style={{ fontSize: 20, lineHeight: '26px' }}>{mission.title}</h3>
                      <p className="ds-mono-sm" style={{ margin: 0 }}>{mission.subtitle}</p>
                    </div>

                    {isCompleted ? (
                      <span className="ds-badge ds-badge-success"><IconCheck size={11} color="currentColor" /> Verified</span>
                    ) : isCurrent ? (
                      <span className="ds-badge"><span className="ds-dot ds-dot-live" /> Active sector</span>
                    ) : (
                      <span className="ds-badge ds-badge-muted"><IconLock size={10} color="currentColor" /> Encrypted</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <div className="ds-footer-strip">Echo Station // Facility schematic // Authorized eyes only</div>

      {toast && <div className="ds-alert ds-alert-warn ds-toast" role="status">{toast}</div>}
    </div>
  );
}

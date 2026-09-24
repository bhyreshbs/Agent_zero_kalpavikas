import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { chapterFor } from '../story.js';
import { IconHeart, IconShield, IconChrono, IconMap } from './GameIcons.jsx';
import { sfx } from '../sound.js';
import MuteToggle from './MuteToggle.jsx';

function fmtTime(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// The server is the source of truth for the clock (spec: server-authoritative timer).
// This just ticks visually between polls so it counts 15:00, 14:59, 14:58... instead
// of jumping every few seconds — it resyncs to the server's number on every poll and
// never runs ahead of it. It only ticks once the real game clock is actually running
// (not during the tutorial, not while paused).
function useTickingClock(state) {
  const [display, setDisplay] = useState(state?.timeRemainingSeconds ?? 0);
  const lastSynced = useRef({ value: state?.timeRemainingSeconds ?? 0, at: Date.now() });

  useEffect(() => {
    lastSynced.current = { value: state?.timeRemainingSeconds ?? 0, at: Date.now() };
    setDisplay(state?.timeRemainingSeconds ?? 0);
  }, [state?.timeRemainingSeconds]);

  useEffect(() => {
    const running = state && ['active', 'critical', 'recovering', 'tutorial'].includes(state.status);
    if (!running) return;
    const id = setInterval(() => {
      const elapsedSinceSync = Math.floor((Date.now() - lastSynced.current.at) / 1000);
      setDisplay(Math.max(0, lastSynced.current.value - elapsedSinceSync));
    }, 1000);
    return () => clearInterval(id);
  }, [state?.status]);

  return display;
}

// A slim 3-zone bar — lives / chapter / timer — instead of a stacked
// dashboard row. This is the only chrome that's ALWAYS on screen; everything
// else (objective, hints) sits below it, out of the way of the world.
export default function GameHUD({ state }) {
  const displaySeconds = useTickingClock(state);
  const prevLives = useRef(state?.lives);
  const [justLostIndex, setJustLostIndex] = useState(null);
  const warnedLowTime = useRef(false);

  useEffect(() => {
    if (!state) return;
    if (prevLives.current != null && state.lives < prevLives.current) {
      setJustLostIndex(state.lives); // the heart at this index just went from alive to dead
      const t = setTimeout(() => setJustLostIndex(null), 650);
      prevLives.current = state.lives;
      return () => clearTimeout(t);
    }
    prevLives.current = state.lives;
  }, [state?.lives]);

  // One quiet warning tone the moment the clock first crosses under a minute
  // -- not a repeating alarm, just a single nudge that time is getting tight.
  useEffect(() => {
    if (!state) return;
    const running = ['active', 'critical', 'recovering', 'tutorial'].includes(state.status);
    if (running && displaySeconds <= 60 && displaySeconds > 0 && !warnedLowTime.current) {
      warnedLowTime.current = true;
      sfx.warning();
    }
    if (!running || displaySeconds > 60) warnedLowTime.current = false;
  }, [displaySeconds, state?.status]);

  if (!state) return null;

  const initial = state.initialLives ?? 5;
  const lives = state.lives;
  const baseHearts = Array.from({ length: initial }, (_, i) => i < lives);
  const recoveryCount = Math.max(0, (state.maxLives ?? initial) - initial);
  const recoveryHearts = Array.from({ length: recoveryCount }, (_, i) => lives > initial + i);

  const low = displaySeconds <= 60 && ['active', 'critical', 'recovering', 'tutorial'].includes(state.status);
  const chapter = chapterFor(state.currentLevel ?? 0);

  return (
    <div className="ds-page ds-page-embed">
    <header className={`ds-hud ${low ? 'is-low-time' : ''}`} aria-label="Game HUD">
      <div className="ds-hud-zone">
        <span className="ds-badge ds-badge-muted">
          <span className="ds-dot ds-dot-live" />
          Vitals
        </span>
        <div className="az-lives" aria-label="Lives remaining" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {state.currentLevel >= 4 ? (
            <span className="ds-badge ds-badge-success">Unlimited</span>
          ) : (
            <>
              {baseHearts.map((alive, i) => (
                <span
                  key={`b${i}`}
                  className={`az-heart-icon ${alive ? 'is-alive' : 'lost'} ${justLostIndex === i ? 'az-heart-losing' : ''}`}
                  title={`Life ${i + 1}`}
                >
                  <IconHeart size={18} alive={alive} color="#c4523f" />
                </span>
              ))}
              {recoveryCount > 0 && (
                <>
                  <span aria-hidden="true" style={{ width: 1, height: 16, margin: '0 6px', background: 'var(--ds-line-strong)' }} />
                  {recoveryHearts.map((alive, i) => (
                    <span
                      key={`r${i}`}
                      className={`az-heart-icon az-shield-icon ${alive ? 'is-alive' : 'lost'} ${justLostIndex === initial + i ? 'az-heart-losing' : ''}`}
                      title={`Recovery Shield ${i + 1}`}
                    >
                      <IconShield size={18} color="#d4a853" fill={alive} />
                    </span>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="ds-hud-zone is-center">
        <div className="ds-hud-chapter">
          {state.currentLevel === 0 ? '// SECTOR ZERO — ORIENTATION' : `// ${chapter.chapter} — SECTOR 0${state.currentLevel}`}
        </div>
        <div className="ds-hud-name">{chapter.name}</div>
      </div>

      <div className="ds-hud-zone is-right">
        <div className="ds-hud-timer" title="Station Mission Clock">
          <span className="ds-label"><IconChrono size={12} color="currentColor" /> Chrono</span>
          <strong className="ds-hud-digits">
            {fmtTime(displaySeconds)}
          </strong>
        </div>
        <MuteToggle variant="ds" />
        <Link
          to="/map"
          className="ds-btn ds-btn-ghost ds-btn-sm"
          style={{ minWidth: 32, padding: 0 }}
          onClick={() => sfx.click()}
          onMouseEnter={() => sfx.hover()}
          title="Mission Map"
          aria-label="Mission Map"
        >
          <IconMap size={18} color="currentColor" />
        </Link>
      </div>
    </header>
    </div>
  );
}

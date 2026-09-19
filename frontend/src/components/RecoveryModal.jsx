import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import RecoveryChamber3D from './three/RecoveryChamber3D.jsx';
import { IconShield, IconCheck } from './GameIcons.jsx';

const MEMORIZE_MS = 2200; // how long a memory-type puzzle stays visible before hiding

export default function RecoveryModal({ initialState }) {
  const [puzzle, setPuzzle] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [memorized, setMemorized] = useState(false); // memory_sequence: has the "hide it" moment happened yet

  useEffect(() => {
    let timer, memTimer;
    api
      .recoveryStart()
      .then(({ puzzle, error }) => {
        if (error) {
          setError(error);
          return;
        }
        setPuzzle(puzzle);
        if (puzzle.kind === 'memory_sequence') {
          memTimer = setTimeout(() => setMemorized(true), MEMORIZE_MS);
        } else {
          setMemorized(true);
        }
        // windowSeconds already accounts for time elapsed if this is a resumed
        // (e.g. post-refresh) recovery — the server, not this component, owns the clock.
        setSecondsLeft(puzzle.windowSeconds);
        timer = setInterval(() => {
          setSecondsLeft((s) => {
            if (s <= 1) {
              clearInterval(timer);
              submit(null); // visual expiry — the server independently enforces its own deadline regardless
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    return () => { clearInterval(timer); clearTimeout(memTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kinds whose every option is literally one of the displayed grid values —
  // for these, the grid itself becomes the clickable surface (click the
  // corrupted node / odd symbol / outlier directly) instead of a redundant
  // separate row of buttons repeating the same values.
  const gridIsClickable = useMemo(
    () => !!(puzzle?.grid && puzzle.options.every((o) => puzzle.grid.includes(o))),
    [puzzle]
  );
  const isRotation = puzzle?.kind === 'rotating_symbol';

  async function submit(answer) {
    setPicked(answer);
    try {
      const result = await api.recoverySubmit(answer);
      setOutcome(result);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="az-recovery-shell">
        <div className="az-glass-panel az-recovery-panel" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <span className="az-status-beacon" /> Booting emergency AI recovery protocol…
        </div>
      </div>
    );
  }
  if (error) return <div className="az-glass-panel az-recovery-panel az-error">{error}</div>;

  if (outcome) {
    return (
      <div className="az-recovery-shell">
        <div className={`az-glass-panel az-recovery-outcome ${outcome.correct ? 'is-success' : 'is-fail'}`} style={{ textAlign: 'center' }}>
          {outcome.correct ? (
            <>
              <div className="az-recovery-outcome-icon is-success"><IconCheck size={24} color="#35f2c2" /></div>
              <h3 className="az-recovery-outcome-title" style={{ color: 'var(--az-accent)' }}>SYSTEM RESTORED</h3>
              <p className="az-recovery-outcome-sub" style={{ color: 'var(--az-accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                +1 RECOVERY SHIELD <IconShield size={14} color="#10b981" fill />
              </p>
              <button className="az-btn-primary az-btn-large" onClick={() => window.location.reload()}>
                Return To Level ▸
              </button>
            </>
          ) : (
            <>
              <div className="az-recovery-outcome-icon is-fail">✕</div>
              <h3 className="az-recovery-outcome-title" style={{ color: 'var(--az-danger)' }}>RECOVERY FAILED</h3>
              {outcome.expired && <p className="az-hint">Containment time window expired.</p>}
              <button className="az-btn-secondary az-btn-large" onClick={() => window.location.reload()}>
                Continue ▸
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const urgent = secondsLeft <= 10;
  const stillMemorizing = puzzle.kind === 'memory_sequence' && !memorized;

  return (
    <div className="az-recovery-shell">
      <RecoveryChamber3D urgent={urgent} />
      <div className="az-recovery-header">
        <p className="az-sub az-recovery-warning" style={{ color: 'var(--az-danger)' }}>
          <span className="az-danger-dot" /> ⚠ SYSTEM FAILURE — ALL LIVES LOST
        </p>
        <h2 className={`az-title az-recovery-title ${urgent ? 'az-glitch is-critical' : ''}`} style={{ color: urgent ? 'var(--az-danger)' : 'var(--az-accent)' }}>
          RECOVERY PROTOCOL — {String(Math.max(0, secondsLeft)).padStart(2, '0')}s
        </h2>
      </div>

      <div className={`az-glass-panel az-recovery-panel ${urgent ? 'is-urgent' : ''}`}>
        <p className="az-sub az-recovery-sub">{puzzle.title || 'REPAIR THE AI'}</p>
        <p className="az-recovery-prompt">
          {stillMemorizing ? 'Memorize sequence — concealing in moments.' : puzzle.prompt}
        </p>

        {puzzle.sequence && (
          <div className="az-recovery-row">
            {puzzle.kind === 'memory_sequence' && memorized
              ? puzzle.sequence.map((_, i) => <span key={i} className="az-recovery-token is-hidden">?</span>)
              : puzzle.sequence.map((item, i) => <span key={i} className="az-recovery-token">{item}</span>)}
          </div>
        )}

        {puzzle.grid && !gridIsClickable && (
          <div className="az-recovery-grid">
            {puzzle.grid.map((item, i) => (
              <span key={i} className="az-recovery-cell">{item}</span>
            ))}
          </div>
        )}

        {puzzle.grid && gridIsClickable && (
          <div className="az-recovery-grid az-recovery-grid-clickable">
            {puzzle.grid.map((item, i) => (
              <button
                key={i}
                disabled={picked !== null}
                className={`az-recovery-cell-btn ${picked === item ? 'is-picked' : ''}`}
                onClick={() => submit(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {!gridIsClickable && memorized && (
          <div className="az-recovery-options">
            {puzzle.options.map((opt) => {
              if (isRotation) {
                const [symbol, angle] = String(opt).split('@');
                return (
                  <button
                    key={String(opt)}
                    disabled={picked !== null}
                    className={`az-recovery-opt-btn ${picked === opt ? 'is-picked' : ''}`}
                    onClick={() => submit(opt)}
                  >
                    <span className="az-recovery-rotation-preview" style={{ transform: `rotate(${angle || '0deg'})` }}>{symbol}</span>
                  </button>
                );
              }
              return (
                <button
                  key={String(opt)}
                  disabled={picked !== null}
                  className={`az-recovery-opt-btn ${picked === opt ? 'is-picked' : ''}`}
                  onClick={() => submit(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


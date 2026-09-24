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
      <div className="ds-page ds-page-embed">
        <div className="ds-recovery">
          <div className="ds-card ds-card-body">
            <p className="ds-loading" style={{ justifyContent: 'center' }}>
              <span className="ds-spinner" /> Booting emergency AI recovery protocol…
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="ds-page ds-page-embed">
        <div className="ds-recovery">
          <p className="ds-alert ds-alert-error" role="alert">{error}</p>
        </div>
      </div>
    );
  }

  if (outcome) {
    return (
      <div className="ds-page ds-page-embed">
        <div className="ds-recovery">
          <div
            className="ds-card"
            style={{ textAlign: 'center', borderColor: outcome.correct ? 'var(--ds-success)' : 'var(--ds-danger)' }}
          >
            <div className="ds-card-body ds-stack" style={{ alignItems: 'center' }}>
              {outcome.correct ? (
                <>
                  <span className="ds-badge ds-badge-success"><IconCheck size={12} color="currentColor" /> Recovery complete</span>
                  <h3 className="ds-h1" style={{ color: 'var(--ds-success-text)' }}>System restored</h3>
                  <p className="ds-mono ds-accent" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    +1 recovery shield <IconShield size={14} color="#d4a853" fill />
                  </p>
                  <button className="ds-btn ds-btn-primary" onClick={() => window.location.reload()}>
                    Return to level ▸
                  </button>
                </>
              ) : (
                <>
                  <span className="ds-badge ds-badge-danger">✕ Recovery failed</span>
                  <h3 className="ds-h1" style={{ color: 'var(--ds-danger-text)' }}>Recovery failed</h3>
                  {outcome.expired && <p className="ds-mono-sm" style={{ margin: 0 }}>Containment time window expired.</p>}
                  <button className="ds-btn ds-btn-secondary" onClick={() => window.location.reload()}>
                    Continue ▸
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const urgent = secondsLeft <= 10;
  const stillMemorizing = puzzle.kind === 'memory_sequence' && !memorized;

  return (
    <div className="ds-page ds-page-embed">
      <div className="ds-recovery">
        <RecoveryChamber3D urgent={urgent} />

        <div className="ds-stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--ds-space-xs)', marginBottom: 'var(--ds-space-md)', position: 'relative', zIndex: 1 }}>
          <span className="ds-badge ds-badge-danger"><span className="ds-dot ds-dot-danger" /> System failure — all lives lost</span>
          <h2 className="ds-title" style={{ color: urgent ? 'var(--ds-danger-text)' : 'var(--ds-primary)' }}>
            Recovery protocol — {String(Math.max(0, secondsLeft)).padStart(2, '0')}s
          </h2>
        </div>

        <div className="ds-card" style={{ position: 'relative', zIndex: 1, textAlign: 'center', borderColor: urgent ? 'var(--ds-danger)' : undefined }}>
          <div className="ds-card-header">
            <span className="ds-label ds-accent">{puzzle.title || 'Repair the AI'}</span>
            <span className={`ds-badge ${urgent ? 'ds-badge-danger' : 'ds-badge-muted'}`}>{urgent ? 'Urgent' : 'Recovery window'}</span>
          </div>
          <div className="ds-card-body">
            <p className="ds-body" style={{ margin: 0 }}>
              {stillMemorizing ? 'Memorize sequence — concealing in moments.' : puzzle.prompt}
            </p>

            {puzzle.sequence && (
              <div className="ds-recovery-tokens">
                {puzzle.kind === 'memory_sequence' && memorized
                  ? puzzle.sequence.map((_, i) => <span key={i} className="ds-token is-hidden">?</span>)
                  : puzzle.sequence.map((item, i) => <span key={i} className="ds-token">{item}</span>)}
              </div>
            )}

            {puzzle.grid && !gridIsClickable && (
              <div className="ds-recovery-grid">
                {puzzle.grid.map((item, i) => (
                  <span key={i} className="ds-cell">{item}</span>
                ))}
              </div>
            )}

            {puzzle.grid && gridIsClickable && (
              <div className="ds-recovery-grid">
                {puzzle.grid.map((item, i) => (
                  <button
                    key={i}
                    disabled={picked !== null}
                    className={`ds-btn ds-cell-btn ${picked === item ? 'ds-btn-primary' : 'ds-btn-secondary'}`}
                    onClick={() => submit(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {!gridIsClickable && memorized && (
              <div className="ds-recovery-options">
                {puzzle.options.map((opt) => {
                  if (isRotation) {
                    const [symbol, angle] = String(opt).split('@');
                    return (
                      <button
                        key={String(opt)}
                        disabled={picked !== null}
                        className={`ds-btn ds-opt-btn ${picked === opt ? 'ds-btn-primary' : 'ds-btn-secondary'}`}
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
                      className={`ds-btn ds-opt-btn ${picked === opt ? 'ds-btn-primary' : 'ds-btn-secondary'}`}
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
      </div>
    </div>
  );
}

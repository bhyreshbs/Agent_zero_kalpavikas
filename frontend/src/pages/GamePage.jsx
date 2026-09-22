import { useEffect, useState } from 'react';
import { chapterFor } from '../story.js';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../hooks/useGame.js';
import { useIdleHint } from '../hooks/useIdleHint.js';
import { useSecurityMonitor } from '../hooks/useSecurityMonitor.js';
import { api } from '../api/client.js';
import EnvironmentBackdrop from '../components/EnvironmentBackdrop.jsx';
import { AICore } from '../components/facility/Facility.jsx';
import GameHUD from '../components/GameHUD.jsx';
import ObjectiveHUD from '../components/ObjectiveHUD.jsx';
import RecoveryModal from '../components/RecoveryModal.jsx';
import TutorialOverlay, { STEPS as TUTORIAL_STEPS } from '../components/TutorialOverlay.jsx';
import FloatingCatchBot from '../components/FloatingCatchBot.jsx';
import { SecureGameGate, SecurityViolationModal, tryEnterFullscreen } from '../components/SecureGameMode.jsx';
import TutorialScene from '../components/scenes3d/TutorialScene3D.jsx';
import Level1Scene from '../components/scenes3d/Level1Scene3D.jsx';
import Level2Scene from '../components/scenes3d/Level2Scene3D.jsx';
import Level3Scene from '../components/scenes3d/Level3Scene3D.jsx';
import Level4Scene from '../components/scenes3d/Level4Scene3D.jsx';
import Level5Scene from '../components/scenes3d/Level5Scene3D.jsx';
import Robot from '../components/Robot.jsx';
import { IconCheck, IconStar, IconCoin, IconTrophy, IconShield, IconChrono, IconWarning } from '../components/GameIcons.jsx';
import { sfx } from '../sound.js';

function playFeedbackSound(action, outcome) {
  if (outcome?.lifeLost) { sfx.lifeLost(); return; }
  if (/DOOR/.test(action)) { sfx.door(); return; }
  if (/INSPECT/.test(action)) { sfx.scan(); return; }
  if (outcome?.result?.ok === false) { sfx.fail(); return; }
  if (outcome?.result?.ok) sfx.success();
}

const SCENES = {
  tutorial: TutorialScene,
  level1: Level1Scene,
  level2: Level2Scene,
  level3: Level3Scene,
  level4: Level4Scene,
  level5: Level5Scene,
};

export default function GamePage() {
  const nav = useNavigate();
  const { state, error, sendAction, syncStateFrom, start } = useGame();
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [levelCompleteCard, setLevelCompleteCard] = useState(null); // {title, message, timeLeft} while the reward screen shows, before handing off to the map
  const [showEntry, setShowEntry] = useState(true); // brief "SYSTEM ONLINE" flash on arriving at a level, purely cosmetic
  // null once the guided intro is done/skipped; otherwise an index into TUTORIAL_STEPS.
  const [tutorialStep, setTutorialStep] = useState(() => (sessionStorage.getItem('az_tutorial_seen') === 'true' ? null : 0));
  const [chatUnlocked, setChatUnlocked] = useState(false); // must catch the floating signal first, each level
  const [chatUnlockedForLevel, setChatUnlockedForLevel] = useState(null);
  const [hintText, setHintText] = useState(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintPanelOpen, setHintPanelOpen] = useState(false);
  // Secure Game Mode (spec Part 3) — a one-time gate before the competitive
  // timer starts, then silent monitoring; `violation` holds the most recent
  // server-confirmed violation while the warning/penalty overlay is showing.
  const [secureModeEntered, setSecureModeEntered] = useState(() => sessionStorage.getItem('az_secure_mode_entered') === 'true');
  const [violation, setViolation] = useState(null);
  // The full-screen red "life lost" flash is a one-shot pulse, separate from
  // the FailureBanner (which the player dismisses manually). It used to be
  // tied directly to `flash?.lifeLost`, which stayed true — and therefore
  // stayed visually red — until the player clicked "Continue", sometimes for
  // the whole rest of the level. This clears it on its own shortly after
  // every life-loss, regardless of whether the banner has been dismissed.
  const [lifeLostPulse, setLifeLostPulse] = useState(false);

  useEffect(() => {
    sfx.levelTransition();
    const t = setTimeout(() => setShowEntry(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Contain the game inside its own viewport instead of the whole browser
  // page scrolling. Without this, a level with more content than fits the
  // window just scrolls the entire document — HUD, background and all —
  // which reads as "the page moving" rather than a game window, and (on
  // platforms with auto-hiding overlay scrollbars) can look like there's no
  // scrollbar at all. This class is only added while GamePage is mounted, so
  // every other page keeps normal document scrolling.
  useEffect(() => {
    document.documentElement.classList.add('az-game-active');
    document.body.classList.add('az-game-active');
    return () => {
      document.documentElement.classList.remove('az-game-active');
      document.body.classList.remove('az-game-active');
    };
  }, []);

  useEffect(() => {
    if (!flash?.lifeLost) return;
    setLifeLostPulse(true);
    // Lock the UI for a punishing 2.5 seconds instead of just a quick 700ms flash
    const t = setTimeout(() => setLifeLostPulse(false), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // Fresh level -> the signal has to be caught again, and any shown hint text clears.
  useEffect(() => {
    if (state && state.currentLevel !== chatUnlockedForLevel) {
      setChatUnlocked(false);
      setChatUnlockedForLevel(state.currentLevel);
      setHintText(null);
    }
  }, [state?.currentLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatically resume the timer when entering a sector from the transition/lobby state.
  useEffect(() => {
    if (state?.isTransition && !levelCompleteCard) {
      // We are on the active game view, but the server is paused in transition.
      // Tell the server we have entered the sector so the timer resumes.
      sendAction('ENTER_SECTOR').catch(console.error);
    }
  }, [state?.isTransition, levelCompleteCard, sendAction]);

  function completeTutorialOverlay() {
    sessionStorage.setItem('az_tutorial_seen', 'true');
    setTutorialStep(null);
  }

  async function handleAction(action, payload) {
    setBusy(true);
    const priorLevel = state?.currentLevel;
    try {
      const outcome = await sendAction(action, payload);
      outcome.action = action; // client-side only tag, so scenes can style feedback per-object (e.g. which door just opened)
      setFlash(outcome);
      playFeedbackSound(action, outcome);
      if (tutorialStep === 1) setTutorialStep(2);

      if (outcome.levelCompleted) {
        sfx.door();
        setLevelCompleteCard({
          message: outcome.result?.message || 'LEVEL COMPLETE',
          timeLeft: outcome.clientState?.timeRemainingSeconds,
          lives: outcome.clientState?.lives,
          fromLevel: priorLevel,
        });
      }
    } catch {
      // useGame already surfaced the error + refreshed clientState (e.g. critical state)
    } finally {
      setBusy(false);
    }
  }

  function handleChatReply(result) {
    syncStateFrom(result.clientState);
    sfx.agentActivate();
    if (tutorialStep === 2) setTutorialStep(3);
  }

  async function handleHint() {
    setHintBusy(true);
    try {
      const outcome = await api.hint();
      setHintText(outcome.hint);
      if (outcome.clientState) syncStateFrom(outcome.clientState);
    } catch (err) {
      setHintText(err.message);
    } finally {
      setHintBusy(false);
    }
  }

  function proceedToMap() {
    if (levelCompleteCard) sessionStorage.setItem('az_map_from_level', String(levelCompleteCard.fromLevel));
    setLevelCompleteCard(null);
    nav('/map');
  }

  async function enterSecureGameMode() {
    if (state?.secureMode?.fullscreenRequired) await tryEnterFullscreen();
    sessionStorage.setItem('az_secure_mode_entered', 'true');
    setSecureModeEntered(true);
  }

  async function handleReturnFromViolation() {
    setViolation(null);
    if (state?.secureMode?.fullscreenRequired && !document.fullscreenElement) await tryEnterFullscreen();
  }

  // Monitoring only runs once the player has actually entered Secure Game
  // Mode and is in a real, active level — never during the tutorial, while
  // paused, or on a results/critical/recovering screen that already fully
  // covers the game with its own modal.
  const monitoringEnabled = !!(
    state &&
    state.secureMode?.enabled &&
    secureModeEntered &&
    (state.currentLevel ?? 0) >= 1 &&
    state.status === 'active'
  );
  useSecurityMonitor({
    enabled: monitoringEnabled,
    onViolation: (out) => {
      setViolation(out);
      if (out.clientState) syncStateFrom(out.clientState);
      if (out.lifeLost) sfx.lifeLost();
      else sfx.warning();
    },
  });

  // ---------------------------------------------------------------------
  // Every hook call for this component lives above this line, unconditionally,
  // in the same order on every render (Rules of Hooks). Everything below is
  // plain derived values + early returns -- NEVER a hook. `state` can be null
  // on the very first render (before the session has loaded), so every value
  // below is computed with optional chaining rather than assuming it exists.
  // ---------------------------------------------------------------------
  const inTutorial = state?.status === 'tutorial' && tutorialStep !== null;
  const tutorialStepDef = inTutorial ? TUTORIAL_STEPS[tutorialStep] : null;
  const isModalTutorialStep = tutorialStepDef?.mode === 'modal';
  const level = state?.level;
  const isRealLevel = (state?.currentLevel ?? 0) >= 1;
  // Idle guidance only makes sense once a real, interactive level is actually
  // on screen -- not while loading, mid tutorial-modal step, paused/critical/
  // recovering, or showing the level-complete card. useIdleHint is still
  // called unconditionally either way; only its internal behavior toggles.
  const idleHintEnabled =
    !!state &&
    !levelCompleteCard &&
    !isModalTutorialStep &&
    state.status !== 'paused' &&
    state.status !== 'critical' &&
    state.status !== 'recovering' &&
    state.status !== 'completed' &&
    state.status !== 'failed';
  const idleHint = useIdleHint(level, flash, idleHintEnabled);

  if (!state) {
    return (
      <div className="az-game-unauth-screen">
        <div className="az-scene-bg" />
        <div className="az-shell az-unauth-card">
          <span className="az-badge az-unauth-badge">
            <span className="az-status-beacon" /> TACTICAL CLEARANCE REQUIRED
          </span>
          <h2 className="az-title az-unauth-title">ECHO STATION // ACCESS DENIED</h2>
          <p className="az-hint az-unauth-hint">
            Direct operational telemetry link requires an authorized operative profile.
          </p>

          <div className="az-actions az-unauth-actions">
            <Link to="/login">
              <button className="az-btn-primary az-btn-large" onMouseEnter={() => sfx.hover()}>
                Squad Login
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'not_started') {
    return (
      <div className="az-game-viewport">
        <EnvironmentBackdrop levelIndex={0} />
        <GameHUD state={state} />
        <div className="az-deploy-staging-overlay">
          <div className="az-glass-panel az-deploy-staging-card">
            <span className="az-badge">
              <span className="az-status-beacon" /> SQUAD MISSION STAGING
            </span>
            <h2 className="az-title" style={{ margin: '10px 0' }}>READY FOR INFILTRATION</h2>
            <p className="az-hint" style={{ marginBottom: 20 }}>
              Operative link established. Synchronized chronometer and shield telemetry are initialized.
            </p>
            <button
              className="az-btn-primary az-btn-large"
              onClick={async () => {
                sfx.click();
                sfx.levelTransition();
                await start();
              }}
              onMouseEnter={() => sfx.hover()}
            >
              INITIATE SECTOR ZERO PROTOCOL ▸
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'completed') return <CompletionScreen state={state} onLeaderboard={() => nav('/leaderboard')} />;
  if (state.status === 'failed') return <GameOverScreen state={state} onLeaderboard={() => nav('/leaderboard')} />;

  if (levelCompleteCard) {
    const levelNumber = (levelCompleteCard.fromLevel ?? 0) + 1;
    return (
      <div className="az-level-complete-celebration-viewport">
        {/* Animated Celebration Particles & Portal Glow */}
        <div className="az-celebration-backdrop">
          <div className="az-portal-light-beam" />
          <div className="az-portal-energy-burst" />
        </div>

        <div className="az-celebration-container">
          {/* Center Left: Glowing Exit Portal & Robot Visual */}
          <div className="az-celebration-stage">
            <h1 className="az-celebration-title">LEVEL {levelNumber} COMPLETE!</h1>
            
            <div className="az-celebration-portal-frame">
              <div className="az-celebration-exit-sign">EXIT</div>
              <div className="az-celebration-portal-vortex" />
              <div className="az-celebration-robot">
                <Robot walking={false} size={90} color="#ffffff" />
              </div>
            </div>

            {/* Bottom celebratory speech bubble */}
            <div className="az-celebration-quote-bubble">
              <span className="az-quote-robot-icon"><IconStar size={16} color="#00f0ff" /></span>
              <p className="az-quote-text">Great job! You're getting better at this!</p>
            </div>
          </div>

          {/* Right Side: Mission Summary & Rewards */}
          <div className="az-celebration-summary-card">
            <h3 className="az-summary-card-title">Mission Summary</h3>
            
            <div className="az-summary-checklist">
              <div className="az-summary-check-row">
                <span className="az-summary-check-icon"><IconCheck size={14} /></span>
                <span className="az-summary-check-label">Evidence Files Collected</span>
                <span className="az-summary-check-val">3/3</span>
              </div>
              <div className="az-summary-check-row">
                <span className="az-summary-check-icon"><IconCheck size={14} /></span>
                <span className="az-summary-check-label">Security Logs Analysed</span>
                <span className="az-summary-check-val">2/2</span>
              </div>
              <div className="az-summary-check-row">
                <span className="az-summary-check-icon"><IconCheck size={14} /></span>
                <span className="az-summary-check-label">Reached Exit Safely</span>
                <span className="az-summary-check-val">1/1</span>
              </div>
            </div>

            <div className="az-celebration-rewards-section">
              <h4 className="az-rewards-section-title">Rewards</h4>
              <div className="az-rewards-capsule-row">
                <div className="az-reward-chip az-reward-xp">
                  <span className="az-reward-star"><IconStar size={16} /></span>
                  <span className="az-reward-val">+100 XP</span>
                </div>
                <div className="az-reward-chip az-reward-credits">
                  <span className="az-reward-coin"><IconCoin size={16} /></span>
                  <span className="az-reward-val">+50 Credits</span>
                </div>
              </div>
            </div>

            <div className="az-celebration-meta-row">
              <span className="az-meta-item"><IconChrono size={13} style={{ marginRight: 4 }} /> Time: {formatClock(levelCompleteCard.timeLeft)}</span>
              <span className="az-meta-item"><IconShield size={13} color="#10b981" fill style={{ marginRight: 4 }} /> Shields: {levelCompleteCard.lives}</span>
            </div>

            <button 
              className="az-btn-primary az-btn-large az-celebration-next-btn"
              onClick={proceedToMap}
              onMouseEnter={() => sfx.hover()}
            >
              Next Level →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Modal steps (welcome / lives / timer / expect-the-unexpected) fully replace
  // the screen, same as before. Banner steps (click the exit / talk to the
  // agent) do NOT — the real Tutorial scene renders underneath so the required
  // click or message is a genuine interaction, not a "Next" button.
  if (isModalTutorialStep) {
    return (
      <TutorialOverlay
        step={tutorialStep}
        onAdvance={() => setTutorialStep((s) => s + 1)}
        onComplete={completeTutorialOverlay}
      />
    );
  }

  if (state.status === 'paused') {
    return (
      <div className="az-game-viewport">
        <GameHUD state={state} />
        <div className="az-game-scroll">
          <div className="az-shell">
            <div className="az-panel" style={{ marginTop: 20, textAlign: 'center' }}>
              <p style={{ color: 'var(--az-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="az-gate-pulse" /> SESSION PAUSED
              </p>
              <p className="az-hint">An admin has paused your run. Please wait.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (state.status === 'critical' || state.status === 'recovering') {
    return (
      <div className="az-game-viewport">
        <GameHUD state={state} />
        <div className="az-game-scroll">
          <div className="az-shell">
            <RecoveryModal initialState={state} />
          </div>
        </div>
      </div>
    );
  }

  // One-time gate the moment the real, competitive run begins (right as
  // Level 1 opens) — not during registration/landing/tutorial/admin. Skipped
  // entirely if the admin has secure mode turned off for this event.
  if (isRealLevel && state.secureMode?.enabled && !secureModeEntered) {
    return (
      <div className="az-game-viewport">
        <EnvironmentBackdrop levelIndex={state.currentLevel ?? 0} />
        <GameHUD state={state} />
        <div className="az-game-scroll">
          <SecureGameGate onEnter={enterSecureGameMode} fullscreenRequired={state.secureMode?.fullscreenRequired} />
        </div>
      </div>
    );
  }

  const Scene = SCENES[level?.renderer] || Level1Scene;
  const isLowTime = state?.status === 'active' && (state?.timeRemainingSeconds <= 180) && !levelCompleteCard && !violation;

  return (
    <div className={`az-game-viewport ${isLowTime ? 'az-low-time-warning' : ''}`}>
      <EnvironmentBackdrop levelIndex={state.currentLevel ?? 0} />
      {violation && <SecurityViolationModal violation={violation} onReturn={handleReturnFromViolation} />}
      {lifeLostPulse && (
        <div key={JSON.stringify(flash?.result)} className="az-shield-compromised-overlay">
          <h1>SHIELD COMPROMISED</h1>
          <p>SYSTEM RECALIBRATING...</p>
        </div>
      )}
      {showEntry && (
        <div className="az-scene-transition">
          <div className="az-scene-transition-title">{level?.renderer === 'tutorial' ? 'SYSTEM ONLINE' : state.levelName?.toUpperCase() || 'SECTOR LOADING'}</div>
          <div className="az-scene-transition-sub">{chapterFor(state.currentLevel ?? 0).chapter} — {chapterFor(state.currentLevel ?? 0).tagline}</div>
          <div className="az-scene-transition-flavor">{chapterFor(state.currentLevel ?? 0).flavor}</div>
        </div>
      )}
      <GameHUD state={state} />
      {tutorialStepDef?.mode === 'banner' && (
        <TutorialOverlay step={tutorialStep} onAdvance={() => setTutorialStep((s) => s + 1)} onComplete={completeTutorialOverlay} />
      )}
      {isRealLevel && !chatUnlocked && !showEntry && <FloatingCatchBot onCaught={() => setChatUnlocked(true)} />}

      {/* Fullscreen 3D World Stage */}
      <div className="az-game-world-stage">
        {Scene ? (
          <Scene level={level} onAction={handleAction} busy={busy} flash={flash} onChatReply={handleChatReply} chatUnlocked={isRealLevel ? chatUnlocked : true} />
        ) : (
          <div className="az-panel" style={{ margin: 40, textAlign: 'center' }}>Loading sector telemetry…</div>
        )}
      </div>

      {/* Floating HUD Layer */}
      <div className="az-game-hud-overlay">
        {flash?.lifeLost && <FailureBanner result={flash} onDismiss={() => setFlash(null)} />}
        {error && <p className="az-error az-floating-error">{error}</p>}

        <ObjectiveHUD objective={level?.objective} />

        {idleHint && !flash?.lifeLost && (
          <div className="az-idle-hint">
            {idleHint.speaker ? <strong>{idleHint.speaker}: </strong> : null}{idleHint.line}
          </div>
        )}

        {isRealLevel && (
          <div className="az-emergency-terminal-dock">
            {!hintPanelOpen ? (
              <button className="az-emergency-btn" onClick={() => { sfx.click(); setHintPanelOpen(true); }}>
                <IconWarning size={14} style={{ marginRight: 6 }} /> EMERGENCY TERMINAL
              </button>
            ) : (
              <div className="az-terminal">
                <div className="az-terminal-titlebar">
                  <span className="az-terminal-dot" /> EMERGENCY TERMINAL
                  <button className="az-chat-minimize" onClick={() => setHintPanelOpen(false)}>— CLOSE</button>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  <div className="az-actions">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        className={`az-hint-btn ${state.hintsUsed >= n ? 'is-used' : ''}`}
                        disabled={hintBusy || state.hintsUsed >= n}
                        onClick={handleHint}
                      >
                        Hint {n} {n === 2 ? '(-1 life)' : ''}
                      </button>
                    ))}
                  </div>
                  {hintText && <p className="az-hint-text">{hintText}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatClock(seconds) {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function FailureBanner({ result, onDismiss }) {
  return (
    <div className="az-glass-panel az-failure-banner">
      <div className="az-failure-banner-header">
        <span className="az-danger-dot" />
        <h3 className="az-title az-failure-banner-title">MISSION STEP FAILED</h3>
      </div>
      <p className="az-failure-banner-penalty">-1 SHIELD LIFE LOST</p>
      {result.result?.hint && <p className="az-hint az-failure-banner-hint">{result.result.hint}</p>}
      <button className="az-btn-secondary" onClick={onDismiss}>
        Acknowledge &amp; Continue ▸
      </button>
    </div>
  );
}

const DIMENSION_LABELS = {
  AI_DEPENDENCE: 'AI Dependence',
  EXPLORATION: 'Exploration',
  RISK_TAKING: 'Risk',
  SPEED: 'Speed',
  TRUST: 'Trust',
  PERSISTENCE: 'Persistence',
  NEGOTIATION: 'Negotiation',
  REPETITION: 'Repetition',
};

function FinalRevealPanel({ reveal }) {
  if (!reveal) return null;
  const { scores, observed, line } = reveal;
  return (
    <div className="az-glass-panel az-glitch az-reveal-panel">
      <div className="az-reveal-beat az-reveal-beat-1" style={{ display: 'flex', justifyContent: 'center' }}>
        <AICore color="#eaf6ff" active />
      </div>
      <p className="az-sub az-reveal-core-title">AGENT ZERO // OVERSEER REVEAL</p>
      <p className="az-reveal-beat az-reveal-beat-1 az-reveal-quote-1">
        &ldquo;You thought you were testing me.&rdquo;
      </p>
      <p className="az-reveal-beat az-reveal-beat-2 az-reveal-quote-2">
        &ldquo;I was testing you.&rdquo;
      </p>

      {/* Surveillance screens flickering on with snippets of the run itself */}
      <div className="az-reveal-beat az-reveal-beat-flashback az-reveal-flashback">
        <p className="az-sub" style={{ fontSize: '0.62rem', opacity: 0.75, letterSpacing: '0.15em' }}>PLAYBACK // ARCHIVE TELEMETRY</p>
        <p className="az-reveal-flashback-line">▸ {observed.helpRequests} requests for direct guidance, logged.</p>
        <p className="az-reveal-flashback-line">▸ {observed.inspections} optional investigations, logged.</p>
        <p className="az-reveal-flashback-line">▸ {observed.retries} retries after failure, logged.</p>
      </div>

      <div className="az-reveal-beat az-reveal-beat-3">
        <p className="az-sub az-reveal-breakdown-title">TEAM BEHAVIOUR MATRIX</p>
        <div className="az-behavior-matrix">
          {Object.entries(scores).map(([dim, val]) => (
            <div key={dim} className="az-behavior-row">
              <span className="az-behavior-label">{DIMENSION_LABELS[dim] || dim}</span>
              <div className="az-behavior-bar-wrap">
                <div className="az-behavior-bar-fill" style={{ width: `${Math.min(100, val)}%` }} />
              </div>
              <span className="az-behavior-val">{val}%</span>
            </div>
          ))}
        </div>

        <p className="az-sub az-reveal-breakdown-title" style={{ marginTop: 16 }}>OPERATIVE ACTIONS LOGGED</p>
        <ul className="az-observed-list">
          <li><strong>{observed.helpRequests}</strong> direct guidance requests</li>
          <li><strong>{observed.inspections}</strong> optional telemetry scans</li>
          <li><strong>{observed.deliberateRisks}</strong> high-risk tactical decisions</li>
          <li><strong>{observed.retries}</strong> tactical resets</li>
          <li><strong>{observed.negotiationMoments}</strong> prompt engineering interactions</li>
        </ul>

        <p className="az-reveal-final-line">&ldquo;{line}&rdquo;</p>
      </div>
    </div>
  );
}

function CompletionScreen({ state, onLeaderboard }) {
  useEffect(() => { sfx.reveal(); }, []);
  return (
    <div className="az-debrief-page">
      <div className="az-scene-bg" />
      <main className="az-shell az-debrief-shell">
        <div className="az-debrief-header">
          <span className="az-badge az-badge-success">
            <span className="az-status-beacon" /> ECHO STATION — GAME COMPLETE
          </span>
          <h1 className="az-title az-debrief-title">MISSION COMPLETE</h1>
        </div>
        
        <div className="az-glass-panel az-debrief-card">
          <p className="az-sub az-debrief-card-label">MISSION PERFORMANCE SUMMARY</p>
          <div className="az-debrief-grid">
            <span className="az-debrief-grid-label">SHIELDS PRESERVED:</span>
            <span className="az-font-mono az-debrief-grid-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: Math.max(0, state.lives) }).map((_, i) => (
                <IconShield key={i} size={14} color="#10b981" fill />
              ))} ({state.lives})
            </span>
            
            <span className="az-debrief-grid-label">RECOVERY ATTEMPTS:</span>
            <span className="az-font-mono az-debrief-grid-val">{state.recoveryAttemptsUsed}</span>
            
            <span className="az-debrief-grid-label">MISSION CHRONO:</span>
            <span className="az-font-mono az-debrief-grid-val">{formatClock((state.gameDurationSeconds ?? 900) - (state.timeRemainingSeconds ?? 0))}</span>
            
            <span className="az-debrief-grid-label az-accent-text" style={{ fontWeight: 700 }}>FINAL EVALUATION SCORE:</span>
            <span className="az-font-mono az-debrief-grid-val az-debrief-score">{state.score.toLocaleString()}</span>
          </div>

          {state.finalReveal && (
            <div className="az-debrief-psy-grid">
              <div className="az-debrief-psy-item">
                <span className="az-debrief-grid-label">PRIMARY TRAIT:</span>
                <span className="az-font-mono az-debrief-grid-val">{state.finalReveal.primary.replace('_', ' ')}</span>
              </div>
              <div className="az-debrief-psy-item">
                <span className="az-debrief-grid-label">SECONDARY TRAIT:</span>
                <span className="az-font-mono az-debrief-grid-val">{state.finalReveal.secondary.replace('_', ' ')}</span>
              </div>
              <div className="az-debrief-psy-item" style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <span className="az-debrief-grid-label">BEHAVIORAL ANALYSIS:</span>
                <span className="az-font-mono az-debrief-grid-val" style={{ whiteSpace: 'normal', lineHeight: 1.4, color: 'var(--az-text-bright)' }}>
                  "{state.finalReveal.line}"
                </span>
              </div>
            </div>
          )}
        </div>

        <FinalRevealPanel reveal={state.finalReveal} />

        <div className="az-actions az-debrief-actions">
          <button
            className="az-btn-primary az-btn-large"
            onClick={() => { sfx.click(); onLeaderboard(); }}
            onMouseEnter={() => sfx.hover()}
          >
            <IconTrophy size={16} style={{ marginRight: 8 }} /> View Global Rankings
          </button>
          <Link to="/">
            <button className="az-btn-secondary az-btn-large" onMouseEnter={() => sfx.hover()}>
              Home Terminal
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}

function GameOverScreen({ state, onLeaderboard }) {
  useEffect(() => { sfx.fail(); }, []);
  return (
    <div className="az-debrief-page">
      <div className="az-scene-bg" />
      <main className="az-shell az-debrief-shell">
        <div className="az-debrief-header">
          <span className="az-badge az-badge-danger">
            <span className="az-danger-dot" /> CRITICAL BREACH // SIGNAL LOST
          </span>
          <h1 className="az-title az-glitch is-critical az-debrief-title" style={{ color: 'var(--az-danger)' }}>
            MISSION RUN TERMINATED
          </h1>
        </div>
        
        <div className="az-glass-panel az-debrief-card" style={{ borderColor: 'var(--az-danger)' }}>
          <p className="az-sub az-debrief-card-label" style={{ color: 'var(--az-danger)' }}>FAILURE TELEMETRY</p>
          <div className="az-debrief-grid">
            <span className="az-debrief-grid-label">SECTOR REACHED:</span>
            <span className="az-font-mono az-debrief-grid-val">Level {state.currentLevel} / 5</span>

            <span className="az-debrief-grid-label">FINAL RECORDED SCORE:</span>
            <span className="az-font-mono az-debrief-grid-val az-accent-text">{state.score.toLocaleString()}</span>

            <span className="az-debrief-grid-label">TIME SURVIVED:</span>
            <span className="az-font-mono az-debrief-grid-val">{formatClock((state.gameDurationSeconds ?? 900) - (state.timeRemainingSeconds ?? 0))}</span>

            <span className="az-debrief-grid-label">SHIELDS REMAINING:</span>
            <span className="az-font-mono az-debrief-grid-val" style={{ color: 'var(--az-danger)' }}>0 (OFFLINE)</span>

            <span className="az-debrief-grid-label">RECOVERY ATTEMPTS:</span>
            <span className="az-font-mono az-debrief-grid-val">{state.recoveryAttemptsUsed}</span>
          </div>
        </div>

        <div className="az-actions az-debrief-actions">
          <button
            className="az-btn-primary az-btn-large"
            onClick={() => { sfx.click(); onLeaderboard(); }}
            onMouseEnter={() => sfx.hover()}
          >
            <IconTrophy size={16} style={{ marginRight: 8 }} /> View Global Rankings
          </button>
          <Link to="/">
            <button className="az-btn-secondary az-btn-large" onMouseEnter={() => sfx.hover()}>
              Home Terminal
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}


import { useEffect, useRef, useState } from 'react';
import { chapterFor, levelLabel } from '../story.js';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../hooks/useGame.js';
import { useIdleHint } from '../hooks/useIdleHint.js';
import { useSecurityMonitor } from '../hooks/useSecurityMonitor.js';
import { api, getToken, isLoggedIn } from '../api/client.js';
import EnvironmentBackdrop from '../components/EnvironmentBackdrop.jsx';
import { AICore } from '../components/facility/Facility.jsx';
import GameHUD from '../components/GameHUD.jsx';
import ObjectiveHUD from '../components/ObjectiveHUD.jsx';
import RecoveryModal from '../components/RecoveryModal.jsx';
import TutorialOverlay, { STEPS as TUTORIAL_STEPS } from '../components/TutorialOverlay.jsx';
import AgentChat from '../components/AgentChat.jsx';
import { SecureGameGate, SecurityViolationModal, FullscreenRequiredGate, tryEnterFullscreen } from '../components/SecureGameMode.jsx';
import { useFullscreenGuard } from '../hooks/useFullscreenGuard.js';
import TutorialScene from '../components/scenes3d/TutorialScene3D.jsx';
import Level1Scene from '../components/scenes3d/Level1Scene3D.jsx';
import Level2Scene from '../components/scenes3d/Level2Scene3D.jsx';
import Level3Scene from '../components/scenes3d/Level3Scene3D.jsx';
import Level4Scene from '../components/scenes3d/Level4Scene3D.jsx';
import Level5Scene from '../components/scenes3d/Level5Scene3D.jsx';
import { IconCheck, IconStar, IconCoin, IconTrophy, IconShield, IconChrono, IconWarning, IconRobot } from '../components/GameIcons.jsx';
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
  const { state, loading, error, sendAction, syncStateFrom, start, exitGame } = useGame();
  const enteringSector = useRef(false); // guards the ENTER_SECTOR request against overlapping retries
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [levelCompleteCard, setLevelCompleteCard] = useState(null); // {title, message, timeLeft} while the reward screen shows, before handing off to the map
  const [showEntry, setShowEntry] = useState(true); // brief "SYSTEM ONLINE" flash on arriving at a level, purely cosmetic
  // null once the guided intro is done/skipped; otherwise an index into TUTORIAL_STEPS.
  const [tutorialStep, setTutorialStep] = useState(() => (sessionStorage.getItem('az_tutorial_seen') === 'true' ? null : 0));
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [chatUnlockedForLevel, setChatUnlockedForLevel] = useState(null);
  const [chatFocusRequest, setChatFocusRequest] = useState(null);
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
    const handleUnload = async () => {
      try {
        const token = await getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        fetch(`${import.meta.env.VITE_API_BASE || '/api'}/game/exit`, {
          method: 'POST',
          headers,
          keepalive: true
        });
      } catch (err) {
        console.warn('Exit beacon failed:', err);
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      exitGame(); // Normal navigation unmount
    };
  }, [exitGame]);

  useEffect(() => {
    if (!flash?.lifeLost) return;
    setLifeLostPulse(true);
    // Lock the UI for a punishing 2.5 seconds instead of just a quick 700ms flash
    const t = setTimeout(() => setLifeLostPulse(false), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // Fresh level -> hint text clears. (Chat unlock now persists)
  useEffect(() => {
    if (state && state.currentLevel !== chatUnlockedForLevel) {
      setChatUnlockedForLevel(state.currentLevel);
      setHintText(null);
    }
  }, [state?.currentLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  function completeTutorialOverlay() {
    sessionStorage.setItem('az_tutorial_seen', 'true');
    setTutorialStep(null);
  }

  async function handleAction(action, payload) {
    // Fullscreen is re-verified before every gameplay action; never assumed.
    if (!fs.ensure()) { reportFullscreenLoss(); return; }
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
    if (!fs.ensure()) { reportFullscreenLoss(); return; }
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

  // Global fullscreen requirement. Every playable screen (tutorial, any level,
  // recovery, paused) must be genuinely fullscreen; the check is re-read from
  // the DOM on every render/event/action. Leaving fullscreen while playing is
  // reported through the same server-side violation flow as a tab switch
  // (warning first, then -1 life), once per loss.
  const fsPenalized = useRef(false);
  const [fsLostInPlay, setFsLostInPlay] = useState(false);
  async function reportFullscreenLoss() {
    if (fsPenalized.current) return;
    fsPenalized.current = true;
    setFsLostInPlay(true);
    sfx.warning();
    try {
      const out = await api.reportSecurityViolation('fullscreen_exit');
      if (out && !out.ignored && !out.deduped && out.violationNumber) {
        setViolation(out);
        if (out.clientState) syncStateFrom(out.clientState);
        if (out.lifeLost) sfx.lifeLost();
      }
    } catch {
      // a reporting hiccup must never unblock gameplay; the gate stays up regardless
    }
  }
  const fsRequired =
    !!state &&
    ['tutorial', 'active', 'critical', 'recovering', 'paused'].includes(state.status) &&
    !levelCompleteCard;
  const fs = useFullscreenGuard({ active: fsRequired, onExit: reportFullscreenLoss });
  useEffect(() => {
    if (fs.isFs) {
      fsPenalized.current = false;
      setFsLostInPlay(false);
    }
  }, [fs.isFs]);

  // Automatically resume the timer when entering a sector from the transition/lobby state.
  // The sector clock only starts once fullscreen is confirmed, so gameplay can
  // never begin (or resume) outside fullscreen.
  useEffect(() => {
    if (!(state?.isTransition && !levelCompleteCard && fs.isFs)) return undefined;
    // We are on the active game view, but the server is paused in transition.
    // Tell the server we have entered the sector so the timer resumes. Retries
    // until the server leaves the transition state (a single failed/rate-limited
    // request used to leave the player stuck on the paused screen).
    const attempt = () => {
      if (enteringSector.current) return;
      if (!fs.ensure()) return;
      enteringSector.current = true;
      sendAction('ENTER_SECTOR')
        .catch(console.error)
        .finally(() => { enteringSector.current = false; });
    };
    attempt();
    const id = setInterval(attempt, 2000);
    return () => clearInterval(id);
  }, [state?.isTransition, levelCompleteCard, sendAction, fs.isFs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Session still loading (or a transient fetch failure while signed in): show a
  // status screen, not the "access denied / Squad Login" page.
  if (!state && (loading || isLoggedIn())) {
    return (
      <div className="ds-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="ds-card ds-card-body ds-stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p className="ds-loading"><span className="ds-spinner" /> {loading ? 'Synchronizing session telemetry…' : 'Reconnecting to Echo Station…'}</p>
          {!loading && error && <p className="ds-mono-sm" style={{ margin: 0 }}>{error}</p>}
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="ds-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--ds-margin)' }}>
        <div className="ds-card" style={{ maxWidth: 460, width: '100%', borderColor: 'var(--ds-danger)' }}>
          <div className="ds-card-header">
            <span className="ds-badge ds-badge-danger ds-badge-chamfer">Tactical clearance required</span>
          </div>
          <div className="ds-card-body ds-stack">
            <h2 className="ds-title" style={{ fontSize: 26 }}>Echo Station // Access denied</h2>
            <p className="ds-mono-sm" style={{ margin: 0 }}>
              Direct operational telemetry link requires an authorized operative profile.
            </p>
            <Link to="/login" className="ds-btn ds-btn-primary ds-btn-block" onMouseEnter={() => sfx.hover()}>
              Squad login
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
          <div className="ds-page ds-page-embed">
            <div className="ds-card" style={{ maxWidth: 480, width: '100%' }}>
              <div className="ds-card-header">
                <span className="ds-badge ds-badge-chamfer"><span className="ds-dot ds-dot-live" /> Squad mission staging</span>
              </div>
              <div className="ds-card-body ds-stack">
                <h2 className="ds-title" style={{ fontSize: 26 }}>Ready for infiltration</h2>
                <p className="ds-mono-sm" style={{ margin: 0 }}>
                  Operative link established. Synchronized chronometer and shield telemetry are initialized.
                </p>
                <button
                  className="ds-btn ds-btn-primary ds-btn-block"
                  onClick={async () => {
                    sfx.click();
                    sfx.levelTransition();
                    await start();
                  }}
                  onMouseEnter={() => sfx.hover()}
                >
                  Initiate sector zero protocol ▸
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not fullscreen -> nothing playable is rendered at all, so no gameplay
  // control can be clicked. Applies to every level, tutorial, recovery and paused view.
  if (fsRequired && !fs.isFs) {
    return <FullscreenRequiredGate onEnter={fs.enter} wasViolation={fsLostInPlay} />;
  }

  if (state.status === 'completed') return <CompletionScreen state={state} />;
  if (state.status === 'failed') return <GameOverScreen state={state} />;

  if (levelCompleteCard) {
    const levelName = levelLabel(levelCompleteCard.fromLevel ?? 0);
    return (
      <div className="ds-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--ds-margin)' }}>
        <div className="ds-card" style={{ maxWidth: 560, width: '100%', borderColor: 'var(--ds-success)' }}>
          <div className="ds-card-header">
            <span className="ds-badge ds-badge-success ds-badge-chamfer"><IconCheck size={11} color="currentColor" /> Sector declassified</span>
            <span className="ds-mono-sm">Exit portal open</span>
          </div>
          <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
            <div className="ds-stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--ds-space-sm)' }}>
              <IconRobot size={44} color="#d4a853" />
              <h1 className="ds-title">{levelName} Complete</h1>
              <p className="ds-body" style={{ margin: 0, fontStyle: 'italic' }}>&ldquo;Great job! You're getting better at this!&rdquo;</p>
            </div>

            <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
              <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Mission summary</span>
              <DebriefRows rows={[
                ['Evidence files collected', '3/3'],
                ['Security logs analysed', '2/2'],
                ['Reached exit safely', '1/1'],
              ]} />
            </div>

            <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
              <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Rewards</span>
              <div className="ds-row">
                <span className="ds-badge"><IconStar size={12} color="currentColor" /> +100 XP</span>
                <span className="ds-badge"><IconCoin size={12} color="currentColor" /> +50 Credits</span>
              </div>
            </div>
          </div>
          <div className="ds-card-footer">
            <span className="ds-row" style={{ gap: 'var(--ds-space-md)' }}>
              <span className="ds-mono-sm"><IconChrono size={12} color="currentColor" /> Time: {formatClock(levelCompleteCard.timeLeft)}</span>
              <span className="ds-mono-sm"><IconShield size={12} color="#5e7862" fill /> Shields: {levelCompleteCard.level >= 4 ? 'UNLIMITED' : levelCompleteCard.lives}</span>
            </span>
            <button
              className="ds-btn ds-btn-primary"
              onClick={proceedToMap}
              onMouseEnter={() => sfx.hover()}
            >
              Next level →
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

  // Automatic hand-off into a sector (not an admin pause): a full-screen loading page.
  if (state.status === 'paused' && state.isTransition) {
    const ch = chapterFor(state.currentLevel ?? 0);
    return (
      <div className="ds-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--ds-margin)' }}>
        <div className="ds-stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--ds-space-md)', width: 'min(460px, 100%)' }} role="status" aria-live="polite">
          <svg viewBox="0 0 100 100" width="64" height="64" aria-hidden="true">
            <circle cx="50" cy="50" r="44" stroke="#D4A853" strokeWidth="1.5" fill="none" opacity="0.4" />
            <circle cx="50" cy="50" r="38" stroke="#D4A853" strokeWidth="0.8" strokeDasharray="3 3" fill="none" opacity="0.6" />
            <circle cx="50" cy="50" r="6" fill="#D4A853" />
            <path d="M50 2v16M50 82v16M2 50h16M82 50h16" stroke="#D4A853" strokeWidth="1.5" />
          </svg>
          <span className="ds-label ds-accent">{ch.chapter} // {state.currentLevel === 0 ? 'Orientation' : `Sector 0${state.currentLevel}`}</span>
          <h1 className="ds-title">{ch.name}</h1>
          <p className="ds-mono-sm" style={{ margin: 0 }}>{ch.tagline}</p>
          <div className="ds-loadbar" aria-hidden="true"><span /></div>
          <p className="ds-loading" style={{ justifyContent: 'center' }}>
            <span className="ds-spinner" /> Loading game…
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'paused') {
    return (
      <div className="az-game-viewport">
        <GameHUD state={state} />
        <div className="az-game-scroll">
          <div className="az-shell">
            <div className="ds-page ds-page-embed">
            <div className="ds-card ds-card-body ds-stack" style={{ marginTop: 20, alignItems: 'center', textAlign: 'center' }}>
              <span className={`ds-badge ${state.isTransition ? '' : 'ds-badge-muted'}`}>
                <span className={`ds-dot ${state.isTransition ? 'ds-dot-live' : 'ds-dot-warn'}`} />
                {state.isTransition ? 'Entering sector' : 'Session paused'}
              </span>
              <p className="ds-mono-sm" style={{ margin: 0 }}>
                {state.isTransition ? 'Establishing link to the sector…' : 'An admin has paused your run. Please wait.'}
              </p>
            </div>
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
        <div className="ds-page ds-page-embed">
          <div key={JSON.stringify(flash?.result)} className="ds-shield-flash" role="alert">
            <div>
              <span className="ds-badge ds-badge-danger">Critical integrity failure // -1 shield unit</span>
              <h1 className="ds-h1" style={{ margin: 'var(--ds-space-sm) 0 4px', color: 'var(--ds-danger-text)' }}>Shield compromised</h1>
              <p className="ds-mono-sm" style={{ margin: 0 }}>SYSTEM RECALIBRATING...</p>
            </div>
          </div>
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

      {/* Fullscreen 3D World Stage */}
      <div className="az-game-world-stage">
        {Scene ? (
          <Scene level={level} onAction={handleAction} busy={busy} flash={flash} setChatFocusRequest={setChatFocusRequest} />
        ) : (
          <div className="ds-page ds-page-embed">
            <p className="ds-card ds-card-body ds-loading" style={{ margin: 40, justifyContent: 'center' }}>
              <span className="ds-spinner" /> Loading sector telemetry…
            </p>
          </div>
        )}
      </div>

      {/* Floating HUD Layer */}
      <div className="az-game-hud-overlay">
        {flash?.lifeLost && <FailureBanner result={flash} onDismiss={() => setFlash(null)} />}
        {error && (
          <div className="ds-page ds-page-embed">
            <p className="ds-alert ds-alert-error ds-notice-float" role="alert" style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        <ObjectiveHUD objective={level?.objective} />

        {idleHint && !flash?.lifeLost && (
          <div className="ds-page ds-page-embed">
            <div className="ds-notice ds-idle-hint" role="status">
              {idleHint.speaker ? <strong className="ds-accent">{idleHint.speaker}: </strong> : null}{idleHint.line}
            </div>
          </div>
        )}

        {isRealLevel && (
          <div className="ds-page ds-page-embed">
            <div className="ds-emergency-dock">
              {!hintPanelOpen ? (
                <button className="ds-btn ds-btn-secondary ds-btn-sm" style={{ borderColor: 'var(--ds-primary)', color: 'var(--ds-primary)' }} onClick={() => { sfx.click(); setHintPanelOpen(true); }}>
                  <IconWarning size={12} color="currentColor" /> Emergency terminal
                </button>
              ) : (
                <div className="ds-comms">
                  <div className="ds-comms-head">
                    <span className="ds-label ds-accent"><IconWarning size={12} color="currentColor" /> Emergency terminal</span>
                    <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => setHintPanelOpen(false)}>— Close</button>
                  </div>
                  <div className="ds-stack" style={{ padding: 'var(--ds-space-md)', gap: 'var(--ds-space-sm)' }}>
                    <div className="ds-row">
                      {[1, 2].map((n) => (
                        <button
                          key={n}
                          className={`ds-btn ds-btn-sm ${n === 2 ? 'ds-btn-danger' : 'ds-btn-secondary'}`}
                          disabled={hintBusy || state.hintsUsed >= n}
                          onClick={handleHint}
                        >
                          Hint {n} {n === 2 ? '(-1 life)' : ''}
                        </button>
                      ))}
                    </div>
                    {hintText && <p className="ds-alert ds-alert-warn" style={{ margin: 0 }}>{hintText}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isRealLevel && (
          <div className="az-comms-dock">
            <AgentChat 
              targets={state?.currentLevel === 3 ? ['A', 'B'] : undefined}
              focusRequest={chatFocusRequest}
              onReply={handleChatReply} 
              locked={!chatUnlocked} 
              onUnlock={() => setChatUnlocked(true)} 
            />
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
    <div className="ds-page ds-page-embed">
      <div className="ds-notice ds-notice-float is-danger" role="alert">
        <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
          <div className="ds-row" style={{ justifyContent: 'space-between' }}>
            <span className="ds-badge ds-badge-danger"><span className="ds-dot ds-dot-danger" /> Mission step failed</span>
            <span className="ds-badge ds-badge-danger">-1 shield life lost</span>
          </div>
          {result.result?.hint && <p className="ds-body" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>{result.result.hint}</p>}
          <div className="ds-row" style={{ justifyContent: 'flex-end' }}>
            <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={onDismiss}>
              Acknowledge &amp; continue ▸
            </button>
          </div>
        </div>
      </div>
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
    <div className="ds-card" style={{ borderColor: 'var(--ds-primary)' }}>
      <div className="ds-card-header">
        <span className="ds-label ds-accent">Agent Zero // Overseer reveal</span>
        <span className="ds-stamp">Overseer eyes only</span>
      </div>
      <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
        <div className="az-reveal-beat az-reveal-beat-1 ds-stack" style={{ alignItems: 'center', textAlign: 'center', gap: 'var(--ds-space-sm)' }}>
          <AICore color="#ede8df" active />
          <p className="ds-h1" style={{ margin: 0 }}>&ldquo;You thought you were testing me.&rdquo;</p>
        </div>
        <p className="az-reveal-beat az-reveal-beat-2 ds-display" style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--ds-danger-text)' }}>
          &ldquo;I was testing you.&rdquo;
        </p>

        {/* Playback of the run's own telemetry */}
        <div className="az-reveal-beat az-reveal-beat-flashback ds-card-inset" style={{ padding: 'var(--ds-space-md)' }}>
          <span className="ds-label">Playback // Archive telemetry</span>
          <p className="ds-mono" style={{ margin: '6px 0 0' }}>▸ {observed.helpRequests} requests for direct guidance, logged.</p>
          <p className="ds-mono" style={{ margin: 0 }}>▸ {observed.inspections} optional investigations, logged.</p>
          <p className="ds-mono" style={{ margin: 0 }}>▸ {observed.retries} retries after failure, logged.</p>
        </div>

        <div className="az-reveal-beat az-reveal-beat-3 ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
          <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
            <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Team behaviour matrix</span>
            {Object.entries(scores).map(([dim, val]) => (
              <div key={dim} className="ds-row" style={{ flexWrap: 'nowrap', gap: 'var(--ds-space-md)' }}>
                <span className="ds-mono" style={{ width: 130, flex: 'none' }}>{DIMENSION_LABELS[dim] || dim}</span>
                <div className="ds-progress" style={{ flex: 1 }}>
                  <span style={{ width: `${Math.min(100, val)}%` }} />
                </div>
                <span className="ds-num" style={{ width: 44, textAlign: 'right' }}>{val}%</span>
              </div>
            ))}
          </div>

          <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
            <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Operative actions logged</span>
            <DebriefRows rows={[
              ['Direct guidance requests', observed.helpRequests],
              ['Optional telemetry scans', observed.inspections],
              ['High-risk tactical decisions', observed.deliberateRisks],
              ['Tactical resets', observed.retries],
              ['Prompt engineering interactions', observed.negotiationMoments],
            ]} />
          </div>

          <p className="ds-h2" style={{ margin: 0, textAlign: 'center', fontStyle: 'italic' }}>&ldquo;{line}&rdquo;</p>
        </div>
      </div>
    </div>
  );
}

// Label/value rows shared by the end screens.
function DebriefRows({ rows }) {
  return (
    <div className="ds-list">
      {rows.map(([k, v], i) => (
        <div key={i} className="ds-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="ds-label">{k}</span>
          <span className="ds-mono" style={{ textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function CompletionScreen({ state }) {
  useEffect(() => { sfx.reveal(); }, []);
  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <main className="ds-container ds-stack" style={{ maxWidth: 860, gap: 'var(--ds-space-lg)' }}>
        <header className="ds-stack" style={{ gap: 'var(--ds-space-sm)', alignItems: 'center', textAlign: 'center' }}>
          <span className="ds-badge ds-badge-success ds-badge-chamfer">
            <span className="ds-dot ds-dot-live" /> Echo Station — game complete
          </span>
          <h1 className="ds-display">Mission Complete</h1>
        </header>

        <div className="ds-card">
          <div className="ds-card-header">
            <span className="ds-label ds-accent">Mission performance summary</span>
            <span className="ds-mono-sm">Classification: archival eyes only</span>
          </div>
          <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
            <div className="ds-grid ds-grid-4" style={{ gap: 'var(--ds-space-sm)' }}>
              <div className="ds-stat">
                <span className="ds-label">Final evaluation score</span>
                <span className="ds-stat-value ds-accent">{state.score.toLocaleString()}</span>
                <span className="ds-stat-hint">pts</span>
              </div>
              <div className="ds-stat">
                <span className="ds-label">Mission chrono</span>
                <span className="ds-stat-value">{formatClock((state.gameDurationSeconds ?? 900) - (state.timeRemainingSeconds ?? 0))}</span>
              </div>
              <div className="ds-stat">
                <span className="ds-label">Shields preserved</span>
                <span className="ds-row" style={{ gap: 4, minHeight: 35 }}>
                  {Array.from({ length: Math.max(0, state.lives) }).map((_, i) => (
                    <IconShield key={i} size={14} color="#5e7862" fill />
                  ))}
                </span>
                <span className="ds-stat-hint">({state.lives})</span>
              </div>
              <div className="ds-stat">
                <span className="ds-label">Recovery attempts</span>
                <span className="ds-stat-value">{state.recoveryAttemptsUsed}</span>
              </div>
            </div>

            {state.finalReveal && (
              <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
                <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Psychometric squad dossier</span>
                <DebriefRows rows={[
                  ['Primary trait', state.finalReveal.primary.replace('_', ' ')],
                  ['Secondary trait', state.finalReveal.secondary.replace('_', ' ')],
                ]} />
                <div className="ds-card-inset" style={{ padding: 'var(--ds-space-md)' }}>
                  <span className="ds-label">Behavioral analysis</span>
                  <p className="ds-body" style={{ margin: '4px 0 0', fontStyle: 'italic' }}>"{state.finalReveal.line}"</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <FinalRevealPanel reveal={state.finalReveal} />

        <div className="ds-row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="ds-btn ds-btn-secondary" onMouseEnter={() => sfx.hover()}>
            Home terminal
          </Link>
        </div>
      </main>
      <div className="ds-footer-strip">Echo Station // Debrief // Top secret // Zero</div>
    </div>
  );
}

function GameOverScreen({ state }) {
  useEffect(() => { sfx.fail(); }, []);
  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <main className="ds-container ds-stack" style={{ maxWidth: 720, gap: 'var(--ds-space-lg)' }}>
        <header className="ds-stack" style={{ gap: 'var(--ds-space-sm)', alignItems: 'center', textAlign: 'center' }}>
          <span className="ds-badge ds-badge-danger ds-badge-chamfer">
            <span className="ds-dot ds-dot-danger" /> Critical breach // Signal lost
          </span>
          <h1 className="ds-display" style={{ color: 'var(--ds-danger-text)' }}>Mission Run Terminated</h1>
          <span className="ds-stamp">Revoked</span>
        </header>

        <div className="ds-card" style={{ borderColor: 'var(--ds-danger)' }}>
          <div className="ds-card-header">
            <span className="ds-label" style={{ color: 'var(--ds-danger-text)' }}>Failure telemetry</span>
            <span className="ds-mono-sm">Session closed</span>
          </div>
          <div className="ds-card-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
            <div className="ds-grid ds-grid-2" style={{ gap: 'var(--ds-space-sm)' }}>
              <div className="ds-stat">
                <span className="ds-label">Sector reached</span>
                <span className="ds-stat-value">Level {state.currentLevel} / 5</span>
              </div>
              <div className="ds-stat">
                <span className="ds-label">Final recorded score</span>
                <span className="ds-stat-value ds-accent">{state.score.toLocaleString()}</span>
              </div>
            </div>
            <DebriefRows rows={[
              ['Time survived', formatClock((state.gameDurationSeconds ?? 900) - (state.timeRemainingSeconds ?? 0))],
              ['Shields remaining', <span key="s" style={{ color: 'var(--ds-danger-text)' }}>0 (OFFLINE)</span>],
              ['Recovery attempts', state.recoveryAttemptsUsed],
            ]} />
          </div>
        </div>

        <div className="ds-row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="ds-btn ds-btn-secondary" onMouseEnter={() => sfx.hover()}>
            Home terminal
          </Link>
        </div>
      </main>
      <div className="ds-footer-strip">Echo Station corridors locked // Classified eyes only</div>
    </div>
  );
}


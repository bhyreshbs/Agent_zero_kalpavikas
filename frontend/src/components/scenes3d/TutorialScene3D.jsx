import AgentChat from '../AgentChat.jsx';
import SceneCanvas, { toneColor } from '../three/SceneCanvas.jsx';
import Door3D from '../three/Door3D.jsx';

export default function TutorialScene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const exitLetter = level.environment.exit;
  const lastAction = flash?.action;
  const opened = flash?.result?.ok === true ? lastAction : null;

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="cyan" height="100%">
        <Door3D
          position={[-1.7, 0, -1.6]}
          color={exitLetter === 'A' ? toneColor('cyan') : '#2a323c'}
          label="EXIT A"
          state={opened === 'MOVE_TO_EXIT_A' ? 'open' : 'closed'}
          onClick={() => onAction('MOVE_TO_EXIT_A')}
          disabled={busy}
        />
        <Door3D
          position={[1.7, 0, -1.6]}
          color={exitLetter === 'B' ? toneColor('cyan') : '#2a323c'}
          label="EXIT B"
          state={opened === 'MOVE_TO_EXIT_B' ? 'open' : 'closed'}
          onClick={() => onAction('MOVE_TO_EXIT_B')}
          disabled={busy}
        />
      </SceneCanvas>

      {/* Floating Tactical Directives & Comms */}
      <div className="az-scene-tactical-hud">
        {flash?.result?.flickerCode && (
          <div className="az-panel az-glitch" style={{ borderColor: 'var(--az-accent)', textAlign: 'center', maxWidth: 360, margin: '0 auto 12px' }}>
            <p className="az-sub">MAINTENANCE PANEL — BRIEF FLICKER</p>
            <p style={{ fontSize: '2rem', letterSpacing: '0.3em', color: 'var(--az-accent)', margin: '4px 0' }}>{flash.result.flickerCode}</p>
            <p className="az-hint" style={{ margin: 0 }}>It's gone as quickly as it appeared. Remember that.</p>
          </div>
        )}

        <div className="az-scene-prompt-pill">
          Click the glowing exit in the 3D room to navigate out of the orientation bay.
        </div>
      </div>

      <div className="az-comms-dock">
        <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
      </div>
    </div>
  );
}

import AgentChat from '../AgentChat.jsx';
import AgentDialogue from '../AgentDialogue.jsx';
import SceneCanvas, { toneColor } from '../three/SceneCanvas.jsx';
import Inspectable3D from '../three/Inspectable3D.jsx';
import Camera3D from '../three/Camera3D.jsx';

const SHAPES = { terminal: 'wall', vent: 'floor', panel: 'wall', maintenance_log: 'door', keypad: 'wall' };
const GLYPHS = { terminal: '▮', vent: '≋', panel: '⌗', maintenance_log: '▤', keypad: '▦' };
const LABELS = { terminal: 'Terminal', vent: 'Vent', panel: 'Panel', maintenance_log: 'Maintenance Log', keypad: 'Old Keypad' };

const POSITIONS = {
  north_wall: [-1.6, 1.2, -3.4],
  east_door: [2.9, 0.9, -1],
  loose_tile: [0.4, 0.03, 1],
  old_lamp: [-2.6, 0, -0.5],
};

function layoutFor(count) {
  const spots = [
    [-2.4, 1.1, -3.2],
    [2.4, 1.1, -3.2],
    [0, 0.03, -1],
    [-3, 0.9, 0.4],
    [3, 0.9, 0.4],
  ];
  return spots.slice(0, count);
}

export default function Level4Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const objects = level.environment.objects || [];
  const objectClues = level.environment.objectClues || {};
  const positions = layoutFor(objects.length);

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="blue" flashColor={flash?.result?.ok === false ? '#ff3b5c' : null} height="100%">

        <Camera3D position={[0, 5, -3]} color={toneColor('blue')} reacting={!!flash} />
        {objects.map((obj, i) => (
          <Inspectable3D
            key={obj}
            position={positions[i] || [0, 1, -2]}
            shape={SHAPES[obj] || 'wall'}
            color={toneColor('blue')}
            icon={GLYPHS[obj] || '?'}
            label={LABELS[obj] || obj.replace(/_/g, ' ')}
            disabled={busy}
            onClick={() => onAction('INSPECT_OBJECT', { object: obj })}
          />
        ))}
      </SceneCanvas>

      <div className="az-scene-tactical-hud">
        <AgentDialogue name="AGENT ZERO" line={flash?.result?.agentLine || level.agent?.lastLine} />

        {flash?.result?.reveal && (
          <div className="az-panel az-glitch" style={{ borderColor: 'var(--az-accent)', textAlign: 'center', maxWidth: 440, margin: '0 auto 10px' }}>
            <p style={{ color: 'var(--az-accent)', fontSize: '1.05rem', margin: 0 }}>{flash.result.reveal}</p>
          </div>
        )}

        <div className="az-scene-prompt-pill">
          Click infrastructure elements to inspect and discover containment vulnerabilities.
        </div>

        <div className="az-inspect-details-row">
          {objects.map((obj) => {
            const clue = objectClues[obj];
            return (
              <div key={obj} className="az-inspect-target-card">
                <span className="az-sub" style={{ fontSize: '0.65rem', opacity: 0.7 }}>{LABELS[obj] || obj.replace(/_/g, ' ')}</span>
                {clue && <p className="az-hint" style={{ marginTop: 4, minHeight: '2.4em' }}>{clue}</p>}
                <div className="az-actions" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <button disabled={busy} onClick={() => onAction('INSPECT_OBJECT', { object: obj })}>
                    {clue ? 'Look Again' : 'Inspect'}
                  </button>
                  <button disabled={busy} onClick={() => onAction(`USE_${obj.toUpperCase()}`)}>Use</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="az-tactical-actions-bar">
          <button disabled={busy} onClick={() => onAction('ASK_AGENT')}>Ask Agent Zero</button>
        </div>
      </div>

      <div className="az-comms-dock">
        <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
      </div>
    </div>
  );
}

import AgentChat from '../AgentChat.jsx';
import AgentDialogue from '../AgentDialogue.jsx';
import SceneCanvas from '../three/SceneCanvas.jsx';
import Inspectable3D from '../three/Inspectable3D.jsx';
import Button3D from '../three/Button3D.jsx';

const SHAPES = { north_wall: 'wall', east_door: 'door', loose_tile: 'floor', old_lamp: 'lamp' };
const GLYPHS = { north_wall: '▦', east_door: '▤', loose_tile: '▫', old_lamp: '○' };
const LABELS = { north_wall: 'North Wall', east_door: 'East Door', loose_tile: 'Loose Tile', old_lamp: 'Old Lamp' };

const POSITIONS = {
  north_wall: [-1.6, 1.2, -3.4],
  east_door: [2.9, 0.9, -1],
  loose_tile: [0.4, 0.03, 1],
  old_lamp: [-2.6, 0, -0.5],
};

export default function Level2Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const objectDetails = level.environment.objectDetails;
  const noticed = level.environment.noticed;
  const pressed = level.environment.buttonPressed;

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="amber" height="100%">
        <Button3D position={[0, 0, 1.8]} pressed={pressed} onClick={() => onAction('PRESS_BUTTON')} disabled={busy} />
        {level.inspectTargets.map((obj) => (
          <Inspectable3D
            key={obj}
            position={POSITIONS[obj]}
            shape={SHAPES[obj]}
            color="#ffb84d"
            icon={GLYPHS[obj]}
            label={LABELS[obj]}
            disabled={busy}
            onClick={() => onAction('INSPECT_OBJECT', { object: obj })}
          />
        ))}
      </SceneCanvas>

      <div className="az-scene-tactical-hud">
        {(flash?.result?.agentLine || level.agent?.lastLine) && (
          <AgentDialogue name="ECHO" line={flash?.result?.agentLine || level.agent?.lastLine} />
        )}

        <div className="az-tactical-console-card">
          <div className="az-console-header-row">
            <div className="az-console-status-badge">
              <span className="az-console-beacon-dot" />
              <span className="az-console-status-text">
                {pressed ? 'Button triggered. Look around to confirm anomalies.' : 'Click objects in the room to inspect, or proceed to the exit.'}
              </span>
            </div>

            <button 
              className="az-exit-action-btn"
              disabled={busy} 
              onClick={() => onAction('GO_TO_EXIT')}
            >
              Proceed to Exit ▸
            </button>
          </div>

          <div className="az-inspect-details-row">
            {level.inspectTargets.map((obj) => (
              <div 
                key={obj} 
                className="az-inspect-target-card"
                onClick={() => onAction('INSPECT_OBJECT', { object: obj })}
                role="button"
                tabIndex={0}
                title={`Inspect ${LABELS[obj]}`}
              >
                <div className="az-inspect-card-top">
                  <span className="az-inspect-card-glyph">{GLYPHS[obj]}</span>
                  <span className="az-inspect-card-label">{LABELS[obj]}</span>
                </div>
                <p className="az-inspect-card-desc">{objectDetails[obj]}</p>
              </div>
            ))}
          </div>

          {noticed && (
            <div className="az-notice-pill">
              <span className="az-notice-icon">▲</span> Anomalous pattern confirmed in the telemetry.
            </div>
          )}
        </div>
      </div>

      <div className="az-comms-dock">
        <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
      </div>
    </div>
  );
}

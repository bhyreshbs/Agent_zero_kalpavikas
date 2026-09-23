import { useState, useEffect } from 'react';
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

export default function Level2Scene({ level, onAction, busy, flash }) {
  const objectDetails = level.environment.objectDetails;
  const noticed = level.environment.noticed;
  const pressed = level.environment.buttonPressed;

  const [initialDetails, setInitialDetails] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (objectDetails && !initialDetails && !pressed) {
      setInitialDetails(objectDetails);
    }
  }, [objectDetails, initialDetails, pressed]);

  const isAnomalyActive = initialDetails && JSON.stringify(initialDetails) !== JSON.stringify(objectDetails);

  useEffect(() => {
    if (isAnomalyActive) {
      setTransitioning(true);
      const timer = setTimeout(() => setTransitioning(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isAnomalyActive]);

  return (
    <div className={`az-scene3d-stage ${transitioning ? 'az-glitch-active' : ''}`}>
      {transitioning && (
        <div className="az-anomaly-overlay">
          <span className="az-anomaly-text">CONTROL ACTIVATED // ENVIRONMENTAL STATE CHANGED</span>
        </div>
      )}
      <SceneCanvas tone={transitioning ? 'red' : 'amber'} height="100%">
        <Button3D position={[0, 0, 0.5]} pressed={pressed} onClick={() => onAction('PRESS_BUTTON')} disabled={busy} />
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

        <div className="az-scene-prompt-pill">
          {pressed 
            ? (noticed ? 'ANOMALY CONFIRMED — SELECT EXIT' : 'CONTROL ACTIVATED — IDENTIFY ANOMALY')
            : 'INVESTIGATE THE CHAMBER'}
        </div>

        <div className="az-tactical-actions-bar">
          <button 
            className="az-exit-action-btn"
            disabled={busy || !noticed} 
            onClick={() => onAction('GO_TO_EXIT')}
            style={{ opacity: noticed ? 1 : 0.3 }}
          >
            Proceed to Exit ▸
          </button>
        </div>

        <div className="az-tactical-console-card" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
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
                {isAnomalyActive ? (
                  <div className="az-inspect-card-desc-diff">
                    <p className="az-diff-archived">
                      <span className="az-diff-tag">[ARCHIVED]</span> {initialDetails[obj]}
                    </p>
                    <p className="az-diff-current">
                      <span className="az-diff-tag">[CURRENT]</span> {objectDetails[obj]}
                    </p>
                  </div>
                ) : (
                  <p className="az-inspect-card-desc">
                    <span className="az-diff-tag">[TELEMETRY]</span> {objectDetails[obj]}
                  </p>
                )}
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
    </div>
  );
}

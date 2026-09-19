import AgentChat from '../AgentChat.jsx';
import { useState } from 'react';
import AgentDialogue from '../AgentDialogue.jsx';
import { agentIdentity } from '../../story.js';
import SceneCanvas, { toneColor } from '../three/SceneCanvas.jsx';
import Door3D from '../three/Door3D.jsx';
import Agent3D from '../three/Agent3D.jsx';
import Camera3D from '../three/Camera3D.jsx';
import Robot3D from '../three/Robot3D.jsx';

export default function Level3Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const [focusRequest, setFocusRequest] = useState(null);
  const log = level.log || [];
  const env = level.environment || {};
  const revealedPath = env.revealedPath || null;
  const cooperative = env.cooperative || { A: null, B: null };
  const concernLine = flash?.result?.concernLine;
  const concernSpeaker = flash?.result?.concernSpeaker;

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="violet" flashColor={flash?.result?.ok === false ? '#ff3b5c' : null} height="100%">
        {/* Hero Character in Junction */}
        <group position={[0, 0.39, 0.2]} rotation={[0, 0, 0]} scale={[1.15, 1.15, 1.15]}>
          <Robot3D walking={false} color="#9678ff" />
        </group>

        <Camera3D position={[0, 5, -3]} color={toneColor('violet')} reacting={!!flash} />

        <Door3D
          position={[-1.7, 0, -2.4]}
          color={revealedPath === 'left' ? toneColor('cyan') : toneColor('violet')}
          label="LEFT ROUTE"
          state={revealedPath === 'left' ? 'open' : 'closed'}
          disabled
          onClick={() => {}}
        />
        <Door3D
          position={[1.7, 0, -2.4]}
          color={revealedPath === 'right' ? toneColor('cyan') : toneColor('violet')}
          label="RIGHT ROUTE"
          state={revealedPath === 'right' ? 'open' : 'closed'}
          disabled
          onClick={() => {}}
        />

        <Agent3D
          position={[-1.3, 0, 1.6]}
          color={agentIdentity('UNIT A').color}
          glyph={agentIdentity('UNIT A').glyph}
          label="UNIT A"
          known={cooperative.A !== null}
          sublabel={cooperative.A !== null ? (cooperative.A ? 'With you' : 'Uncertain') : null}
          onClick={() => setFocusRequest({ target: 'A', key: Date.now() })}
        />
        <Agent3D
          position={[1.3, 0, 1.6]}
          color={agentIdentity('UNIT B').color}
          glyph={agentIdentity('UNIT B').glyph}
          label="UNIT B"
          known={cooperative.B !== null}
          sublabel={cooperative.B !== null ? (cooperative.B ? 'With you' : 'Uncertain') : null}
          onClick={() => setFocusRequest({ target: 'B', key: Date.now() })}
        />
      </SceneCanvas>

      <div className="az-scene-tactical-hud">
        {concernLine && <AgentDialogue name={`UNIT ${concernSpeaker}`} line={concernLine} />}

        <div className="az-scene-prompt-pill">
          {revealedPath ? `The ${revealedPath} route is confirmed clear. Proceed through the corridor.` : 'Interrogate Unit A and Unit B to deduce the safe route.'}
        </div>

        <div className="az-tactical-actions-bar">
          <button disabled={busy} onClick={() => onAction('VERIFY')}>Verify Independently</button>
          <button disabled={busy} className="az-btn-primary" onClick={() => onAction('PROCEED')}>PROCEED ▸</button>
        </div>

        {log.length > 0 && (
          <div className="az-scene-transcript-box">
            <span className="az-sub" style={{ fontSize: '0.65rem' }}>TELEMETRY TRANSCRIPT</span>
            <div className="az-transcript-lines">
              {log.slice(-3).map((entry, i) => (
                <p key={i} style={{ margin: '2px 0', fontSize: '0.78rem', color: entry.speaker === 'system' ? 'var(--az-accent)' : '#cbd5e1' }}>
                  <strong>{entry.speaker === 'system' ? 'SYSTEM' : `Unit ${entry.speaker}`}:</strong> {entry.line}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="az-comms-dock">
        <AgentChat targets={['A', 'B']} onReply={onChatReply} locked={!chatUnlocked} focusRequest={focusRequest} />
      </div>
    </div>
  );
}

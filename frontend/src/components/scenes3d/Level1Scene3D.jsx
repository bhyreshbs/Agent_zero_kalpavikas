import AgentDialogue from '../AgentDialogue.jsx';
import SceneCanvas, { toneColor } from '../three/SceneCanvas.jsx';
import Door3D from '../three/Door3D.jsx';
import KeyCard3D from '../three/KeyCard3D.jsx';
import Scanner3D from '../three/Scanner3D.jsx';

export default function Level1Scene({ level, onAction, busy, flash }) {
  const hasKey = level.environment.hasKey;
  const lastAction = flash?.action;
  const doorJustOpened = flash?.result?.ok === true ? lastAction : null;
  const failed = flash?.result?.ok === false;

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="cyan" flashColor={failed ? '#ff3b5c' : null} height="100%">
        <Scanner3D position={[0, 0, -2.6]} hasKey={hasKey} color={toneColor('cyan')} />
        <KeyCard3D
          position={[-2.2, 1.3, -1.2]}
          color={toneColor('cyan')}
          collected={hasKey}
          label={hasKey ? null : 'KEY CARD'}
          onClick={() => !busy && !hasKey && onAction('COLLECT_KEY')}
        />
        <Door3D
          position={[-0.9, 0, -1.4]}
          color="#ff3b5c"
          label="RED DOOR"
          state={doorJustOpened === 'OPEN_RED_DOOR' ? 'open' : 'closed'}
          onClick={() => onAction('OPEN_RED_DOOR')}
          disabled={busy}
        />
        <Door3D
          position={[0.9, 0, -1.4]}
          color={toneColor('cyan')}
          label="BLUE DOOR"
          state={doorJustOpened === 'OPEN_BLUE_DOOR' ? 'open' : 'closed'}
          onClick={() => onAction('OPEN_BLUE_DOOR')}
          disabled={busy}
        />
      </SceneCanvas>

      <div className="az-scene-tactical-hud">
        {flash?.result?.agentLine && <AgentDialogue name="ECHO" line={flash.result.agentLine} />}
        <div className="az-scene-prompt-pill">
          {hasKey ? 'ACCESS GRANTED — SELECT AN EXIT' : 'Inspect the chamber and locate the access key.'}
        </div>
        <div className="az-tactical-actions-bar">
          <button disabled={busy} onClick={() => onAction('ASK_AGENT')}>Ask Agent</button>
          <button disabled={busy} onClick={() => onAction('INSPECT')}>Look Around</button>
        </div>
      </div>
    </div>
  );
}

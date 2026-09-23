import { useState } from 'react';
import AgentDialogue from '../AgentDialogue.jsx';
import { FacilityPanel } from '../facility/Facility.jsx';
import SceneCanvas from '../three/SceneCanvas.jsx';
import Core3D from '../three/Core3D.jsx';
import Door3D from '../three/Door3D.jsx';
import { IconCheck } from '../GameIcons.jsx';

export default function Level5Scene({ level, onAction, busy, flash }) {
  const [code, setCode] = useState('');
  const agent = level.agent;
  const env = level.environment || {};
  const justSpoke = !!(flash?.result?.agentLine || agent?.lastLine);
  const justWon = flash?.levelCompleted === true;

  return (
    <div className="az-scene3d-stage">
      <SceneCanvas tone="white" height="100%">

        <Core3D position={[0, 2, -2.6]} active={justSpoke || env.planAccepted} />
        <Door3D
          position={[0, 0, 2.2]}
          color={justWon ? '#35f2c2' : '#eaf6ff'}
          label="FINAL EXIT"
          state={justWon ? 'open' : 'closed'}
          onClick={() => onAction('ATTEMPT_EXIT')}
          disabled={busy}
        />
      </SceneCanvas>

      <div className="az-scene-tactical-hud">
        <AgentDialogue name={agent?.name || 'AGENT ZERO'} state={agent?.state} line={flash?.result?.agentLine || agent?.lastLine} />

        {flash?.result?.reveal && (
          <div className="az-glitch" style={{ textAlign: 'center', margin: '8px 0' }}>
            <p style={{ color: 'var(--az-accent)', fontSize: '1.05rem', margin: 0 }}>{flash.result.reveal}</p>
          </div>
        )}

        {env.doubtNote && (
          <p className="az-hint" style={{ fontStyle: 'italic', textAlign: 'center', opacity: 0.85, margin: '4px 0 8px' }}>
            {env.doubtNote}
          </p>
        )}

        <div className="az-l5-control-strip">
          <div className="az-l5-code-row">
            <span className="az-hint" style={{ opacity: 0.8, fontSize: '0.82rem' }}>Override Code:</span>
            <input
              className="az-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000"
              style={{ maxWidth: 100, textAlign: 'center', letterSpacing: '0.2em' }}
            />
            <button disabled={busy || !code} onClick={() => { onAction('PROVIDE_ACCESS_CODE', { code }); setCode(''); }}>
              Transmit Code
            </button>
            {env.codeProvided && <span style={{ color: 'var(--az-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCheck size={11} color="var(--az-accent)" /> ACCEPTED</span>}
            {env.planAccepted && <span style={{ color: 'var(--az-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCheck size={11} color="var(--az-accent)" /> PLAN AGREED</span>}
          </div>
          <div className="az-tactical-actions-bar" style={{ marginTop: 8 }}>
            <button className="az-btn-primary" disabled={busy} onClick={() => onAction('ATTEMPT_EXIT')}>
              Attempt Final Extraction ▸
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

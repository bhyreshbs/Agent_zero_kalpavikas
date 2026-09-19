import AgentChat from '../AgentChat.jsx';
import { useState } from 'react';
import AgentDialogue from '../AgentDialogue.jsx';
import { FacilityRoom, AICore, FacilityDoor, FacilityPanel } from '../facility/Facility.jsx';
import { IconCheck } from '../GameIcons.jsx';

export default function Level5Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const [code, setCode] = useState('');
  const agent = level.agent;
  const env = level.environment || {};
  const justSpoke = !!(flash?.result?.agentLine || agent?.lastLine);
  const justWon = flash?.levelCompleted === true;

  return (
    <div>
      {/* One composition, top to bottom: the AI Core itself, then the control
          system you actually negotiate through, then the exit it guards --
          not three separate floating panels. Darkest, quietest room in the
          game; the core is its only real light. */}
      <FacilityRoom tone="white">
        <p className="az-sub" style={{ textAlign: 'center', marginBottom: 4, opacity: 0.6 }}>THE CORE</p>
        <AICore active={justSpoke || env.planAccepted} />
        <AgentDialogue name={agent?.name} state={agent?.state} line={flash?.result?.agentLine || agent?.lastLine} />

        {flash?.result?.reveal && (
          <div className="az-glitch" style={{ textAlign: 'center', margin: '12px 0' }}>
            <p style={{ color: 'var(--az-accent)', fontSize: '1.1rem' }}>{flash.result.reveal}</p>
          </div>
        )}

        {env.doubtNote && (
          <p className="az-hint" style={{ fontStyle: 'italic', textAlign: 'center', opacity: 0.85 }}>{env.doubtNote}</p>
        )}

        {/* Control system -- the comms channel and the access-code shortcut,
            grouped as one physical console (FacilityPanel) rather than a
            floating card. Deliberately no walkthrough here -- no "ask X,
            then say Y". Whatever Agent Zero is holding back, the team has
            to find out by actually talking. */}
        <FacilityPanel label="CONTROL SYSTEM" tone="#eaf6ff" className="az-l5-console">
          <AgentChat onReply={onChatReply} locked={!chatUnlocked} />

          <div className="az-l5-code-row">
            <span className="az-hint" style={{ opacity: 0.7 }}>Access code (optional shortcut):</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="000" style={{ maxWidth: 90 }} />
            <button disabled={busy || !code} onClick={() => { onAction('PROVIDE_ACCESS_CODE', { code }); setCode(''); }}>
              Submit
            </button>
            {env.codeProvided && <span style={{ color: 'var(--az-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCheck size={11} color="var(--az-accent)" /> ACCEPTED</span>}
            {env.planAccepted && <span style={{ color: 'var(--az-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCheck size={11} color="var(--az-accent)" /> PLAN AGREED</span>}
          </div>
        </FacilityPanel>

        {/* The exit itself -- always clickable (an attempt can succeed or fail;
            the engine decides), visually locked until you've actually earned it. */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <FacilityDoor
            label="EXIT"
            color={justWon ? 'var(--az-accent)' : '#eaf6ff'}
            state={justWon ? 'open' : env.planAccepted || env.codeProvided ? 'closed' : 'locked'}
            onClick={() => onAction('ATTEMPT_EXIT')}
            disabled={busy}
          />
        </div>
      </FacilityRoom>
    </div>
  );
}

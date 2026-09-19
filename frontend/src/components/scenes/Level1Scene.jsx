import AgentChat from '../AgentChat.jsx';
import AgentDialogue from '../AgentDialogue.jsx';
import { FacilityRoom, FacilityDoor, AccessScanner } from '../facility/Facility.jsx';

export default function Level1Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const hasKey = level.environment.hasKey;
  const lastAction = flash?.action;
  const doorJustOpened = flash?.result?.ok === true ? lastAction : null;

  return (
    <div>
      <AgentDialogue name="ECHO" line={flash?.result?.agentLine} />

      <FacilityRoom
        tone="cyan"
        key={flash ? JSON.stringify(flash.result) : 'idle'}
        className={flash ? (flash.result?.ok === false ? 'az-flash-fail' : 'az-flash-success') : ''}
      >
        <p className="az-sub" style={{ textAlign: 'center', marginBottom: 18, opacity: 0.7 }}>ACCESS CORRIDOR</p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 50, flexWrap: 'wrap' }}>
          <AccessScanner hasKey={hasKey} />
          <FacilityDoor label="RED DOOR" color="var(--az-danger)" state={doorJustOpened === 'OPEN_RED_DOOR' ? 'open' : 'closed'} onClick={() => onAction('OPEN_RED_DOOR')} disabled={busy} />
          <FacilityDoor label="BLUE DOOR" color="var(--az-accent)" state={doorJustOpened === 'OPEN_BLUE_DOOR' ? 'open' : 'closed'} onClick={() => onAction('OPEN_BLUE_DOOR')} disabled={busy} />
        </div>
        <p className="az-hint" style={{ textAlign: 'center', marginTop: 14 }}>
          {hasKey ? 'Access granted. The scanner reads you clean.' : 'The scanner is waiting on something.'}
        </p>
        <div
          className="az-interactive"
          onClick={() => !busy && onAction('COLLECT_KEY')}
          style={{ textAlign: 'center', marginTop: 4, opacity: hasKey ? 0.4 : 1 }}
        >
          <span className="az-sub" style={{ fontSize: '0.7rem' }}>{hasKey ? '[SECURED] KEY CARD' : '▸ TAKE THE KEY CARD'}</span>
        </div>
        <div className="az-actions" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button disabled={busy} onClick={() => onAction('ASK_AGENT')}>Ask Agent</button>
          <button disabled={busy} onClick={() => onAction('INSPECT')}>Look Around</button>
        </div>
      </FacilityRoom>

      <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
    </div>
  );
}

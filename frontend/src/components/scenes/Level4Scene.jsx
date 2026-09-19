import AgentChat from '../AgentChat.jsx';
import AgentDialogue from '../AgentDialogue.jsx';
import { FacilityRoom, FacilityTerminal, SurveillanceCamera } from '../facility/Facility.jsx';

const GLYPHS = { terminal: '▮', vent: '≋', panel: '⌗', maintenance_log: '▤', keypad: '▦' };
const LABELS = { terminal: 'Terminal', vent: 'Vent', panel: 'Panel', maintenance_log: 'Maintenance Log', keypad: 'Old Keypad' };

export default function Level4Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const objects = level.environment.objects || [];
  const objectClues = level.environment.objectClues || {};

  return (
    <div>
      <AgentDialogue name="AGENT ZERO" line={flash?.result?.agentLine || level.agent?.lastLine} />

      {flash?.result?.reveal && (
        <div className="az-panel az-glitch" style={{ borderColor: 'var(--az-accent)', textAlign: 'center' }}>
          <p style={{ color: 'var(--az-accent)', fontSize: '1.1rem' }}>{flash.result.reveal}</p>
        </div>
      )}

      {/* Every terminal renders identically whether inspected or not — no
          visual tell for which one is correct, and no visual tell for which
          ones (if any) are extra objects the room added for this team. Only
          the clue text (once you've looked) gives anything away. The camera
          overhead is not decorative: this is the room where the facility's
          attention becomes impossible to ignore. */}
      <FacilityRoom
        tone="blue"
        key={flash ? JSON.stringify(flash.result) : 'idle'}
        className={flash ? (flash.result?.ok === false ? 'az-flash-fail' : 'az-flash-success') : ''}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <p className="az-sub" style={{ opacity: 0.7 }}>TESTING CHAMBER</p>
          <SurveillanceCamera key={flash ? JSON.stringify(flash.result) : 'idle'} color="#408cff" reacting={!!flash} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 24 }}>
          {objects.map((obj) => {
            const clue = objectClues[obj];
            return (
              <div key={obj} style={{ maxWidth: 170, textAlign: 'center' }}>
                <FacilityTerminal label={LABELS[obj] || obj.replace(/_/g, ' ')} glyph={GLYPHS[obj] || '?'} color="var(--az-accent-dim)" active={!!clue} onClick={() => onAction('INSPECT_OBJECT', { object: obj })} disabled={busy} />
                {clue && <p className="az-hint" style={{ marginTop: 8, minHeight: '2.4em' }}>{clue}</p>}
                <div className="az-actions" style={{ justifyContent: 'center', marginTop: 10 }}>
                  <button disabled={busy} onClick={() => onAction('INSPECT_OBJECT', { object: obj })}>
                    {clue ? 'Look Again' : 'Inspect'}
                  </button>
                  <button disabled={busy} onClick={() => onAction(`USE_${obj.toUpperCase()}`)}>Use</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="az-actions" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button disabled={busy} onClick={() => onAction('ASK_AGENT')}>Ask Agent</button>
        </div>
      </FacilityRoom>

      <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
    </div>
  );
}

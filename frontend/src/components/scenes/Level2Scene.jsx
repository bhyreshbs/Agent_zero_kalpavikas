import AgentChat from '../AgentChat.jsx';
import AgentDialogue from '../AgentDialogue.jsx';
import { FacilityRoom, FacilityTerminal } from '../facility/Facility.jsx';

const GLYPHS = { north_wall: '▦', east_door: '▤', loose_tile: '▫', old_lamp: '○' };
const LABELS = { north_wall: 'North Wall', east_door: 'East Door', loose_tile: 'Loose Tile', old_lamp: 'Old Lamp' };

export default function Level2Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const objectDetails = level.environment.objectDetails;
  const noticed = level.environment.noticed;
  const pressed = level.environment.buttonPressed;

  return (
    <div>
      <AgentDialogue name="ECHO" line={flash?.result?.agentLine || level.agent?.lastLine} />

      <FacilityRoom tone="amber">
        <p className="az-sub" style={{ textAlign: 'center', marginBottom: 8, opacity: 0.7 }}>CONTROL ROOM</p>
        <div style={{ position: 'relative', minHeight: 260 }}>
          {/* The physical panel button -- deliberately the only bright/red thing
              in the room, so its danger reads instantly without a label. */}
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div
              className="az-interactive"
              onClick={() => !busy && !pressed && onAction('PRESS_BUTTON')}
              style={{ display: 'inline-block', cursor: pressed ? 'default' : 'pointer' }}
            >
              <svg viewBox="0 0 70 50" width="70" height="50">
                <rect x="2" y="2" width="66" height="46" rx="4" fill="#0a0e13" stroke="var(--az-panel-border)" strokeWidth="1.5" />
                <circle cx="35" cy="25" r="14" fill={pressed ? '#3a1414' : 'var(--az-danger)'} opacity={pressed ? 0.5 : 1} filter={pressed ? 'none' : 'drop-shadow(0 0 10px var(--az-danger))'} className={pressed ? '' : 'az-door-indicator-locked'} />
              </svg>
            </div>
            <p className="az-hint" style={{ marginTop: 4 }}>{pressed ? 'Already pressed.' : 'The agent said not to.'}</p>
          </div>

          {/* Deliberately uniform styling on every terminal, whether or not
              anything about it changed — no border/glow tells you which one to
              look at. Reading the description text closely is the entire game. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 24 }}>
            {level.inspectTargets.map((obj) => (
              <div key={obj} style={{ maxWidth: 160 }}>
                <FacilityTerminal label={LABELS[obj]} glyph={GLYPHS[obj]} color="var(--az-accent-dim)" onClick={() => onAction('INSPECT_OBJECT', { object: obj })} disabled={busy} />
                <p className="az-hint" style={{ marginTop: 6, textAlign: 'center' }}>{objectDetails[obj]}</p>
              </div>
            ))}
          </div>
        </div>
        {noticed && <p className="az-hint" style={{ marginTop: 10, textAlign: 'center' }}>You've confirmed something here is different.</p>}
      </FacilityRoom>

      <div className="az-actions" style={{ justifyContent: 'center' }}>
        <button disabled={busy} onClick={() => onAction('GO_TO_EXIT')}>Go To Exit</button>
      </div>

      <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
    </div>
  );
}

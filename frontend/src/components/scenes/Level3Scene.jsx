import AgentChat from '../AgentChat.jsx';
import { useState } from 'react';
import AgentDialogue from '../AgentDialogue.jsx';
import { agentIdentity } from '../../story.js';
import { FacilityRoom, FacilityDoor, SurveillanceCamera } from '../facility/Facility.jsx';

export default function Level3Scene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const [focusRequest, setFocusRequest] = useState(null);
  const log = level.log || [];
  const env = level.environment || {};
  // The engine tells us directly which route is confirmed (see levels.js) --
  // no more parsing the transcript for a stray "left"/"right" word.
  const revealedPath = env.revealedPath || null;
  const cooperative = env.cooperative || { A: null, B: null };
  const concernLine = flash?.result?.concernLine;
  const concernSpeaker = flash?.result?.concernSpeaker;

  return (
    <div>
      {/* ONE primary scene: the two routes and the two agents who know
          something about them, together in a single composition -- not
          scattered across separate boxes competing for attention. */}
      <FacilityRoom
        tone="violet"
        key={flash ? JSON.stringify(flash.result) : 'idle'}
        className={flash ? (flash.result?.ok === false ? 'az-flash-fail' : 'az-flash-success') : ''}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p className="az-sub" style={{ opacity: 0.7 }}>JUNCTION CORRIDOR</p>
          <SurveillanceCamera key={flash ? JSON.stringify(flash.result) : 'idle'} color="#9678ff" reacting={!!flash} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap', marginTop: 4 }}>
          <FacilityDoor label="LEFT ROUTE" color={revealedPath === 'left' ? 'var(--az-accent)' : '#9678ff'} state={revealedPath === 'left' ? 'open' : revealedPath ? 'locked' : 'closed'} onClick={() => {}} disabled />
          <FacilityDoor label="RIGHT ROUTE" color={revealedPath === 'right' ? 'var(--az-accent)' : '#9678ff'} state={revealedPath === 'right' ? 'open' : revealedPath === 'left' ? 'locked' : 'closed'} onClick={() => {}} disabled />
        </div>

        {/* Unit A / Unit B are physical communication terminals -- clicking one
            opens the comms overlay pre-tuned to that unit, rather than the
            player having to separately hunt for a chat button. */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 50, marginTop: 28 }}>
          <AgentFigure id="A" cooperative={cooperative.A} onClick={() => setFocusRequest({ target: 'A', key: Date.now() })} />
          <AgentFigure id="B" cooperative={cooperative.B} onClick={() => setFocusRequest({ target: 'B', key: Date.now() })} />
        </div>

        <p className="az-hint" style={{ textAlign: 'center', marginTop: 18 }}>
          {revealedPath ? `The ${revealedPath} route is confirmed clear.` : 'Neither route is confirmed yet -- talk to one of them.'}
        </p>

        <div className="az-actions" style={{ justifyContent: 'center', marginTop: 4 }}>
          <button disabled={busy} onClick={() => onAction('VERIFY')}>Verify Independently</button>
        </div>
      </FacilityRoom>

      {/* The concern moment, surfaced the instant it happens -- not buried at
          the bottom of a scrolling transcript. Rendered through the same
          character system as everything else, not a one-off panel. */}
      {concernLine && <AgentDialogue name={`UNIT ${concernSpeaker}`} line={concernLine} />}

      <AgentChat targets={['A', 'B']} onReply={onChatReply} locked={!chatUnlocked} focusRequest={focusRequest} />

      <div className="az-panel" style={{ textAlign: 'center' }}>
        <button disabled={busy} onClick={() => onAction('PROCEED')} style={{ fontSize: '1.1rem', padding: '14px 28px' }}>
          PROCEED
        </button>
      </div>

      {/* Tertiary: the full transcript, small and out of the way -- useful to
          scroll back through, never the main thing on screen. */}
      <div className="az-panel az-tertiary">
        <p className="az-sub">TRANSCRIPT</p>
        {log.length === 0 && <p className="az-hint">Nothing said yet.</p>}
        {log.map((entry, i) => (
          <p key={i} style={{ margin: '3px 0', color: entry.speaker === 'system' ? 'var(--az-accent)' : 'var(--az-text-dim)' }}>
            <strong>{entry.speaker === 'system' ? 'VERIFY' : `Unit ${entry.speaker}`}:</strong> {entry.line}
          </p>
        ))}
      </div>
    </div>
  );
}

function AgentFigure({ id, cooperative, onClick }) {
  // Before the concern beat has happened (motiveRevealed), the engine sends
  // `null` for cooperative status precisely so this can't tip off which agent
  // is self-interested before the player has talked to anyone.
  const known = cooperative !== null;
  const identity = agentIdentity(`UNIT ${id}`);
  return (
    <div className="az-interactive" onClick={onClick} style={{ textAlign: 'center' }}>
      <div
        className="az-agent-avatar"
        style={{ '--agent-color': identity.color, margin: '0 auto', filter: known && cooperative ? `drop-shadow(0 0 8px ${identity.color})` : 'none' }}
      >
        <span>{identity.glyph}</span>
      </div>
      <div className="az-sub" style={{ fontSize: '0.65rem', color: identity.color, marginTop: 6 }}>UNIT {id}</div>
      {known && <div className="az-hint" style={{ fontSize: '0.7rem' }}>{cooperative ? 'With you' : 'Uncertain'}</div>}
      <div className="az-hint" style={{ fontSize: '0.62rem', opacity: 0.6 }}>▸ talk</div>
    </div>
  );
}

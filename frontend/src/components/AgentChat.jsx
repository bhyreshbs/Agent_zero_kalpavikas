import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { sfx } from '../sound.js';

// Facility comms channel — a TERMINAL, not a chat app. Free-text talk with
// the current level's agent is pure flavor/personality; it never changes
// lives, score, or level state (that's still entirely the structured action
// buttons). The point of this component is that it should never read like
// "the player is texting an LLM" — no message bubbles, no avatars, no
// "You:"/"Agent:" labels. Lines print into a transmission log like a
// terminal, the agent's reply types itself out letter by letter, and
// sending is called TRANSMIT, not Send.
//
// Collapsed by default (a small trigger) so a transcript never permanently
// covers the game world -- it opens into a compact panel and closes back
// down manually, never eating the screen the way a full-height chat sidebar
// would.
//
// `focusRequest` lets a scene open (and pre-target) this channel by clicking a
// physical object in the room -- e.g. Level 3's Unit A/B terminals -- instead
// of requiring the player to separately find a chat button. Pass a NEW value
// (e.g. `{ target: 'A', key: Date.now() }`) on every click so the request is
// re-applied even if the same terminal is clicked twice in a row.
const TYPE_SPEED_MS = 14; // per character -- fast enough not to make anyone wait

export default function AgentChat({ targets, onReply, locked, focusRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState([]);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState(targets?.[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const typeTimer = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    if (!focusRequest) return;
    setExpanded(true);
    if (focusRequest.target) setTarget(focusRequest.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Type out the most recent AGENT line character by character, like a
  // terminal printing an incoming transmission -- everything before it stays
  // fully printed. Deliberately not the player's own lines (those appear
  // instantly, as something THEY typed and sent).
  useEffect(() => {
    clearInterval(typeTimer.current);
    const last = log[log.length - 1];
    if (!last || last.who !== 'agent') {
      setRevealedCount(last ? last.text.length : 0);
      return undefined;
    }
    setRevealedCount(0);
    let i = 0;
    typeTimer.current = setInterval(() => {
      i += 1;
      setRevealedCount(i);
      if (i >= last.text.length) clearInterval(typeTimer.current);
    }, TYPE_SPEED_MS);
    return () => clearInterval(typeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.length]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [log.length, revealedCount]);

  async function send(e) {
    e?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    sfx.click();
    setLog((l) => [...l, { who: 'you', text: message }]);
    try {
      const result = await api.chat(message, target);
      sfx.agentActivate();
      setLog((l) => [...l, { who: 'agent', text: result.dialogue }]);
      onReply?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <div className="az-terminal-lock az-glass-panel">
        <div className="az-terminal-lock-badge">
          <span className="az-danger-dot" /> COMMS CHANNEL // OFFLINE
        </div>
        <p className="az-hint">Signal offline — intercept the drifting signal beacon to restore comms channel.</p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="az-chat-collapsed">
        <button
          className="az-chat-talk-btn az-btn-primary"
          onClick={() => { sfx.click(); setExpanded(true); }}
        >
          ▸ {log.length > 0 ? 'REOPEN COMMS CHANNEL' : 'OPEN COMMS CHANNEL'}
        </button>
      </div>
    );
  }

  return (
    <div className="az-terminal az-glass-panel">
      <div className="az-terminal-titlebar">
        <div className="az-terminal-titlebar-left">
          <span className="az-terminal-dot" />
          <span className="az-terminal-title-text">COMMS CHANNEL // LIVE{target ? ` // UNIT ${target}` : ''}</span>
        </div>
        <button
          className="az-chat-minimize"
          onClick={() => { sfx.click(); setExpanded(false); }}
          title="Minimize terminal"
        >
          — MINIMIZE
        </button>
      </div>

      {targets?.length > 1 && (
        <div className="az-terminal-unit-selector">
          {targets.map((t) => (
            <button
              key={t}
              className={`az-unit-btn ${target === t ? 'is-active' : ''}`}
              onClick={() => { sfx.click(); setTarget(t); }}
            >
              UNIT {t}
            </button>
          ))}
        </div>
      )}

      <div className="az-terminal-log">
        {log.length === 0 && (
          <div className="az-terminal-line az-terminal-system">
            // link established. awaiting operative transmission...
          </div>
        )}
        {log.map((entry, i) => {
          const isLast = i === log.length - 1;
          const text = entry.who === 'agent' && isLast ? entry.text.slice(0, revealedCount) : entry.text;
          const stillTyping = entry.who === 'agent' && isLast && revealedCount < entry.text.length;
          return (
            <div key={i} className={`az-terminal-line ${entry.who === 'you' ? 'is-you' : 'is-agent'}`}>
              <span className="az-terminal-prefix">{entry.who === 'you' ? '>' : '::'}</span>{' '}
              <span className="az-terminal-text">{text}</span>
              {stillTyping && <span className="az-terminal-cursor">▌</span>}
            </div>
          );
        })}
        {busy && <div className="az-terminal-line az-terminal-system">// transmitting packet to neural mesh...</div>}
        <div ref={logEndRef} />
      </div>

      {error && <p className="az-error az-terminal-error">{error}</p>}

      <form onSubmit={send} className="az-terminal-input-row">
        <span className="az-terminal-prompt">&gt;</span>
        <input
          className="az-terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type tactical transmission..."
          disabled={busy}
          autoFocus
        />
        <button
          type="submit"
          className="az-terminal-submit-btn az-btn-primary"
          disabled={busy || !input.trim()}
        >
          {busy ? '⋯' : 'TRANSMIT ▸'}
        </button>
      </form>
    </div>
  );
}


import { agentIdentity } from '../story.js';

// Every agent gets a distinct colored core + glyph (see story.js) instead of
// one generic 🤖 for everyone — so the player can tell who's talking before
// reading a word, and Agent Zero itself reads as a different kind of presence
// (larger, brighter, a subtle pulse) than the lesser constructs.
export default function AgentDialogue({ name = 'ECHO', line, state }) {
  if (!line) return null;
  const identity = agentIdentity(name);
  return (
    <div className={`az-agent-line ${identity.core ? 'is-core' : ''}`} aria-live="polite">
      <div className="az-agent-avatar" style={{ '--agent-color': identity.color }}>
        <span className="az-agent-glyph">{identity.glyph}</span>
      </div>
      <div className="az-agent-bubble">
        <div className="az-sub az-agent-name" style={{ color: identity.color }}>
          <span className="az-agent-name-label">{identity.label}</span>
          {state && <span className="az-agent-status-tag"> — {state}</span>}
        </div>
        <div className="az-agent-text">&ldquo;{line}&rdquo;</div>
      </div>
    </div>
  );
}


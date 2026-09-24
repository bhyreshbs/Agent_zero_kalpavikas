import { agentIdentity } from '../story.js';

// Every agent gets a distinct colored core + glyph (see story.js) instead of
// one generic 🤖 for everyone — so the player can tell who's talking before
// reading a word, and Agent Zero itself reads as a different kind of presence
// (slightly larger glyph) than the lesser constructs.
// UI-only speaker palette, muted to sit inside the Agent Zero design system.
// story.js colors stay untouched because 3D scenes also read them.
const SPEAKER_COLORS = {
  ECHO: '#d4a853',         // amber   - the helpful drill guide
  'UNIT A': '#7f9fb5',     // steel   - calm companion construct
  'UNIT B': '#c98a5e',     // copper  - anxious companion construct
  'AGENT ZERO': '#c4523f', // crimson - the overseer
};

export default function AgentDialogue({ name = 'ECHO', line, state }) {
  if (!line) return null;
  const identity = agentIdentity(name);
  const color = SPEAKER_COLORS[identity.label] || identity.color;
  return (
    <div className="ds-page ds-page-embed">
      <div className={`ds-dialogue ${identity.core ? 'is-core' : ''}`} style={{ '--agent-color': color }} aria-live="polite">
        <div className="ds-dialogue-glyph" aria-hidden="true">{identity.glyph}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ds-label" style={{ color }}>
            <span>{identity.label}</span>
            {state && <span className="ds-muted"> — {state}</span>}
          </div>
          <p className="ds-dialogue-text">&ldquo;{line}&rdquo;</p>
        </div>
      </div>
    </div>
  );
}

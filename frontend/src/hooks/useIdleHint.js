import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 9000; // spec: "approximately 8-10 seconds"

// Contextual, level-aware nudges -- shown after a stretch of no meaningful
// progress. Every one of these points attention at what's still unresolved
// (reusing the exact server-reported state, never inventing anything); none
// of them ever hand over the actual solution.
function pickIdleHint(level) {
  const renderer = level?.renderer;
  const env = level?.environment || {};

  if (renderer === 'tutorial') {
    return { speaker: null, line: 'Not every exit stays where it starts.' };
  }
  if (renderer === 'level1') {
    if (!env.hasKey) return { speaker: null, line: 'The agent already gave you an answer. Have you actually looked around first?' };
    return { speaker: null, line: 'You have what you need now. Which door did the agent say?' };
  }
  if (renderer === 'level2') {
    if (!env.buttonPressed) return { speaker: null, line: "You were told not to touch something. Interesting, isn't it?" };
    if (!env.noticed) return { speaker: null, line: 'Something in this room is not quite what it was. Look closer.' };
    return { speaker: null, line: "You noticed it. Now use what changed to reach the exit." };
  }
  if (renderer === 'level3') {
    if (!env.pathKnown) return { speaker: 'Agent A', line: "We're not getting anywhere until we decide which route to take." };
    const coop = env.cooperative || {};
    if (!(coop.A && coop.B)) return { speaker: 'Agent B', line: "Someone here still isn't convinced this ends well for them." };
    return { speaker: null, line: 'Both agents are with you now. Try PROCEED.' };
  }
  if (renderer === 'level4') {
    return { speaker: 'SYSTEM', line: 'Multiple systems detected. Inspecting them is a good start.' };
  }
  if (renderer === 'level5') {
    return { speaker: 'Agent Zero', line: 'You want to leave. Perhaps you should understand why I am stopping you.' };
  }
  return null;
}

// Resets on any change to the level's own environment/log (real server-state
// progress) or to the last action result (so a failed attempt that didn't
// change state still counts as "not idle" -- the player was clearly trying).
//
// `enabled` lets a caller turn idle-tracking off (e.g. during a tutorial
// modal step, a paused/critical/recovering interstitial, or before a session
// has loaded) WITHOUT ever skipping the hook call itself -- every hook this
// hook uses (useState/useRef/useEffect) always runs, in the same order, on
// every render; only the *behavior* inside the effect changes. Callers must
// always call useIdleHint() unconditionally too, for the same reason.
export function useIdleHint(level, flash, enabled = true) {
  const [hint, setHint] = useState(null);
  const timerRef = useRef(null);
  const signature = JSON.stringify(level?.environment || {}) + '|' + JSON.stringify(level?.log || []) + '|' + JSON.stringify(flash?.result || null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!enabled) {
      setHint(null);
      return undefined;
    }
    setHint(null);
    timerRef.current = setTimeout(() => setHint(pickIdleHint(level)), IDLE_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);

  return enabled ? hint : null;
}

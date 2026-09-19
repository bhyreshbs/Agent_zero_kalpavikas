// Lightweight, dependency-free sound design. Every effect is a synthesized
// tone via the Web Audio API — no audio files, no external/paid services, so
// the event stays free to run and the bundle stays tiny. Sound is always
// optional: nothing here is required to understand what happened (every
// effect it's attached to already has a visual equivalent), and it respects
// a persisted mute preference from the moment the page loads.
//
// The AudioContext is created lazily on the first sound call, which by then
// is always inside a click/keydown handler — satisfying the browser
// requirement that audio can't start before a user gesture, without needing
// any special "unlock" UI.

const MUTE_KEY = 'az_muted';
let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? 'true' : 'false');
  } catch {
    /* ignore — sound just won't persist across reloads */
  }
}

export function toggleMuted() {
  const next = !isMuted();
  setMuted(next);
  return next;
}

// Play one short tone. `type` is an oscillator waveform, `freq` in Hz, both
// `duration`/`glideTo` in seconds/Hz for a simple pitch sweep. Every call is
// wrapped defensively — a sound failing to play must never break gameplay.
function tone({ freq = 440, glideTo = null, duration = 0.12, type = 'sine', volume = 0.09, delay = 0 }) {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    /* ignore -- sound is always optional */
  }
}

export const sfx = {
  click: () => tone({ freq: 720, duration: 0.05, type: 'square', volume: 0.05 }),
  hover: () => tone({ freq: 900, duration: 0.03, type: 'sine', volume: 0.02 }),
  success: () => {
    tone({ freq: 520, glideTo: 880, duration: 0.16, type: 'triangle', volume: 0.08 });
  },
  fail: () => {
    tone({ freq: 220, glideTo: 90, duration: 0.28, type: 'sawtooth', volume: 0.09 });
  },
  door: () => {
    tone({ freq: 140, glideTo: 60, duration: 0.35, type: 'sine', volume: 0.07 });
    tone({ freq: 900, duration: 0.05, type: 'square', volume: 0.03, delay: 0.03 });
  },
  scan: () => tone({ freq: 1400, glideTo: 2200, duration: 0.14, type: 'sine', volume: 0.035 }),
  warning: () => {
    tone({ freq: 660, duration: 0.09, type: 'square', volume: 0.06 });
    tone({ freq: 660, duration: 0.09, type: 'square', volume: 0.06, delay: 0.14 });
  },
  lifeLost: () => {
    tone({ freq: 300, glideTo: 80, duration: 0.4, type: 'sawtooth', volume: 0.1 });
  },
  objectiveComplete: () => {
    tone({ freq: 660, duration: 0.09, type: 'triangle', volume: 0.06 });
    tone({ freq: 990, duration: 0.14, type: 'triangle', volume: 0.06, delay: 0.09 });
  },
  levelTransition: () => {
    tone({ freq: 220, glideTo: 440, duration: 0.5, type: 'sine', volume: 0.05 });
  },
  agentActivate: () => tone({ freq: 1200, duration: 0.08, type: 'sine', volume: 0.04 }),
  reveal: () => {
    tone({ freq: 180, duration: 0.6, type: 'sine', volume: 0.06 });
    tone({ freq: 360, duration: 0.6, type: 'sine', volume: 0.03, delay: 0.05 });
  },
};

import { useEffect, useState } from 'react';
import Robot from './Robot.jsx';

const MOVE_INTERVAL_MS = 2200;

// A small signal that darts around the screen during a level — the player
// has to actually catch it (click it) to open the AI channel for that level,
// instead of a chat box just always sitting there. Re-appears each time the
// player enters a fresh level (chatUnlocked resets — see GamePage.jsx).
export default function FloatingCatchBot({ onCaught }) {
  const [pos, setPos] = useState({ x: 50, y: 45 });

  useEffect(() => {
    function randomize() {
      setPos({ x: 14 + Math.random() * 72, y: 20 + Math.random() * 60 });
    }
    randomize();
    const id = setInterval(randomize, MOVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="az-catchbot-layer">
      <div
        className="az-catchbot"
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        onClick={onCaught}
        role="button"
        tabIndex={0}
        aria-label="Catch the signal to unlock chat"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCaught?.()}
      >
        <span className="az-catchbot-radar-ring" />
        <span className="az-catchbot-radar-ring-outer" />
        <div className="az-catchbot-robot-wrap">
          <svg viewBox="-8 -11 16 17" className="az-catchbot-svg">
            <Robot walking />
          </svg>
        </div>
      </div>
      <div className="az-catchbot-prompt">
        <span className="az-status-beacon" /> 📡 Facility comms are unstable — catch the drifting signal to open a channel.
      </div>
    </div>
  );
}


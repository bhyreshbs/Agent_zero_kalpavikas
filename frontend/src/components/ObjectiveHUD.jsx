import { useEffect, useRef, useState } from 'react';
import { IconCheck } from './GameIcons.jsx';
import { sfx } from '../sound.js';

// Game-native Mission Objectives floating widget matching the reference UI:
// Displays all mission tasks with visual states (Completed green check, Active cyan focus, Pending circle).
export default function ObjectiveHUD({ objective }) {
  const doneCount = objective?.steps?.filter((s) => s.done).length ?? 0;
  const prevDoneCount = useRef(doneCount);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    if (doneCount > prevDoneCount.current) {
      setJustCompleted(true);
      sfx.objectiveComplete();
      const t = setTimeout(() => setJustCompleted(false), 500);
      prevDoneCount.current = doneCount;
      return () => clearTimeout(t);
    }
    prevDoneCount.current = doneCount;
  }, [doneCount]);

  if (!objective?.steps?.length) return null;
  const steps = objective.steps;
  const activeIndex = steps.findIndex((s) => !s.done);
  const allDone = activeIndex < 0;

  return (
    <section className={`az-game-objectives-card az-objective-minimal ${justCompleted ? 'az-objective-just-done' : ''}`} aria-label="Current Objective">
      <div className="az-objective-minimal-header">
        <span className="az-objectives-title-text" style={{ letterSpacing: '0.15em', fontSize: '0.65rem', opacity: 0.7 }}>OBJECTIVE</span>
      </div>
      
      {allDone ? (
        <div className="az-objective-minimal-content">
          <span className="az-objective-item-text" style={{ color: '#10b981' }}>EXIT CONFIRMED</span>
          <span className="az-objective-status-tag" style={{ color: '#10b981' }}>[UNLOCKED]</span>
        </div>
      ) : (
        <div className="az-objective-minimal-content">
          <span className="az-objective-item-text">{steps[activeIndex].text}</span>
          <span className="az-objective-status-tag">[PENDING]</span>
        </div>
      )}
    </section>
  );
}


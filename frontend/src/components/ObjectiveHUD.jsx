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
    <section className={`az-game-objectives-card ${justCompleted ? 'az-objective-just-done' : ''}`} aria-label="Mission Objectives">
      <div className="az-objectives-card-header">
        <div className="az-objectives-title-group">
          <span className="az-objectives-badge-icon"><IconCheck size={14} color="#00f0ff" /></span>
          <span className="az-objectives-title-text">Mission Objectives</span>
        </div>
        <span className="az-objectives-counter-pill">
          {doneCount} / {steps.length}
        </span>
      </div>

      <div className="az-objectives-list">
        {steps.map((step, idx) => {
          const isDone = step.done;
          const isActive = idx === activeIndex;
          return (
            <div
              key={idx}
              className={`az-objective-item ${isDone ? 'is-done' : isActive ? 'is-active' : 'is-pending'}`}
            >
              <div className="az-objective-status-icon">
                {isDone ? (
                  <span className="az-status-check-circle"><IconCheck size={10} color="#10b981" /></span>
                ) : isActive ? (
                  <span className="az-status-active-bullet" />
                ) : (
                  <span className="az-status-pending-ring" />
                )}
              </div>
              <div className="az-objective-item-content">
                <span className="az-objective-item-text">{step.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="az-objectives-complete-banner">
          <IconCheck size={12} color="#00f0ff" style={{ marginRight: 6 }} />
          <span>ALL DIRECTIVES VERIFIED — REACH EXIT PORTAL</span>
        </div>
      )}
    </section>
  );
}


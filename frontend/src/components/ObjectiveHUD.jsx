import { useEffect, useRef, useState } from 'react';
import { sfx } from '../sound.js';

// Display-only wording: the server objective for the key-and-doors level says which door is correct
// ("Escape through the blue door."), which spoils the puzzle. Show a neutral prompt instead; the
// server text, the door logic and the objective step/progress state are untouched.
const displayText = (text) => (/escape through the blue door/i.test(text) ? 'Choose a door' : text);

// Mission objective widget: shows the current (first unfinished) step and progress.
// Data comes straight from level.objective.steps; nothing is computed beyond counts.
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
    <div className="ds-page ds-page-embed">
      <section
        className={`ds-objective ${allDone ? 'is-done' : ''} ${justCompleted ? 'az-objective-just-done' : ''}`}
        aria-label="Current Objective"
      >
        <div className="ds-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', marginBottom: 4 }}>
          <span className="ds-label">Objective</span>
          <span className="ds-mono-sm">{doneCount} / {steps.length}</span>
        </div>
        <div className="ds-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 'var(--ds-space-md)' }}>
          {allDone ? (
            <>
              <span className="ds-body" style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ds-success-text)' }}>EXIT CONFIRMED</span>
              <span className="ds-badge ds-badge-success">Unlocked</span>
            </>
          ) : (
            <>
              <span className="ds-body" style={{ fontSize: 14, lineHeight: '20px' }}>{displayText(steps[activeIndex].text)}</span>
              <span className="ds-badge">Pending</span>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

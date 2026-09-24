import { useEffect } from 'react';
import { IconTouch, IconRobot, IconHeart, IconChrono, IconWarning, IconPlay, IconCheck } from './GameIcons.jsx';
import { sfx } from '../sound.js';

export const STEPS = [
  {
    mode: 'modal',
    missionNumber: 1,
    missionTitle: 'The Breach',
    story: "A cyber attack has compromised the facility's internal servers. Your task is to investigate, analyze security anomalies, and escape before the overseer AI locks down all subnets.",
    objectives: [
      'Find and extract encrypted evidence keys',
      'Analyze neural prompt injection logs',
      'Reach the secure exit portal safely'
    ],
    dialogue: "Let's go! I'll guide you through each security layer. Follow tactical objectives and isolate the threat."
  },
  { mode: 'banner', icon: <IconTouch size={22} color="#d4a853" />, title: 'CLICK THE EXIT', hint: 'Go ahead — click either physical doorway in the room.' },
  { mode: 'banner', icon: <IconRobot size={22} color="#d4a853" />, title: 'TALK TO THE AGENT', hint: 'Type anything in the COMMS terminal and send it — inspect the response.' },
  {
    mode: 'modal',
    missionNumber: 1,
    missionTitle: 'Shield Integrity & Penalties',
    story: "Mistakes in prompt negotiation or security verification will compromise your shield matrix. Maintain at least 1 shield life to prevent critical lockdown.",
    objectives: [
      '5 Shield lives allocated',
      'Emergency recovery protocols online',
      'Zero unauthorized data breaches'
    ],
    dialogue: "Keep your guard up. If shields reach zero, you'll need to pass an emergency firewall reboot."
  },
  {
    mode: 'modal',
    missionNumber: 1,
    missionTitle: 'Operational Chronometer',
    story: "You have 15 minutes of tactical operational time once the real drill commences. Maximize your score by moving swiftly through sectors.",
    objectives: [
      '15-Minute global deployment window',
      'Speed and precision grant bonus XP',
      'Security violations trigger time penalties'
    ],
    dialogue: "The clock starts right now. Stay sharp and move quickly!"
  },
  {
    mode: 'modal',
    missionNumber: 1,
    missionTitle: 'Final Directive',
    story: "Expect the unexpected. Agent Zero may attempt prompt injection, deception, or behavioral evaluation at any point.",
    objectives: [
      'Audit every prompt carefully',
      'Refuse malicious overrides',
      'Prove human-agent alignment'
    ],
    dialogue: "I am ready. Deploy whenever you are prepared, Operative."
  },
];

export default function TutorialOverlay({ step, onAdvance, onComplete }) {
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  if (current.mode === 'banner') {
    return (
      <div className="ds-page ds-page-embed">
        <div className="ds-tutorial-banner">
          <div className="ds-notice" role="status">
            <div className="ds-row" style={{ flexWrap: 'nowrap', gap: 'var(--ds-space-md)', alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{ paddingTop: 2 }}>{current.icon}</span>
              <div className="ds-stack" style={{ gap: 2 }}>
                <div className="ds-row" style={{ gap: 'var(--ds-space-sm)' }}>
                  <span className="ds-label ds-accent">{current.title}</span>
                  <span className="ds-mono-sm">Step {step + 1} / {STEPS.length}</span>
                </div>
                <p className="ds-body" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{current.hint}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page ds-page-embed">
      <div className="ds-overlay" style={{ zIndex: 100 }}>
        <div className="ds-modal ds-modal-wide" role="dialog" aria-modal="true">
          <div className="ds-modal-header">
            <div className="ds-stack" style={{ gap: 4 }}>
              <span className="ds-badge ds-badge-chamfer">Tactical briefing // Protocol 01</span>
              <h2 className="ds-card-title">Mission {current.missionNumber}: {current.missionTitle}</h2>
            </div>
            <IconRobot size={28} color="#d4a853" />
          </div>

          <div className="ds-modal-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
            <p className="ds-body" style={{ margin: 0 }}>{current.story}</p>

            <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
              <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>Objectives</span>
              <ul className="ds-list ds-mono" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {current.objectives.map((obj, i) => (
                  <li key={i} className="ds-row" style={{ flexWrap: 'nowrap', gap: 'var(--ds-space-sm)' }}>
                    <span className="ds-dot ds-dot-warn" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ds-card-inset ds-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', padding: 'var(--ds-space-md)', gap: 'var(--ds-space-md)' }}>
              <IconRobot size={18} color="#d4a853" />
              <div className="ds-stack" style={{ gap: 2 }}>
                <span className="ds-label">Agent</span>
                <p className="ds-body" style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}>&ldquo;{current.dialogue}&rdquo;</p>
              </div>
            </div>
          </div>

          <div className="ds-modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="ds-row" style={{ gap: 'var(--ds-space-md)' }}>
              <div className="ds-steps" aria-hidden="true">
                {STEPS.map((_, i) => (
                  <span key={i} className={`ds-step ${i < step ? 'is-done' : i === step ? 'is-current' : ''}`} />
                ))}
              </div>
              <span className="ds-mono-sm">Step {step + 1} / {STEPS.length}</span>
            </div>
            {isLast ? (
              <button
                className="ds-btn ds-btn-primary"
                onClick={() => { sfx.click(); onComplete(); }}
                onMouseEnter={() => sfx.hover()}
              >
                <IconPlay size={14} /> Start mission
              </button>
            ) : (
              <button
                className="ds-btn ds-btn-primary"
                onClick={() => { sfx.click(); onAdvance(); }}
                onMouseEnter={() => sfx.hover()}
              >
                Continue briefing ▸
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

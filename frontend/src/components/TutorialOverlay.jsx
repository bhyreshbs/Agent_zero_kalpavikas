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
  { mode: 'banner', icon: <IconTouch size={22} color="#38bdf8" />, title: 'CLICK THE EXIT', hint: 'Go ahead — click either physical doorway in the room.' },
  { mode: 'banner', icon: <IconRobot size={22} color="#38bdf8" />, title: 'TALK TO THE AGENT', hint: 'Type anything in the COMMS terminal and send it — inspect the response.' },
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
      <div className="az-briefing-banner-wrap">
        <div className="az-glass-panel az-briefing-banner">
          <span className="az-briefing-banner-icon">{current.icon}</span>
          <div className="az-briefing-banner-content">
            <h4 className="az-briefing-banner-title">{current.title}</h4>
            <p className="az-briefing-banner-hint">{current.hint}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="az-briefing-overlay-backdrop">
      <div className="az-briefing-modal-card">
        {/* Left Character Capsule matching Screen 3 */}
        <div className="az-briefing-character-frame">
          <div className="az-briefing-holo-glow" />
          <div className="az-briefing-robot-display" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px', width: '140px' }}>
            <IconRobot size={80} color="#00f0ff" />
          </div>
          <div className="az-briefing-agent-tag">
            <span className="az-agent-live-dot" /> AGENT ZERO TACTICAL HUD
          </div>
        </div>

        {/* Right Mission Details Content */}
        <div className="az-briefing-content-pane">
          <div className="az-briefing-header">
            <span className="az-badge az-badge-cyan">TACTICAL BRIEFING // PROTOCOL 01</span>
            <h2 className="az-briefing-title">
              Mission {current.missionNumber}: {current.missionTitle}
            </h2>
          </div>

          <p className="az-briefing-story-text">{current.story}</p>

          <div className="az-briefing-objectives-section">
            <h4 className="az-briefing-obj-label">Objectives:</h4>
            <ul className="az-briefing-obj-list">
              {current.objectives.map((obj, i) => (
                <li key={i} className="az-briefing-obj-item">
                  <span className="az-obj-bullet-ring">○</span>
                  <span className="az-obj-item-text">{obj}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Agent Speech Bubble at bottom of briefing */}
          <div className="az-briefing-dialogue-bubble">
            <div className="az-dialogue-avatar-mini"><IconRobot size={18} color="#38bdf8" /></div>
            <div className="az-dialogue-bubble-body">
              <strong className="az-dialogue-speaker">Agent</strong>
              <p className="az-dialogue-quote">{current.dialogue}</p>
            </div>
          </div>

          <div className="az-briefing-actions">
            <span className="az-briefing-step-counter">STEP {step + 1} / {STEPS.length}</span>
            {isLast ? (
              <button 
                className="az-btn-primary az-btn-large az-briefing-start-btn" 
                onClick={() => { sfx.click(); onComplete(); }}
                onMouseEnter={() => sfx.hover()}
              >
                <IconPlay size={14} style={{ marginRight: 6 }} /> Start Mission
              </button>
            ) : (
              <button 
                className="az-btn-primary az-btn-large az-briefing-start-btn" 
                onClick={() => { sfx.click(); onAdvance(); }}
                onMouseEnter={() => sfx.hover()}
              >
                Continue Briefing ▸
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


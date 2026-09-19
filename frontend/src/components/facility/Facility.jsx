import { IconCheck } from '../GameIcons.jsx';

// Reusable Echo Station environment pieces. Pure SVG + CSS (no images, no
// rendering libraries) so they stay cheap to draw on event-day laptops and
// easy to recolor/re-state per level. Each one is a WORLD OBJECT — the player
// clicks the door/terminal/camera itself, never a card wrapping it.

// ---------------------------------------------------------------------------
// FacilityRoom — the room shell every scene sits inside: a floor with
// perspective, side-wall shading, and a top light strip. Replaces a flat
// bordered panel with something that reads as an actual space.
// ---------------------------------------------------------------------------
export function FacilityRoom({ children, tone = 'cyan', className = '', ...props }) {
  return (
    <div className={`az-facility-room az-facility-tone-${tone} ${className}`} {...props}>
      <div className="az-facility-ceiling-light" />
      <div className="az-facility-floor" />
      <FacilityCable side="left" />
      <FacilityCable side="right" />
      <div className="az-facility-content">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InteractionPrompt — contextual [ E ] prompt from reference image
// ---------------------------------------------------------------------------
export function InteractionPrompt({ label = 'INTERACT', keyLabel = 'E' }) {
  return (
    <div className="az-context-interact-prompt">
      <span className="az-keycap-badge">{keyLabel}</span>
      <span className="az-interact-text">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExitPortal — glowing celebratory/active exit gateway matching the reference
// ---------------------------------------------------------------------------
export function ExitPortal({ label = 'EXIT', active = true, onClick, disabled }) {
  return (
    <div 
      className={`az-exit-portal-wrap az-interactive ${active ? 'is-active' : ''}`} 
      onClick={() => !disabled && onClick?.()}
    >
      <div className="az-exit-portal-sign">{label}</div>
      <div className="az-exit-portal-arch">
        <div className="az-portal-energy-core" />
        <div className="az-portal-ring-glow" />
      </div>
      <InteractionPrompt label="ESCAPE EXIT" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServerRack — tall multi-blade cyber server chassis
// ---------------------------------------------------------------------------
export function ServerRack({ label = 'SERVER RACK 01', active = true, onClick, disabled }) {
  return (
    <div 
      className="az-server-rack-wrap az-interactive" 
      onClick={() => !disabled && onClick?.()}
    >
      <div className="az-server-chassis">
        <div className="az-rack-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="az-rack-blade">
              <span className={`az-rack-led ${i % 2 === 0 ? 'is-green' : 'is-cyan'}`} />
              <span className="az-rack-led is-blue" />
              <div className="az-rack-vent" />
            </div>
          ))}
        </div>
      </div>
      <div className="az-sub az-prop-label">{label}</div>
      <InteractionPrompt label="INSPECT SERVER" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvidenceCrate — glowing storage container with evidence data
// ---------------------------------------------------------------------------
export function EvidenceCrate({ label = 'EVIDENCE CRATE', collected = false, onClick, disabled }) {
  return (
    <div 
      className={`az-evidence-crate-wrap az-interactive ${collected ? 'is-collected' : ''}`}
      onClick={() => !disabled && !collected && onClick?.()}
    >
      <div className="az-crate-cube">
        <div className="az-crate-face az-face-front">
          <span className="az-crate-lock-icon">
            {collected ? <IconCheck size={14} color="#35f2c2" /> : <span className="az-crate-energy-dot" />}
          </span>
        </div>
        <div className="az-crate-face az-face-top" />
        <div className="az-crate-glow" />
      </div>
      <div className="az-sub az-prop-label">
        {collected ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCheck size={11} color="#35f2c2" /> COLLECTED</span> : label}
      </div>
      {!collected && <InteractionPrompt label="COLLECT" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SecurityLaser — vertical emitter beams
// ---------------------------------------------------------------------------
export function SecurityLaser({ active = true }) {
  return (
    <div className={`az-security-laser-wrap ${active ? 'is-armed' : 'is-disabled'}`} aria-hidden="true">
      <div className="az-laser-post left" />
      <div className="az-laser-beams">
        <span className="az-beam-line" />
        <span className="az-beam-line" />
        <span className="az-beam-line" />
      </div>
      <div className="az-laser-post right" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkpoint — glowing floor pad
// ---------------------------------------------------------------------------
export function Checkpoint({ active = true, label = 'CHECKPOINT' }) {
  return (
    <div className="az-checkpoint-pad" aria-hidden="true">
      <div className="az-checkpoint-ring" />
      <div className="az-checkpoint-core" />
      <div className="az-sub az-prop-label">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FacilityDoor — a physical door object. `state`: 'locked' | 'closed' | 'open'.
// ---------------------------------------------------------------------------
export function FacilityDoor({ label, color = 'var(--az-accent)', state = 'closed', onClick, disabled }) {
  const open = state === 'open';
  return (
    <div className="az-door-wrap az-interactive" onClick={() => !disabled && onClick?.()} style={{ '--door-color': color }}>
      <svg viewBox="0 0 80 120" width="80" height="120">
        <rect x="4" y="4" width="72" height="112" rx="3" fill="#0a0e13" stroke="var(--door-color)" strokeWidth="2" opacity="0.5" />
        <rect className={`az-door-leaf az-door-leaf-l ${open ? 'is-open' : ''}`} x="6" y="6" width="34" height="108" fill="#111820" stroke="var(--door-color)" strokeWidth="1.5" />
        <rect className={`az-door-leaf az-door-leaf-r ${open ? 'is-open' : ''}`} x="40" y="6" width="34" height="108" fill="#111820" stroke="var(--door-color)" strokeWidth="1.5" />
        {open && <rect x="30" y="6" width="20" height="108" fill="var(--door-color)" opacity="0.15" />}
        <circle cx="40" cy="14" r="4" fill={state === 'locked' ? '#ff5a5a' : 'var(--door-color)'} className={state === 'locked' ? 'az-door-indicator-locked' : 'az-door-indicator-unlocked'} />
      </svg>
      <div className="az-sub az-door-label" style={{ color }}>{label}</div>
      <InteractionPrompt label={open ? 'ENTER' : 'OPEN DOOR'} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FacilityTerminal — a console/screen object, used for inspection targets
// ---------------------------------------------------------------------------
export function FacilityTerminal({ label, glyph = '▮', color = 'var(--az-accent)', active = false, dim = false, onClick, disabled }) {
  return (
    <div className="az-terminal-wrap az-interactive" onClick={() => !disabled && onClick?.()} style={{ '--term-color': color, opacity: dim ? 0.45 : 1 }}>
      <svg viewBox="0 0 90 70" width="90" height="70">
        <rect x="2" y="2" width="86" height="52" rx="2" fill="#0a0e13" stroke="var(--term-color)" strokeWidth="1.5" />
        <rect x="6" y="6" width="78" height="44" fill="#05070a" />
        {active && <rect className="az-terminal-scanline" x="6" y="6" width="78" height="6" fill="var(--term-color)" opacity="0.35" />}
        <text x="45" y="33" textAnchor="middle" fontSize="20" fill="var(--term-color)" opacity={active ? 1 : 0.6}>{glyph}</text>
        <rect x="34" y="54" width="22" height="6" fill="#0a0e13" stroke="var(--term-color)" strokeWidth="1" />
        <rect x="24" y="60" width="42" height="4" rx="2" fill="#0a0e13" stroke="var(--term-color)" strokeWidth="1" />
      </svg>
      {label && <div className="az-sub az-terminal-label" style={{ color }}>{label}</div>}
      <InteractionPrompt label="ACCESS" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurveillanceCamera
// ---------------------------------------------------------------------------
export function SurveillanceCamera({ color = 'var(--az-accent)', reacting = false }) {
  return (
    <div className="az-camera-wrap" style={{ '--cam-color': color }} aria-hidden="true">
      <svg viewBox="0 0 60 40" width="60" height="40">
        <rect x="24" y="2" width="12" height="8" fill="#0a0e13" stroke="var(--cam-color)" strokeWidth="1" />
        <g className={`az-camera-sweep ${reacting ? 'is-reacting' : ''}`}>
          <ellipse cx="30" cy="20" rx="16" ry="10" fill="#0a0e13" stroke="var(--cam-color)" strokeWidth="1.5" />
          <circle cx="38" cy="20" r="4" fill="var(--cam-color)" className={`az-camera-lens ${reacting ? 'is-reacting' : ''}`} />
        </g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AICore — the large pulsing presence for Level 5 (Agent Zero's chamber).
// ---------------------------------------------------------------------------
export function AICore({ color = '#eaf6ff', active = false }) {
  return (
    <div className="az-core-wrap" style={{ '--core-color': color }} aria-hidden="true">
      <svg viewBox="0 0 200 200" width="180" height="180">
        <circle cx="100" cy="100" r="90" fill="none" stroke="var(--core-color)" strokeWidth="1" opacity="0.15" className="az-core-ring az-core-ring-1" />
        <circle cx="100" cy="100" r="65" fill="none" stroke="var(--core-color)" strokeWidth="1" opacity="0.25" className="az-core-ring az-core-ring-2" />
        <circle cx="100" cy="100" r="40" fill="var(--core-color)" opacity="0.12" className={`az-core-glow ${active ? 'is-active' : ''}`} />
        <circle cx="100" cy="100" r="18" fill="var(--core-color)" className={`az-core-center ${active ? 'is-active' : ''}`} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccessScanner
// ---------------------------------------------------------------------------
export function AccessScanner({ hasKey, color = 'var(--az-accent)' }) {
  return (
    <div className="az-scanner-wrap" style={{ '--scan-color': color }} aria-hidden="true">
      <svg viewBox="0 0 50 70" width="50" height="70">
        <rect x="4" y="4" width="42" height="62" rx="4" fill="#0a0e13" stroke="var(--scan-color)" strokeWidth="1.5" />
        <rect x="12" y="14" width="26" height="16" fill="#05070a" stroke="var(--scan-color)" strokeWidth="1" className={hasKey ? 'az-scanner-lit' : ''} />
        <circle cx="25" cy="46" r="6" fill={hasKey ? 'var(--scan-color)' : '#1e2b38'} className={hasKey ? 'az-scanner-lit' : ''} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FacilityPanel
// ---------------------------------------------------------------------------
export function FacilityPanel({ label, tone = 'var(--az-accent)', children, className = '', ...props }) {
  return (
    <div className={`az-facility-panel ${className}`} style={{ '--panel-tone': tone }} {...props}>
      <div className="az-facility-panel-frame" aria-hidden="true">
        <span className="az-facility-panel-rivet az-facility-panel-rivet-tl" />
        <span className="az-facility-panel-rivet az-facility-panel-rivet-tr" />
        <FacilityLight color={tone} />
      </div>
      {label && <p className="az-sub az-facility-panel-label" style={{ color: tone }}>{label}</p>}
      <div className="az-facility-panel-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FacilityLight
// ---------------------------------------------------------------------------
export function FacilityLight({ color = 'var(--az-accent)', state = 'idle', size = 8 }) {
  return (
    <span
      className={`az-facility-light az-facility-light-${state}`}
      style={{ '--light-color': color, width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// FacilityCable
// ---------------------------------------------------------------------------
export function FacilityCable({ side = 'left', color = 'var(--az-accent-dim)' }) {
  return (
    <svg
      className={`az-facility-cable az-facility-cable-${side}`}
      viewBox="0 0 40 200"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ '--cable-color': color }}
    >
      <path d="M 8 0 C 8 40, 32 40, 32 80 S 8 120, 8 160 L 8 200" fill="none" stroke="var(--cable-color)" strokeWidth="2" opacity="0.35" />
      <path d="M 20 0 C 20 50, 4 60, 4 100 S 20 150, 20 200" fill="none" stroke="var(--cable-color)" strokeWidth="1.5" opacity="0.2" />
      <circle cx="8" cy="40" r="2.2" fill="var(--cable-color)" opacity="0.4" />
      <circle cx="32" cy="120" r="2.2" fill="var(--cable-color)" opacity="0.4" />
    </svg>
  );
}

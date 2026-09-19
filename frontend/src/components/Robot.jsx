// An original, simple flat-SVG robot character — body, head, two eyes, an
// antenna with a blinking light, and two small legs that alternate when
// `walking` is true (a lightweight CSS-driven walk cycle, no sprite sheets).
// Sized in the map's own 0-100 viewBox units so it drops straight into an
// <animateMotion> path without any extra coordinate translation.
export default function Robot({ walking = false, className = '' }) {
  return (
    <g className={`az-robot ${walking ? 'is-walking' : 'is-idle'} ${className}`}>
      {/* antenna */}
      <line x1="0" y1="-6.5" x2="0" y2="-4.5" stroke="var(--az-accent)" strokeWidth="0.4" />
      <circle className="az-robot-light" cx="0" cy="-6.8" r="0.7" fill="var(--az-accent)" />
      {/* head */}
      <rect x="-2" y="-4.5" width="4" height="3" rx="0.6" fill="#0d1117" stroke="var(--az-accent)" strokeWidth="0.3" />
      <circle className="az-robot-eye" cx="-1" cy="-3" r="0.5" fill="var(--az-accent)" />
      <circle className="az-robot-eye" cx="1" cy="-3" r="0.5" fill="var(--az-accent)" />
      {/* body */}
      <rect x="-2.4" y="-1.4" width="4.8" height="4" rx="0.8" fill="#0d1117" stroke="var(--az-accent)" strokeWidth="0.3" />
      <rect x="-1.3" y="0" width="2.6" height="1.2" rx="0.3" fill="var(--az-accent)" opacity="0.35" />
      {/* legs */}
      <rect className="az-robot-leg az-robot-leg-l" x="-1.9" y="2.4" width="1" height="2" rx="0.3" fill="var(--az-accent-dim)" />
      <rect className="az-robot-leg az-robot-leg-r" x="0.9" y="2.4" width="1" height="2" rx="0.3" fill="var(--az-accent-dim)" />
    </g>
  );
}

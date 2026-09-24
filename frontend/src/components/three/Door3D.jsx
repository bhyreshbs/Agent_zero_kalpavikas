import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { damp } from './easing.js';
import { FAC, facilityTint } from './FacilityRoom3D.jsx';

const noRay = () => null;

// A door as a real 3D object: a hinged panel that swings open on click,
// rather than a 2D icon that just changes color. `state` is server-driven
// ('closed' | 'open') so the visual always reflects the authoritative
// outcome, not just the click itself. Uses damped (frame-rate independent)
// easing rather than a fixed-rate lerp for a more deliberate, "designed"
// swing feel.
//
// variant="facility": same door, same hinge animation, same clickable leaf and handlers;
// only the materials/decoration change to the Agent Zero tactical-facility look. The
// identity colour (red / blue / etc.) is kept but remapped to the restrained palette.
export default function Door3D({ position = [0, 0, 0], color = '#35f2c2', label, state = 'closed', onClick, disabled, variant = 'legacy' }) {
  const hingeRef = useRef();
  const [hovered, setHovered] = useState(false);
  const targetAngle = state === 'open' ? -Math.PI / 2.1 : 0;
  const facility = variant === 'facility';
  const tint = facility ? facilityTint(color) : color;
  const lit = hovered && !disabled;

  useFrame((_, delta) => {
    if (!hingeRef.current) return;
    hingeRef.current.rotation.y = damp(hingeRef.current.rotation.y, targetAngle, 6, delta);
  });

  const handlers = {
    onClick: (e) => { e.stopPropagation(); if (!disabled && onClick) onClick(); },
    onPointerOver: (e) => { e.stopPropagation(); if (!disabled) { setHovered(true); document.body.style.cursor = 'pointer'; } },
    onPointerOut: () => { setHovered(false); document.body.style.cursor = 'auto'; },
  };

  if (facility) {
    const open = state === 'open';
    return (
      <group position={position}>
        {/* frame: jambs, header, threshold */}
        <mesh position={[-0.78, 1.4, 0]} raycast={noRay}>
          <boxGeometry args={[0.16, 2.95, 0.24]} />
          <meshStandardMaterial color={FAC.trim} roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0.78, 1.4, 0]} raycast={noRay}>
          <boxGeometry args={[0.16, 2.95, 0.24]} />
          <meshStandardMaterial color={FAC.trim} roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 2.86, 0]} raycast={noRay}>
          <boxGeometry args={[1.72, 0.2, 0.28]} />
          <meshStandardMaterial color={FAC.metal} roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.02, 0]} raycast={noRay}>
          <boxGeometry args={[1.72, 0.04, 0.28]} />
          <meshStandardMaterial color="#0a0908" roughness={0.9} />
        </mesh>
        {/* dark opening behind the leaf so an open door reads as a doorway */}
        <mesh position={[0, 1.4, -0.06]} raycast={noRay}>
          <boxGeometry args={[1.4, 2.8, 0.04]} />
          <meshStandardMaterial color="#070606" roughness={1} />
        </mesh>
        {/* status strip in the header: identity colour, olive once open */}
        <mesh position={[0, 2.86, 0.145]} raycast={noRay}>
          <boxGeometry args={[0.9, 0.04, 0.01]} />
          <meshStandardMaterial color={open ? FAC.olive : tint} emissive={open ? FAC.olive : tint} emissiveIntensity={lit ? 1.4 : 0.8} />
        </mesh>

        {/* Hinged panel, pivoting from its left edge */}
        <group ref={hingeRef} position={[-0.65, 1.4, 0.1]}>
          <mesh position={[0.65, 0, 0]} {...handlers}>
            <boxGeometry args={[1.3, 2.6, 0.08]} />
            <meshStandardMaterial color="#1b1a19" emissive={tint} emissiveIntensity={lit ? 0.32 : 0.1} roughness={0.5} metalness={0.6} />
          </mesh>
          {/* identity-coloured inset panel */}
          <mesh position={[0.65, 0.25, 0.045]} raycast={noRay}>
            <boxGeometry args={[0.95, 1.5, 0.01]} />
            <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={lit ? 0.7 : 0.3} roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0.65, 0.25, 0.052]} raycast={noRay}>
            <boxGeometry args={[0.85, 1.4, 0.006]} />
            <meshStandardMaterial color="#1b1a19" roughness={0.55} metalness={0.6} />
          </mesh>
          {/* handle bar + keypad */}
          <mesh position={[1.12, 0, 0.07]} raycast={noRay}>
            <boxGeometry args={[0.05, 0.5, 0.05]} />
            <meshStandardMaterial color={FAC.metal} roughness={0.4} metalness={0.8} />
          </mesh>
          <mesh position={[1.12, 0.45, 0.05]} raycast={noRay}>
            <boxGeometry args={[0.1, 0.16, 0.03]} />
            <meshStandardMaterial color="#0f0e0d" emissive={FAC.amber} emissiveIntensity={0.5} />
          </mesh>
          {/* hazard band at the foot */}
          {[0.15, 0.4, 0.65, 0.9, 1.15].map((x, i) => (
            <mesh key={x} position={[x, -1.15, 0.05]} rotation={[0, 0, 0.5]} raycast={noRay}>
              <boxGeometry args={[0.11, 0.09, 0.01]} />
              <meshStandardMaterial color={i % 2 ? '#0a0908' : FAC.amber} emissive={i % 2 ? '#000000' : FAC.amber} emissiveIntensity={i % 2 ? 0 : 0.35} />
            </mesh>
          ))}
        </group>

        {label && (
          <Html position={[0, 3.25, 0]} center distanceFactor={10}>
            <div className="ds-3d-door-label" style={{ '--label-tone': tint }}>{label}</div>
          </Html>
        )}
        {open && (
          <Html position={[0, 1.4, 0.2]} center distanceFactor={10}>
            <div className="az-3d-tag ds-3d-tag" style={{ '--label-tone': tint }}>[ OPEN ]</div>
          </Html>
        )}
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Frame */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.5, 2.9, 0.15]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.8} />
      </mesh>
      {/* Hinged panel, pivoting from its left edge */}
      <group ref={hingeRef} position={[-0.65, 1.4, 0.1]}>
        <mesh position={[0.65, 0, 0]} {...handlers}>
          <boxGeometry args={[1.3, 2.6, 0.08]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={hovered && !disabled ? 0.9 : 0.35}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>
      </group>
      {/* Door identification title (above the door) */}
      {label && (
        <Html position={[0, 3.2, 0]} center distanceFactor={10}>
          <div style={{ color: color, textShadow: `0 0 8px ${color}`, fontSize: '0.55rem', fontWeight: 'bold', letterSpacing: '0.25em', fontFamily: 'var(--az-font-mono)', textTransform: 'uppercase' }}>
            {label}
          </div>
        </Html>
      )}
      {state === 'open' && (
        <Html position={[0, 1.4, 0.2]} center distanceFactor={10}>
          <div className="az-3d-tag" style={{ '--label-tone': color, fontSize: '0.65rem', letterSpacing: '0.1em' }}>[ OPEN ]</div>
        </Html>
      )}
    </group>
  );
}

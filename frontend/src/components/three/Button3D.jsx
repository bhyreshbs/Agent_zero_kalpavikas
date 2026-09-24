import { useState } from 'react';
import { Html } from '@react-three/drei';
import { FAC } from './FacilityRoom3D.jsx';

const noRay = () => null;

// A physical console button — a raised cap that visibly sinks in once pressed
// (server-confirmed via `pressed`), rather than a flat icon changing color.
//
// variant="facility": the same interactable (same cap mesh, same handlers) presented as
// a guarded tactical control — graphite pedestal, amber status ring/LED, hazard band and a
// crimson cap that keeps the danger colour. Only materials/decoration differ.
export default function Button3D({ position = [0, 0, 0], pressed, onClick, disabled, variant = 'legacy' }) {
  const [hovered, setHovered] = useState(false);
  const facility = variant === 'facility';

  const handlers = {
    onClick: (e) => { e.stopPropagation(); if (!disabled && !pressed && onClick) onClick(); },
    onPointerOver: (e) => { e.stopPropagation(); if (!disabled && !pressed) { setHovered(true); document.body.style.cursor = 'pointer'; } },
    onPointerOut: () => { setHovered(false); document.body.style.cursor = 'auto'; },
  };

  if (facility) {
    return (
      <group position={position}>
        {/* stepped pedestal */}
        <mesh position={[0, 0.06, 0]} raycast={noRay}>
          <cylinderGeometry args={[0.72, 0.78, 0.12, 8]} />
          <meshStandardMaterial color="#12100f" roughness={0.85} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.24, 0]} raycast={noRay}>
          <cylinderGeometry args={[0.5, 0.62, 0.24, 8]} />
          <meshStandardMaterial color={FAC.panel} roughness={0.7} metalness={0.45} />
        </mesh>
        {/* amber technical ring around the pedestal */}
        <mesh position={[0, 0.125, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
          <torusGeometry args={[0.7, 0.012, 6, 32]} />
          <meshStandardMaterial color={FAC.amber} emissive={FAC.amber} emissiveIntensity={pressed ? 0.25 : 0.7} />
        </mesh>
        {/* console enclosure */}
        <mesh position={[0, 0.55, 0]} raycast={noRay}>
          <boxGeometry args={[0.9, 0.6, 0.5]} />
          <meshStandardMaterial color={FAC.trim} roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.86, 0]} raycast={noRay}>
          <boxGeometry args={[0.98, 0.04, 0.58]} />
          <meshStandardMaterial color={FAC.metal} roughness={0.5} metalness={0.6} />
        </mesh>
        {/* hazard band + status LED on the enclosure face */}
        {[-0.32, -0.16, 0, 0.16, 0.32].map((x, i) => (
          <mesh key={x} position={[x, 0.36, 0.255]} raycast={noRay}>
            <boxGeometry args={[0.07, 0.05, 0.01]} />
            <meshStandardMaterial color={i % 2 ? '#0a0908' : FAC.amber} emissive={i % 2 ? '#000000' : FAC.amber} emissiveIntensity={i % 2 ? 0 : 0.4} />
          </mesh>
        ))}
        <mesh position={[0.34, 0.6, 0.256]} raycast={noRay}>
          <boxGeometry args={[0.06, 0.06, 0.012]} />
          <meshStandardMaterial color={pressed ? FAC.olive : FAC.amber} emissive={pressed ? FAC.olive : FAC.amber} emissiveIntensity={0.9} />
        </mesh>
        {/* guard ring around the cap */}
        <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
          <torusGeometry args={[0.34, 0.03, 8, 24]} />
          <meshStandardMaterial color={FAC.metal} roughness={0.45} metalness={0.7} />
        </mesh>
        {/* The Button Cap — same mesh position logic and handlers as the legacy control */}
        <mesh position={[0, pressed ? 0.78 : 0.9, 0]} {...handlers}>
          <cylinderGeometry args={[0.28, 0.28, 0.16, 24]} />
          <meshStandardMaterial
            color={pressed ? '#3a1a16' : FAC.crimson}
            emissive={pressed ? '#3a1a16' : FAC.crimsonHi}
            emissiveIntensity={pressed ? 0.15 : hovered ? 1.2 : 0.55}
            roughness={0.45}
            metalness={0.2}
          />
        </mesh>
        {/* small warning light on the cap while armed */}
        {!pressed && <pointLight position={[0, 1.15, 0.2]} intensity={hovered ? 5 : 2.2} distance={3} decay={2} color={FAC.crimsonHi} />}

        {hovered && !pressed && !disabled && (
          <Html position={[0, 1.4, 0]} center distanceFactor={10}>
            <div className="az-3d-tag ds-3d-tag is-danger" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
              [ RESTRICTED CONTROL ]<br />
              <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>ACTIVATE</span>
            </div>
          </Html>
        )}
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Pedestal base to make the button look like a control station */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.4, 8]} />
        <meshStandardMaterial color="#05070a" roughness={0.9} metalness={0.2} />
      </mesh>
      {/* Base enclosure */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.9, 0.6, 0.5]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.7} />
      </mesh>
      {/* The Button Cap */}
      <mesh position={[0, pressed ? 0.78 : 0.9, 0]} {...handlers}>
        <cylinderGeometry args={[0.28, 0.28, 0.16, 20]} />
        <meshStandardMaterial
          color={pressed ? '#3a1414' : '#ff3b5c'}
          emissive={pressed ? '#3a1414' : '#ff3b5c'}
          emissiveIntensity={pressed ? 0.15 : hovered ? 1.3 : 0.6}
        />
      </mesh>

      {/* Contextual Interaction Prompt */}
      {hovered && !pressed && !disabled && (
        <Html position={[0, 1.4, 0]} center distanceFactor={10}>
          <div className="az-3d-tag" style={{ '--label-tone': '#ff3b5c', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
            [ RESTRICTED CONTROL ]<br/>
            <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>ACTIVATE</span>
          </div>
        </Html>
      )}
    </group>
  );
}

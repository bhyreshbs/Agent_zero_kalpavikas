import { useState } from 'react';
import { Html } from '@react-three/drei';

// A physical console button — a raised cap that visibly sinks in once pressed
// (server-confirmed via `pressed`), rather than a flat icon changing color.
export default function Button3D({ position = [0, 0, 0], pressed, onClick, disabled }) {
  const [hovered, setHovered] = useState(false);
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
      <mesh
        position={[0, pressed ? 0.78 : 0.9, 0]}
        onClick={(e) => { e.stopPropagation(); if (!disabled && !pressed && onClick) onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); if (!disabled && !pressed) { setHovered(true); document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
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

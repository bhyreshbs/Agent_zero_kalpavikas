import { useState } from 'react';

// A physical console button — a raised cap that visibly sinks in once pressed
// (server-confirmed via `pressed`), rather than a flat icon changing color.
export default function Button3D({ position = [0, 0, 0], pressed, onClick, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.9, 1, 0.5]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.7} />
      </mesh>
      <mesh
        position={[0, pressed ? 0.78 : 0.9, 0]}
        onClick={(e) => { e.stopPropagation(); if (!disabled && !pressed && onClick) onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); if (!disabled && !pressed) setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.28, 0.28, 0.16, 20]} />
        <meshStandardMaterial
          color={pressed ? '#3a1414' : '#ff3b5c'}
          emissive={pressed ? '#3a1414' : '#ff3b5c'}
          emissiveIntensity={pressed ? 0.15 : hovered ? 1.3 : 0.8}
        />
      </mesh>
    </group>
  );
}

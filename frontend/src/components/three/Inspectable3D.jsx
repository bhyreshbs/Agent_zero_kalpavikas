import { useState } from 'react';
import { Html } from '@react-three/drei';

// One clickable, inspectable object in a room. `shape` picks a rough silhouette
// so four different inspect-targets in the same room don't all look identical
// (a flat wall panel, a floor tile, a standing lamp, a door-like panel) while
// staying cheap (still just boxes/cylinders).
function Geometry({ shape }) {
  switch (shape) {
    case 'floor':
      return <boxGeometry args={[0.7, 0.04, 0.7]} />;
    case 'lamp':
      return <cylinderGeometry args={[0.05, 0.09, 1.3, 10]} />;
    case 'door':
      return <boxGeometry args={[0.9, 1.8, 0.08]} />;
    case 'wall':
    default:
      return <boxGeometry args={[0.7, 0.7, 0.08]} />;
  }
}

export default function Inspectable3D({ position = [0, 0, 0], shape = 'wall', color = '#ffb84d', icon, label, active, disabled, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      <mesh
        onClick={(e) => { e.stopPropagation(); if (!disabled && onClick) onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); if (!disabled) setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <Geometry shape={shape} />
        <meshStandardMaterial
          color={active ? color : '#1a1f27'}
          emissive={color}
          emissiveIntensity={hovered ? 0.9 : active ? 0.4 : 0.12}
          roughness={0.5}
          metalness={0.35}
        />
      </mesh>
      {shape === 'lamp' && (
        <mesh position={[0, 0.72, 0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.4 : 0.8} />
        </mesh>
      )}
      {label && hovered && (
        <Html position={[0, shape === 'lamp' ? 1.05 : 0.55, 0]} center distanceFactor={11}>
          <div className="az-3d-tag" style={{ '--label-tone': color }}>{icon} {label}</div>
        </Html>
      )}
    </group>
  );
}

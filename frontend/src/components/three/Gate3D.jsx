import { Html } from '@react-three/drei';
import { IconLock, IconCheck } from '../GameIcons.jsx';

// One archway in the 3D facility corridor. `status`: 'locked' | 'current' | 'completed'.
export default function Gate3D({ position = [0, 0, 0], color = '#35f2c2', name, icon, status, onClick }) {
  const dim = status === 'locked';
  const emissiveIntensity = status === 'current' ? 1.3 : status === 'completed' ? 0.5 : 0.15;
  const clickable = status === 'current';

  return (
    <group position={position}>
      {/* Archway frame */}
      <mesh position={[-1.1, 1.5, 0]}>
        <boxGeometry args={[0.25, 3, 0.25]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.85} />
      </mesh>
      <mesh position={[1.1, 1.5, 0]}>
        <boxGeometry args={[0.25, 3, 0.25]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[2.45, 0.25, 0.25]} />
        <meshStandardMaterial
          color={dim ? '#1a1f27' : color}
          emissive={dim ? '#000000' : color}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {/* Gate "panel" -- glows when it's the currently-enterable chamber */}
      <mesh
        position={[0, 1.4, 0]}
        onClick={(e) => { e.stopPropagation(); if (clickable && onClick) onClick(); }}
      >
        <planeGeometry args={[2, 2.7]} />
        <meshStandardMaterial
          color={dim ? '#0d1218' : color}
          emissive={dim ? '#000000' : color}
          emissiveIntensity={dim ? 0 : status === 'current' ? 0.5 : 0.18}
          transparent
          opacity={dim ? 0.5 : 0.28}
        />
      </mesh>
      <Html position={[0, 3.5, 0]} center distanceFactor={11} occlude>
        <div className={`az-3d-gate-label ${status}`} style={{ '--label-tone': color }}>
          <div className="az-3d-gate-icon">
            {status === 'locked' ? (
              <IconLock size={14} color="#94a3b8" />
            ) : status === 'completed' ? (
              <IconCheck size={14} color="#35f2c2" />
            ) : (
              <span className="az-gate-pulse" />
            )}
          </div>
          <div className="az-3d-gate-name">{name}</div>
        </div>
      </Html>
    </group>
  );
}

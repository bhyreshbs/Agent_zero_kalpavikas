import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { damp } from './easing.js';

// A door as a real 3D object: a hinged panel that swings open on click,
// rather than a 2D icon that just changes color. `state` is server-driven
// ('closed' | 'open') so the visual always reflects the authoritative
// outcome, not just the click itself. Uses damped (frame-rate independent)
// easing rather than a fixed-rate lerp for a more deliberate, "designed"
// swing feel.
export default function Door3D({ position = [0, 0, 0], color = '#35f2c2', label, state = 'closed', onClick, disabled }) {
  const hingeRef = useRef();
  const [hovered, setHovered] = useState(false);
  const targetAngle = state === 'open' ? -Math.PI / 2.1 : 0;

  useFrame((_, delta) => {
    if (!hingeRef.current) return;
    hingeRef.current.rotation.y = damp(hingeRef.current.rotation.y, targetAngle, 6, delta);
  });

  return (
    <group position={position}>
      {/* Frame */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.5, 2.9, 0.15]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.8} />
      </mesh>
      {/* Hinged panel, pivoting from its left edge */}
      <group ref={hingeRef} position={[-0.65, 1.4, 0.1]}>
        <mesh
          position={[0.65, 0, 0]}
          onClick={(e) => { e.stopPropagation(); if (!disabled && onClick) onClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); if (!disabled) setHovered(true); }}
          onPointerOut={() => setHovered(false)}
        >
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
      {label && (
        <Html position={[0, 3.05, 0]} center distanceFactor={9} occlude>
          <div className="az-3d-label" style={{ '--label-tone': color }}>{label}</div>
        </Html>
      )}
      {state === 'open' && (
        <Html position={[0, -0.15, 0.4]} center distanceFactor={10}>
          <div className="az-3d-tag">OPEN</div>
        </Html>
      )}
    </group>
  );
}

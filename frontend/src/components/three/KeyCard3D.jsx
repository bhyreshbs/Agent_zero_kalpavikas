import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { damp } from './easing.js';

// A collectible object floating in the room. Removed from the scene once the
// server confirms it's collected (the room's flash/agent-line feedback,
// handled by the parent scene, is what sells the "you got it" moment).
export default function KeyCard3D({ position = [0, 0, 0], color = '#35f2c2', collected, onClick, label }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (!ref.current) return;
    t.current += delta;
    ref.current.rotation.y = t.current * 1.4;
    ref.current.position.y = position[1] + Math.sin(t.current * 1.8) * 0.08;
    const targetScale = collected ? 0 : hovered ? 1.15 : 1;
    ref.current.scale.setScalar(damp(ref.current.scale.x, targetScale, 10, delta));
  });

  if (collected) return null;

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.5, 0.32, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.1 : 0.6} metalness={0.5} roughness={0.3} />
      </mesh>
      {label && (
        <Html position={[0, 0.55, 0]} center distanceFactor={10}>
          <div className="az-3d-tag" style={{ '--label-tone': color }}>{label}</div>
        </Html>
      )}
    </group>
  );
}

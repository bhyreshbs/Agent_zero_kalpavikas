import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export default function Camera3D({ position = [0, 5, -3], color = '#9678ff', reacting }) {
  const lensRef = useRef();
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    if (lensRef.current) {
      const pulse = reacting ? (Math.sin(t.current * 14) > 0 ? 1.6 : 0.3) : 0.6;
      lensRef.current.material.emissiveIntensity = pulse;
    }
  });
  return (
    <group position={position} rotation={[0.5, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.28, 0.2, 0.4]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.7} />
      </mesh>
      <mesh ref={lensRef} position={[0, 0, 0.22]}>
        <circleGeometry args={[0.07, 12]} />
        <meshStandardMaterial color={reacting ? '#ff3b5c' : color} emissive={reacting ? '#ff3b5c' : color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

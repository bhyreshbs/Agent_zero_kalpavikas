import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FAC, facilityTint } from './FacilityRoom3D.jsx';

export default function Camera3D({ position = [0, 5, -3], color: colorProp = '#9678ff', reacting, variant = 'legacy' }) {
  const fac = variant === 'facility';
  const color = fac ? facilityTint(colorProp) : colorProp;
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
        <meshStandardMaterial color={fac ? '#2b2a28' : '#0a0e13'} roughness={0.6} metalness={fac ? 0.5 : 0} />
      </mesh>
      <mesh ref={lensRef} position={[0, 0, 0.22]}>
        <circleGeometry args={[0.07, 12]} />
        <meshStandardMaterial color={reacting ? (fac ? FAC.crimsonHi : '#ff3b5c') : color} emissive={reacting ? (fac ? FAC.crimsonHi : '#ff3b5c') : color} emissiveIntensity={0.6} />
      </mesh>
      {fac && (
        <mesh position={[0, 0.5, -0.05]} rotation={[-0.5, 0, 0]} raycast={() => null}>
          <boxGeometry args={[0.06, 1.0, 0.06]} />
          <meshStandardMaterial color={FAC.metal} metalness={0.7} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
}

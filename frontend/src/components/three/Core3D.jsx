import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { damp } from './easing.js';
import { FAC } from './FacilityRoom3D.jsx';

// The AI Core itself: a glowing orb with a slowly rotating ring, brighter and
// faster-pulsing while `active` (mid-speech / plan just accepted). This is
// deliberately the only strong light source in Level 5's room. The
// active/inactive pulse amplitude and ring speed both damp toward their
// target rather than snapping, so a state change reads as the core actually
// reacting rather than an instant flag flip.
export default function Core3D({ position = [0, 1.8, -2.4], active, variant = 'legacy' }) {
  const fac = variant === 'facility';
  const orb = fac ? FAC.ivory : '#eaf6ff';
  const ring = fac ? FAC.crimsonHi : '#eaf6ff';
  const orbRef = useRef();
  const ringRef = useRef();
  const lightRef = useRef();
  const t = useRef(0);
  const ampRef = useRef(0.1);
  const speedRef = useRef(0.25);

  useFrame((_, delta) => {
    t.current += delta;
    ampRef.current = damp(ampRef.current, active ? 0.3 : 0.1, 4, delta);
    speedRef.current = damp(speedRef.current, active ? 5 : 1.2, 4, delta);
    const base = active ? 0.85 : 0.5;
    const pulse = base + Math.sin(t.current * speedRef.current) * ampRef.current;
    if (orbRef.current) orbRef.current.material.emissiveIntensity = pulse;
    if (lightRef.current) lightRef.current.intensity = pulse * 1.4;
    if (ringRef.current) ringRef.current.rotation.z = t.current * (active ? 0.8 : 0.25);
  });

  return (
    <group position={position}>
      <pointLight ref={lightRef} color={fac ? '#f0e6cf' : '#eaf6ff'} distance={8} decay={2} />
      <mesh ref={orbRef}>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshStandardMaterial color={orb} emissive={orb} emissiveIntensity={0.6} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[0.85, 0.02, 8, 40]} />
        <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={0.8} transparent opacity={0.6} />
      </mesh>
      {fac && (
        <>
          {/* containment: floor plinth, amber ring and four struts to the ceiling beams */}
          <mesh position={[0, 0.05 - position[1], 0]} raycast={() => null}>
            <cylinderGeometry args={[1.1, 1.25, 0.1, 24]} />
            <meshStandardMaterial color="#1b1a19" roughness={0.7} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.12 - position[1], 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <torusGeometry args={[1.0, 0.012, 6, 48]} />
            <meshStandardMaterial color={FAC.amber} emissive={FAC.amber} emissiveIntensity={0.7} />
          </mesh>
          {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 5.85 / 2 - position[1], z]} raycast={() => null}>
              <boxGeometry args={[0.05, 5.85, 0.05]} />
              <meshStandardMaterial color={FAC.trim} roughness={0.5} metalness={0.7} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

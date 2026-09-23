import { Html } from '@react-three/drei';

// A wall-mounted scanner console — lit up once the team is holding the key,
// dark otherwise. Purely a readout, not clickable (the pickup and doors are
// the interactive pieces).
export default function Scanner3D({ position = [0, 0, 0], hasKey, color = '#35f2c2' }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.5, 1.1, 0.12]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.65, 0.07]}>
        <planeGeometry args={[0.3, 0.32]} />
        <meshStandardMaterial
          color={hasKey ? color : '#111820'}
          emissive={hasKey ? color : '#000000'}
          emissiveIntensity={hasKey ? 1.2 : 0}
        />
      </mesh>
    </group>
  );
}

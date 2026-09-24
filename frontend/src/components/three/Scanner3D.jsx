import { Html } from '@react-three/drei';
import { FAC } from './FacilityRoom3D.jsx';

const noRay = () => null;

// Access scanner. variant="facility": the same scanner (same readout logic: lit only once the
// key has been collected) on a floor-mounted post with a bezel, instead of a floating slab.
export default function Scanner3D({ position = [0, 0, 0], hasKey, color = '#35f2c2', variant = 'legacy' }) {
  if (variant === 'facility') {
    return (
      <group position={position}>
        <mesh position={[0, 0.06, 0]} raycast={noRay}>
          <cylinderGeometry args={[0.34, 0.4, 0.12, 8]} />
          <meshStandardMaterial color="#12100f" roughness={0.85} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.5, 0]} raycast={noRay}>
          <cylinderGeometry args={[0.06, 0.08, 0.9, 10]} />
          <meshStandardMaterial color={FAC.metal} roughness={0.45} metalness={0.7} />
        </mesh>
        <mesh position={[0, 1.5, 0]} raycast={noRay}>
          <boxGeometry args={[0.62, 1.2, 0.14]} />
          <meshStandardMaterial color={FAC.panel} roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 1.5, 0.072]} raycast={noRay}>
          <boxGeometry args={[0.5, 1.08, 0.01]} />
          <meshStandardMaterial color="#12100f" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* readout window */}
        <mesh position={[0, 1.7, 0.08]} raycast={noRay}>
          <planeGeometry args={[0.34, 0.36]} />
          <meshStandardMaterial
            color={hasKey ? FAC.olive : '#151413'}
            emissive={hasKey ? FAC.olive : FAC.amber}
            emissiveIntensity={hasKey ? 1.1 : 0.12}
          />
        </mesh>
        {/* card slot + status LEDs */}
        <mesh position={[0, 1.32, 0.08]} raycast={noRay}>
          <boxGeometry args={[0.34, 0.03, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        {[-0.1, 0, 0.1].map((x) => (
          <mesh key={x} position={[x, 1.14, 0.08]} raycast={noRay}>
            <boxGeometry args={[0.05, 0.03, 0.01]} />
            <meshStandardMaterial color={hasKey ? FAC.olive : FAC.amber} emissive={hasKey ? FAC.olive : FAC.amber} emissiveIntensity={0.8} />
          </mesh>
        ))}
        {[[-0.28, 2.06], [0.28, 2.06], [-0.28, 0.94], [0.28, 0.94]].map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, 0.075]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
            <cylinderGeometry args={[0.018, 0.018, 0.02, 8]} />
            <meshStandardMaterial color={FAC.metal} metalness={0.8} roughness={0.4} />
          </mesh>
        ))}
      </group>
    );
  }

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

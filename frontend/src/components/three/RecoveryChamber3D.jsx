import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';

// A small 3D "alarm room" backdrop for the recovery screen: a spinning
// warning beacon in a dim red-lit chamber. Deliberately NOT where the
// puzzle itself lives — the puzzle grid/options stay as crisp, precise HTML
// (accuracy and legibility under a 30s deadline matter more here than
// spatial interaction), this is purely the atmosphere behind it.
function Beacon({ urgent }) {
  const ref = useRef();
  const lightRef = useRef();
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    const speed = urgent ? 5 : 2.2;
    if (ref.current) ref.current.rotation.y = t.current * speed;
    if (lightRef.current) lightRef.current.intensity = 0.8 + Math.abs(Math.sin(t.current * speed)) * 1.6;
  });
  return (
    <group position={[0, 1.6, -1.5]}>
      <pointLight ref={lightRef} color="#ff3b5c" distance={9} decay={2} />
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.18, 16]} />
        <meshStandardMaterial color="#1a1010" />
      </mesh>
      <group ref={ref} position={[0, 0.55, 0]}>
        <mesh>
          <coneGeometry args={[0.16, 0.22, 16]} />
          <meshStandardMaterial color="#ff3b5c" emissive="#ff3b5c" emissiveIntensity={1.4} transparent opacity={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export default function RecoveryChamber3D({ urgent }) {
  return (
    <div className="az-recovery-3d-backdrop" aria-hidden="true">
      <Canvas dpr={[1, 1.3]} camera={{ position: [0, 1.4, 3.4], fov: 45 }} gl={{ antialias: true, powerPreference: 'low-power' }}>
        <color attach="background" args={['#0a0507']} />
        <fog attach="fog" args={['#0a0507', 4, 9]} />
        <ambientLight intensity={0.25} color="#ff3b5c" />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#0b0708" roughness={0.95} />
        </mesh>
        <mesh position={[0, 2, -3]}>
          <planeGeometry args={[10, 4]} />
          <meshStandardMaterial color="#0a0607" roughness={0.98} />
        </mesh>
        <Beacon urgent={urgent} />
        <Sparkles count={20} scale={[6, 3, 6]} size={1.6} speed={urgent ? 0.6 : 0.2} opacity={0.3} color="#ff3b5c" />
      </Canvas>
    </div>
  );
}

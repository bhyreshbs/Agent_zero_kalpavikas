import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { damp } from './easing.js';
import { FAC } from './FacilityRoom3D.jsx';

const noRay = () => null;

// A floating key card. variant="facility": same clickable card mesh (same size, same
// handlers, same float/spin/collect behaviour), presented as an access badge with a
// magnetic stripe and an amber chip.
export default function KeyCard3D({ position = [0, 0, 0], color = '#35f2c2', collected, onClick, label, variant = 'legacy' }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const t = useRef(0);
  const facility = variant === 'facility';

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
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[0.5, 0.32, 0.04]} />
        {facility ? (
          <meshStandardMaterial color="#d8d3c8" emissive={FAC.amberHi} emissiveIntensity={hovered ? 0.5 : 0.18} metalness={0.5} roughness={0.4} />
        ) : (
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.4 : 0.6} metalness={0.5} roughness={0.3} />
        )}
        {facility && (
          <>
            <mesh position={[0, 0.09, 0.024]} raycast={noRay}>
              <boxGeometry args={[0.46, 0.06, 0.006]} />
              <meshStandardMaterial color="#12100f" roughness={0.8} />
            </mesh>
            <mesh position={[-0.13, -0.04, 0.024]} raycast={noRay}>
              <boxGeometry args={[0.1, 0.08, 0.006]} />
              <meshStandardMaterial color={FAC.amber} emissive={FAC.amber} emissiveIntensity={0.9} />
            </mesh>
            <mesh position={[0.08, -0.06, 0.024]} raycast={noRay}>
              <boxGeometry args={[0.24, 0.02, 0.006]} />
              <meshStandardMaterial color="#5a5852" />
            </mesh>
          </>
        )}
      </mesh>
      {facility && !hovered && <pointLight position={[0, 0, 0.3]} intensity={1.6} distance={2.5} decay={2} color={FAC.amberHi} />}
      {hovered && !collected && (
        <Html position={[0, 0.45, 0]} center distanceFactor={10}>
          <div className={facility ? 'az-3d-tag ds-3d-tag' : 'az-3d-tag'} style={{ '--label-tone': facility ? FAC.amber : color, fontSize: '0.65rem', letterSpacing: '0.1em' }}>[ KEY ]</div>
        </Html>
      )}
    </group>
  );
}

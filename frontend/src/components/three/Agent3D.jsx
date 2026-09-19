import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { damp } from './easing.js';

// A standing companion-construct figure (Level 3's UNIT A / UNIT B, also
// reusable anywhere else an agent needs a physical presence in the room)
// — an idle-swaying humanoid silhouette with its identity glyph floating
// above. Rounded sphere joints at the neck/shoulders give it a less
// "stacked boxes" read; damped (not linear) motion for the idle sway and
// hover response.
export default function Agent3D({ position = [0, 0, 0], color = '#35f2c2', glyph, label, sublabel, known, onClick }) {
  const bodyRef = useRef();
  const headRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);
  const t = useRef(Math.random() * 5);

  useFrame((_, delta) => {
    t.current += delta;
    if (bodyRef.current) {
      const bobTarget = Math.sin(t.current * 1.6) * 0.04;
      bodyRef.current.position.y = damp(bodyRef.current.position.y, bobTarget, 8, delta);
      const leanTarget = hovered ? 0.06 : 0;
      bodyRef.current.rotation.z = damp(bodyRef.current.rotation.z, leanTarget, 8, delta);
    }
    if (headRef.current) {
      const lookTarget = Math.sin(t.current * 0.6) * 0.15;
      headRef.current.rotation.y = damp(headRef.current.rotation.y, lookTarget, 3, delta);
    }
    if (glowRef.current) {
      const pulse = known ? 1.1 + Math.sin(t.current * 2) * 0.2 : 0.5;
      glowRef.current.material.emissiveIntensity = damp(glowRef.current.material.emissiveIntensity, pulse, 5, delta);
    }
  });

  return (
    <group position={position}>
      <group
        ref={bodyRef}
        onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <group ref={headRef} position={[0, 1.5, 0]}>
          <mesh>
            <sphereGeometry args={[0.22, 20, 20]} />
            <meshPhysicalMaterial color="#151b22" emissive={color} emissiveIntensity={hovered ? 0.55 : 0.2} metalness={0.45} roughness={0.35} clearcoat={0.5} />
          </mesh>
          <mesh ref={glowRef} position={[0, 0, 0.2]}>
            <circleGeometry args={[0.09, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        </group>
        {/* Neck joint */}
        <mesh position={[0, 1.28, 0]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color="#10151b" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.24, 0.9, 4, 12]} />
          <meshPhysicalMaterial color="#1c242e" emissive={color} emissiveIntensity={hovered ? 0.35 : 0.1} metalness={0.5} roughness={0.35} clearcoat={0.35} />
        </mesh>
        {/* Simple arm nubs, resting close to the body */}
        <mesh position={[-0.3, 0.85, 0]}>
          <capsuleGeometry args={[0.07, 0.55, 4, 8]} />
          <meshStandardMaterial color="#151b22" metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[0.3, 0.85, 0]}>
          <capsuleGeometry args={[0.07, 0.55, 4, 8]} />
          <meshStandardMaterial color="#151b22" metalness={0.45} roughness={0.4} />
        </mesh>
      </group>
      <Html position={[0, 2.05, 0]} center distanceFactor={10}>
        <div className="az-3d-agent-label" style={{ '--label-tone': color }}>
          <div>{glyph} {label}</div>
          {sublabel && <div className="az-3d-agent-sub">{sublabel}</div>}
        </div>
      </Html>
    </group>
  );
}

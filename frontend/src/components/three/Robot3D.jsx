import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { damp } from './easing.js';

// High-polish 3D hero robot character:
// Sculpted white lacquer armor chassis, dark curved visor with glowing expressive eyes,
// illuminated titanium joints, armored limbs with knee guards, chest arc reactor,
// and glowing blue energy backpack core.
export default function Robot3D({ walking = false, color = '#00f0ff' }) {
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();
  const bodyRef = useRef();
  const headRef = useRef();
  const eyeL = useRef();
  const eyeR = useRef();
  const backpackGlow = useRef();
  const t = useRef(Math.random() * 10);
  const blinkAt = useRef(2 + Math.random() * 3);
  const headTurnAt = useRef(3 + Math.random() * 4);
  const headTurnTarget = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const swing = walking ? Math.sin(t.current * 8.5) * 0.55 : 0;
    if (legL.current && legR.current) {
      legL.current.rotation.x = damp(legL.current.rotation.x, swing, 14, delta);
      legR.current.rotation.x = damp(legR.current.rotation.x, -swing, 14, delta);
    }
    if (armL.current && armR.current) {
      const armSwing = walking ? Math.sin(t.current * 8.5 + Math.PI) * 0.35 : Math.sin(t.current * 1.5) * 0.05;
      armL.current.rotation.x = damp(armL.current.rotation.x, armSwing, 10, delta);
      armR.current.rotation.x = damp(armR.current.rotation.x, -armSwing, 10, delta);
    }
    if (bodyRef.current) {
      const bobTarget = Math.sin(t.current * (walking ? 8.5 : 2.2)) * (walking ? 0.03 : 0.012);
      bodyRef.current.position.y = damp(bodyRef.current.position.y, bobTarget, 12, delta);
      bodyRef.current.rotation.x = damp(bodyRef.current.rotation.x, walking ? 0.08 : 0, 8, delta);
    }
    // Idle head turn (fast, snappy robotic scanning)
    if (headRef.current) {
      headTurnAt.current -= delta;
      if (headTurnAt.current <= 0) {
        headTurnTarget.current = walking ? 0 : (Math.random() - 0.5) * 0.65;
        headTurnAt.current = 0.5 + Math.random() * 0.8;
      }
      headRef.current.rotation.y = damp(headRef.current.rotation.y, headTurnTarget.current, 18, delta);
    }
    // Eye blink
    if (eyeL.current && eyeR.current) {
      blinkAt.current -= delta;
      const blinking = blinkAt.current < 0.12 && blinkAt.current > 0;
      const s = blinking ? 0.12 : 1;
      eyeL.current.scale.y = s;
      eyeR.current.scale.y = s;
      if (blinkAt.current <= 0) blinkAt.current = 2.5 + Math.random() * 3.5;
    }
    if (backpackGlow.current) {
      backpackGlow.current.material.emissiveIntensity = 1.4 + Math.sin(t.current * 3) * 0.4;
    }
  });

  return (
    <group>
      <group ref={bodyRef}>
        {/* Head Assembly */}
        <group ref={headRef} position={[0, 0.62, 0]}>
          {/* Main White Helmet */}
          <mesh>
            <sphereGeometry args={[0.28, 24, 24]} />
            <meshPhysicalMaterial
              color="#f8fafc"
              metalness={0.12}
              roughness={0.18}
              clearcoat={0.8}
              clearcoatRoughness={0.15}
            />
          </mesh>

          {/* Dark Curved Visor Plate */}
          <mesh position={[0, 0.02, 0.125]} scale={[1, 0.82, 0.95]}>
            <sphereGeometry args={[0.22, 20, 20]} />
            <meshPhysicalMaterial
              color="#090d16"
              metalness={0.8}
              roughness={0.12}
              clearcoat={1.0}
            />
          </mesh>

          {/* Glowing Expressive Eyes */}
          <mesh position={[-0.08, 0.02, 0.29]} ref={eyeL}>
            <boxGeometry args={[0.065, 0.055, 0.015]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[0.08, 0.02, 0.29]} ref={eyeR}>
            <boxGeometry args={[0.065, 0.055, 0.015]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} />
          </mesh>

          {/* Ear Puck Accents with glowing ring */}
          <mesh position={[-0.275, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[-0.298, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <ringGeometry args={[0.035, 0.055, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>

          <mesh position={[0.275, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0.298, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <ringGeometry args={[0.035, 0.055, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>

        {/* Neck Ring - Titanium Metallic */}
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.095, 0.115, 0.07, 16]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
        </mesh>

        {/* Torso Chassis */}
        <group position={[0, 0.2, 0]}>
          {/* Main White Chest Armor */}
          <mesh>
            <boxGeometry args={[0.4, 0.4, 0.3]} />
            <meshPhysicalMaterial
              color="#f8fafc"
              metalness={0.12}
              roughness={0.18}
              clearcoat={0.8}
            />
          </mesh>

          {/* Torso Tech Inlays (Lateral Cyan Stripes) */}
          <mesh position={[-0.19, 0, 0.02]}>
            <boxGeometry args={[0.03, 0.26, 0.26]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.19, 0, 0.02]}>
            <boxGeometry args={[0.03, 0.26, 0.26]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>

          {/* Front Chest Arc Reactor with Outer Chrome Bezel */}
          <mesh position={[0, 0.04, 0.152]}>
            <ringGeometry args={[0.065, 0.08, 20]} />
            <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.04, 0.155]}>
            <circleGeometry args={[0.062, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} />
          </mesh>

          {/* Back Energy Core / Jetpack Unit */}
          <mesh position={[0, 0.04, -0.17]}>
            <cylinderGeometry args={[0.11, 0.11, 0.14, 16]} rotation={[Math.PI / 2, 0, 0]} />
            <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.04, -0.245]} ref={backpackGlow}>
            <circleGeometry args={[0.08, 16]} rotation={[0, Math.PI, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} />
          </mesh>
        </group>

        {/* Arms */}
        <group ref={armL} position={[-0.26, 0.32, 0]}>
          {/* Shoulder Armor Sphere */}
          <mesh>
            <sphereGeometry args={[0.075, 14, 14]} />
            <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
          </mesh>
          {/* Upper Arm Bicep / Joint - Metallic Titanium with Cyan Ring */}
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.045, 0.14, 4, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.3} />
          </mesh>
          {/* Forearm Armor Plating */}
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.052, 0.05, 0.08, 12]} />
            <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
          </mesh>
          {/* Hand Gauntlet */}
          <mesh position={[0, -0.24, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>

        <group ref={armR} position={[0.26, 0.32, 0]}>
          <mesh>
            <sphereGeometry args={[0.075, 14, 14]} />
            <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.045, 0.14, 4, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.052, 0.05, 0.08, 12]} />
            <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
          </mesh>
          <mesh position={[0, -0.24, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Hip / Waist Assembly with Glowing Circuit Ring */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.13, 0.14, 0.08, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.142, 0.008, 8, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Legs & Armored Boots */}
      <group ref={legL} position={[-0.12, 0, 0]}>
        {/* Upper Leg Joint */}
        <mesh position={[0, -0.12, 0]}>
          <capsuleGeometry args={[0.05, 0.16, 4, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.3} />
        </mesh>
        {/* White Knee Guard Plating */}
        <mesh position={[0, -0.18, 0.035]}>
          <boxGeometry args={[0.075, 0.07, 0.04]} />
          <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
        </mesh>
        {/* Lower Shin Plate */}
        <mesh position={[0, -0.24, 0.02]}>
          <boxGeometry args={[0.08, 0.1, 0.07]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Armored Boot Foot with Front Toe Accent */}
        <mesh position={[0, -0.31, 0.03]}>
          <boxGeometry args={[0.1, 0.07, 0.17]} />
          <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
        </mesh>
        {/* Boot Sole Glow Stripe */}
        <mesh position={[0, -0.34, 0.03]}>
          <boxGeometry args={[0.098, 0.015, 0.165]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
        </mesh>
      </group>

      <group ref={legR} position={[0.12, 0, 0]}>
        <mesh position={[0, -0.12, 0]}>
          <capsuleGeometry args={[0.05, 0.16, 4, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.18, 0.035]}>
          <boxGeometry args={[0.075, 0.07, 0.04]} />
          <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
        </mesh>
        <mesh position={[0, -0.24, 0.02]}>
          <boxGeometry args={[0.08, 0.1, 0.07]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.31, 0.03]}>
          <boxGeometry args={[0.1, 0.07, 0.17]} />
          <meshPhysicalMaterial color="#f8fafc" metalness={0.15} roughness={0.2} clearcoat={0.7} />
        </mesh>
        <mesh position={[0, -0.34, 0.03]}>
          <boxGeometry args={[0.098, 0.015, 0.165]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
        </mesh>
      </group>
    </group>
  );
}


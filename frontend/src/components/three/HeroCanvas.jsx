import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles, ContactShadows, Float } from '@react-three/drei';
import Robot3D from './Robot3D.jsx';
// ============================================================================
// 1. HERO ROBOT CHARACTER (Centered Staged Protagonist)
// ============================================================================
function HeroRobotCharacter() {
  const robotRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (robotRef.current) {
      // Alert idle breathing & organic micro-bobbing (faster active cycle)
      robotRef.current.position.y = Math.sin(t * 2.6) * 0.005;
      robotRef.current.rotation.y = -0.04 + Math.sin(t * 2.2) * 0.03;
    }
  });

  return (
    <group position={[0.19, -0.27, -0.20]}>
      {/* HERO ROBOT CHARACTER — Standing in the center of the platform circle */}
      <group ref={robotRef} rotation={[0, -0.04, 0]} scale={[0.87, 0.87, 0.87]}>
        <Robot3D color="#ffffff" walking={false} />
      </group>

      {/* Ground Contact Shadow inside the platform circle */}
      <ContactShadows position={[0, -0.30, 0]} opacity={0.95} scale={2.0} blur={1.1} far={1.0} color="#000000" />
    </group>
  );
}

// ============================================================================
// 2. CINEMATIC CAMERA RIG
// ============================================================================
function CinematicCameraRig() {
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Gentle breathing camera movement, subtle and unhurried
    state.camera.position.x = Math.sin(t * 0.25) * 0.01;
    state.camera.position.y = Math.cos(t * 0.3) * 0.008;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

// ============================================================================
// 3. MAIN HERO CANVAS (Transparent Stage Over Sci-Fi Hangar Backdrop)
// ============================================================================
export default function HeroCanvas() {
  return (
    <div className="az-hero-canvas-wrap">
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4.3], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        {/* Soft Ambient Space Fill Light */}
        <ambientLight intensity={0.9} color="#172554" />

        {/* Crisp White Keylight Focused Directly on Hero Robot */}
        <pointLight position={[0.2, 1.4, 2.8]} intensity={3.4} color="#ffffff" distance={8} decay={2} />

        {/* Warm Amber Ceiling Light Match (from hangar rafters above-left) */}
        <pointLight position={[-3.2, 3.0, 1.0]} intensity={2.2} color="#f59e0b" distance={9} />

        {/* Cool Cyan Accent from Gantry Rings */}
        <pointLight position={[0.08, -1.0, 1.2]} intensity={2.4} color="#00f0ff" distance={6} />

        {/* Magenta Rim Light from Hangar Lower Right Conduits */}
        <directionalLight position={[4.2, 1.5, -1.8]} intensity={2.2} color="#ec4899" />

        <Suspense fallback={null}>
          <CinematicCameraRig />

          {/* Staged Hero Robot Protagonist */}
          <HeroRobotCharacter />

          {/* Floating Ambient Starlight / Digital Telemetry */}
          <Sparkles count={55} scale={[10, 6, 8]} size={1.8} speed={0.35} opacity={0.45} color="#38bdf8" />
        </Suspense>
      </Canvas>
    </div>
  );
}

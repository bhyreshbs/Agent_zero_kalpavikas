import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import SplineRobot from '../SplineRobot.jsx';

// ============================================================================
// 1. CINEMATIC CAMERA RIG
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
// 2. MAIN HERO CANVAS (Transparent Stage Over Sci-Fi Hangar Backdrop)
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

        {/* Crisp White Keylight */}
        <pointLight position={[0.2, 1.4, 2.8]} intensity={3.4} color="#ffffff" distance={8} decay={2} />

        {/* Warm Amber Ceiling Light */}
        <pointLight position={[-3.2, 3.0, 1.0]} intensity={2.2} color="#f59e0b" distance={9} />

        {/* Cool Cyan Accent */}
        <pointLight position={[0.08, -1.0, 1.2]} intensity={2.4} color="#00f0ff" distance={6} />

        {/* Magenta Rim Light */}
        <directionalLight position={[4.2, 1.5, -1.8]} intensity={2.2} color="#ec4899" />

        <Suspense fallback={null}>
          <CinematicCameraRig />
          {/* Floating Ambient Starlight / Digital Telemetry */}
          <Sparkles count={55} scale={[10, 6, 8]} size={1.8} speed={0.35} opacity={0.45} color="#38bdf8" />
        </Suspense>
      </Canvas>

      {/*
        Spline Robot — rendered as a plain DOM element OUTSIDE the R3F Canvas.

        SIZING: Rendered as a fixed-size DOM absolute element (az-hero-spline-robot CSS).
        This avoids the R3F <Html transform> projection issue where even a small
        iframe appears full-screen due to perspective distanceFactor math.

        SCENE URL: Uses the correct official Spline embed ID z0qCkDOpEe2kJNA1qZ4eCxgm
        as published by Spline.

        NOTE ON spline-viewer web component:
        Spline's <spline-viewer> web component requires a prod.spline.design/…/scene.splinecode
        URL, which differs from the my.spline.design share/embed URL. Since the user only
        has the iframe embed code, we use the official Spline iframe embed format here.
        If you export the scene from Spline as "Spline Viewer" and get a .splinecode URL,
        replace the iframe below with: <spline-viewer url="..." /> after installing
        @splinetool/viewer.
      */}
      <SplineRobot className="az-hero-spline-robot" />
    </div>
  );
}

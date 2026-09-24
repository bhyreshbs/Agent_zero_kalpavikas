import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import FacilityRoom, { FacilityLights, FAC } from './FacilityRoom3D.jsx';

// Shared visual language for every 3D room: a tinted floor/wall shell, a
// flickering ceiling light, ambient dust, soft contact shadows under objects,
// a bloom/vignette post pass for a less "flat/CG-default" look, and a camera
// the player can gently orbit around (never full free-fly — this stays a
// "look around the room" feel, not a first-person walker, to keep
// interaction targets always readable). Still cheap enough for event-day
// laptops: no external HDR/textures (everything is procedural or built into
// drei/postprocessing), bloom+vignette only (no SSAO), capped DPR.
//
// variant="legacy"   (default) the original room shell, used by the other levels.
// variant="facility" the Agent Zero tactical-facility shell (FacilityRoom3D.jsx).
const TONE_COLORS = {
  cyan: '#35f2c2',
  amber: '#ffb84d',
  violet: '#9678ff',
  blue: '#408cff',
  white: '#eaf6ff',
};

export function toneColor(tone) {
  return TONE_COLORS[tone] || TONE_COLORS.cyan;
}

// Facility palette: amber technical accent, crimson only for the danger state.
const FACILITY_TONES = { amber: FAC.amber, red: FAC.crimsonHi, cyan: FAC.amber, violet: FAC.amber, blue: FAC.amber, white: FAC.ivory };

export default function SceneCanvas({ tone = 'cyan', flashColor = null, children, height = '100%', variant = 'legacy' }) {
  const facility = variant === 'facility';
  const color = facility ? (FACILITY_TONES[tone] || FAC.amber) : toneColor(tone);
  const ambientColor = flashColor || color;
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className={`az-scene3d-wrap${facility ? ' ds-scene-wrap' : ''}`} style={{ height: containerHeight, width: '100%', position: 'relative' }}>
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.5, 7.0], fov: 44 }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
      >
        {facility ? (
          <>
            <color attach="background" args={[FAC.bg]} />
            <fog attach="fog" args={[FAC.bg, 11, 26]} />
            <FacilityLights />
            {/* the transition flash tints the room, exactly like the legacy shell does */}
            {flashColor && <ambientLight intensity={0.6} color={FAC.crimsonHi} />}
            <FacilityRoom accent={color} />
            <ContactShadows position={[0, 0.012, 0]} opacity={0.6} scale={12} blur={2.2} far={3} color="#000000" />
            <Sparkles count={18} scale={[9, 4, 9]} size={1.0} speed={0.2} opacity={0.16} color={FAC.ivory} />
          </>
        ) : (
          <>
            <color attach="background" args={['#05070a']} />
            <fog attach="fog" args={['#05070a', 9, 22]} />

            <ambientLight intensity={0.42} color={ambientColor} />
            <pointLight position={[0, 4, 0]} intensity={1.1} color={ambientColor} distance={14} decay={2} />
            <pointLight position={[0, 1.2, 6]} intensity={0.35} color="#eaf6ff" distance={12} decay={2} />
            {/* Low rim/fill light from behind-left, purely to separate object
                silhouettes from the dark walls -- the single biggest cheap win
                for a "flat" scene. */}
            <pointLight position={[-4, 2.5, -5]} intensity={0.4} color={color} distance={16} decay={2} />

            {/* Floor -- meshPhysicalMaterial's clearcoat gives it a faint sheen
                instead of a dead-matte meshStandardMaterial surface. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={false}>
              <planeGeometry args={[16, 16]} />
              <meshPhysicalMaterial color="#0b0f14" roughness={0.55} metalness={0.15} clearcoat={0.4} clearcoatRoughness={0.6} />
            </mesh>
            {/* Faint floor grid lines, cheap: a single wireframe plane on top */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
              <planeGeometry args={[16, 16, 16, 16]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.06} />
            </mesh>
            {/* Soft baked contact shadow under the room's contents -- grounds
                objects without a real (expensive) shadow map. */}
            <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={12} blur={2.4} far={3} color="#000000" />

            {/* Back + side walls */}
            <mesh position={[0, 3, -4]}>
              <planeGeometry args={[16, 6]} />
              <meshStandardMaterial color="#0a0e13" roughness={0.9} metalness={0.08} />
            </mesh>
            <mesh position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[8, 6]} />
              <meshStandardMaterial color="#0a0e13" roughness={0.9} metalness={0.08} />
            </mesh>
            <mesh position={[6, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[8, 6]} />
              <meshStandardMaterial color="#0a0e13" roughness={0.9} metalness={0.08} />
            </mesh>

            {/* Ceiling light fixture */}
            <mesh position={[0, 5.6, -1]}>
              <boxGeometry args={[2.2, 0.12, 0.5]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
            </mesh>

            {/* Drifting dust motes -- the cheapest possible "this room has air
                in it" trick (a single drei <Sparkles> instanced-point cloud). */}
            <Sparkles count={26} scale={[9, 4, 9]} size={1.4} speed={0.25} opacity={0.35} color={color} />
          </>
        )}

        <Suspense fallback={null}>{children}</Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={4.5}
          maxDistance={9}
          minPolarAngle={Math.PI / 3.4}
          maxPolarAngle={Math.PI / 2.15}
          minAzimuthAngle={-0.7}
          maxAzimuthAngle={0.7}
          target={[0, 1.4, 0]}
          enableDamping
          dampingFactor={0.12}
        />

        <EffectComposer multisampling={0} disableNormalPass>
          <Bloom intensity={facility ? 0.32 : 0.55} luminanceThreshold={facility ? 0.7 : 0.35} luminanceSmoothing={0.25} mipmapBlur radius={0.6} />
          <Vignette eskil={false} offset={0.25} darkness={facility ? 0.5 : 0.55} />
        </EffectComposer>
      </Canvas>
      {facility ? (
        <div className="az-scene-control-hint ds-scene-hint">[ Drag to orbit // Scroll to zoom ]</div>
      ) : (
      <div className="az-scene-control-hint" style={{
        position: 'absolute',
        bottom: 8,
        right: 12,
        fontSize: '0.62rem',
        fontFamily: "'Share Tech Mono', monospace",
        color: 'var(--az-accent)',
        opacity: 0.7,
        letterSpacing: '0.12em',
        pointerEvents: 'none',
        textShadow: '0 0 8px rgba(0, 240, 255, 0.4)',
        background: 'rgba(5, 7, 10, 0.65)',
        padding: '2px 8px',
        borderRadius: '3px',
        border: '1px solid rgba(0, 240, 255, 0.2)'
      }}>
        [ DRAG TO ORBIT // SCROLL TO ZOOM ]
      </div>
      )}
    </div>
  );
}

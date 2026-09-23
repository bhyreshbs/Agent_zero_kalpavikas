import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useGame } from '../hooks/useGame.js';
import { Html } from '@react-three/drei';
import Gate3D from '../components/three/Gate3D.jsx';
import { toneColor } from '../components/three/SceneCanvas.jsx';
import { CHAPTERS } from '../story.js';
import { sfx } from '../sound.js';
import { IconTrophy, IconPlay, IconCheck, IconRobot } from '../components/GameIcons.jsx';

// The facility hub as a real 3D corridor: one archway per chapter, spaced
// along -Z, a 3D robot that actually walks between them, and a camera that
// follows a few steps behind — replacing the previous 2D SVG map with the
// same underlying game state (current level, completion) driving it.
const NODES = [0, 1, 2, 3, 4, 5, 6].map((index) => ({
  index,
  name: CHAPTERS[index].name,
  subtitle: CHAPTERS[index].tagline,
  final: index === 5,
}));
const byIndex = Object.fromEntries(NODES.map((n) => [n.index, n]));
const NODE_SPACING = 5.5;
const nodeZ = (index) => -index * NODE_SPACING;
const WALK_SPEED = 2.2; // higher = faster convergence per second (exponential ease)

function RobotRig({ startIndex, targetIndex, onArrive, robotZRef }) {
  const groupRef = useRef();
  const wasWalkingRef = useRef(false);
  const [walking, setWalking] = useState(false);
  const targetZRef = useRef(nodeZ(targetIndex));
  const initialZRef = useRef(nodeZ(startIndex));

  useEffect(() => {
    targetZRef.current = nodeZ(targetIndex);
  }, [targetIndex]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const z = groupRef.current.position.z;
    const diff = targetZRef.current - z;
    const moving = Math.abs(diff) > 0.04;
    if (moving) {
      groupRef.current.position.z += diff * Math.min(1, delta * WALK_SPEED);
    } else if (z !== targetZRef.current) {
      groupRef.current.position.z = targetZRef.current;
    }
    robotZRef.current = groupRef.current.position.z;
    if (moving !== wasWalkingRef.current) {
      wasWalkingRef.current = moving;
      setWalking(moving);
      if (!moving && onArrive) onArrive();
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, initialZRef.current]}>
      {/* Positioned slightly up to match Robot3D's visual center */}
      <group position={[0, 0.40, 0]} scale={[1.2, 1.2, 1.2]}>
        <Html transform center distanceFactor={8}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconRobot size={120} color="#00f0ff" />
          </div>
        </Html>
      </group>
    </group>
  );
}

function FollowCamera({ robotZRef }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const targetZ = robotZRef.current + 5.5;
    camera.position.z += (targetZ - camera.position.z) * Math.min(1, delta * 2.5);
    camera.position.y += (2.6 - camera.position.y) * Math.min(1, delta * 2.5);
    camera.lookAt(0, 1.2, robotZRef.current - 1.5);
  });
  return null;
}

function Corridor({ current, startIndex, onEnterGate, robotZRef, onArrive }) {
  const totalLength = (NODES.length + 1) * NODE_SPACING;
  return (
    <>
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 8, 26]} />
      <ambientLight intensity={0.5} color="#35f2c2" />
      <pointLight position={[0, 4, robotZRef.current]} intensity={0.9} color="#35f2c2" distance={16} decay={2} />

      {/* Floor + walls, one long strip covering the whole corridor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -totalLength / 2 + NODE_SPACING]}>
        <planeGeometry args={[6, totalLength]} />
        <meshStandardMaterial color="#0b0f14" roughness={0.9} />
      </mesh>
      <mesh position={[-3, 2, -totalLength / 2 + NODE_SPACING]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[totalLength, 4]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.95} />
      </mesh>
      <mesh position={[3, 2, -totalLength / 2 + NODE_SPACING]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[totalLength, 4]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.95} />
      </mesh>

      {NODES.map((node) => {
        const status = node.index < current ? 'completed' : node.index === current ? 'current' : 'locked';
        return (
          <Gate3D
            key={node.index}
            position={[0, 0, nodeZ(node.index)]}
            color={toneColor(node.final ? 'white' : 'cyan')}
            name={node.name}
            icon={node.icon}
            status={status}
            onClick={() => onEnterGate(node.index)}
          />
        );
      })}

      <RobotRig startIndex={startIndex} targetIndex={current} onArrive={onArrive} robotZRef={robotZRef} />
      <FollowCamera robotZRef={robotZRef} />

      <Sparkles count={40} scale={[5, 3, totalLength]} size={1.2} speed={0.2} opacity={0.28} color="#35f2c2" />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={16} blur={2.6} far={3} color="#000000" />

      <EffectComposer multisampling={0} disableNormalPass>
        <Bloom intensity={0.5} luminanceThreshold={0.35} luminanceSmoothing={0.25} mipmapBlur radius={0.6} />
        <Vignette eskil={false} offset={0.3} darkness={0.6} />
      </EffectComposer>
    </>
  );
}

export default function LevelMap3D() {
  const nav = useNavigate();
  const { state, loading } = useGame();
  const [toast, setToast] = useState(null);
  const robotZRef = useRef(0);
  const arrivedTargetRef = useRef(null);
  // Read once, on first render: where the robot should visibly walk FROM
  // (set by GamePage just before it navigated here). If absent (fresh map
  // load, page refresh, etc.) the robot just starts where it already is —
  // no walk animation, matching the old 2D map's behaviour.
  const [startIndex] = useState(() => {
    const raw = sessionStorage.getItem('az_map_from_level');
    return raw !== null ? Number(raw) : null;
  });

  const current = !state ? 0 : state.status === 'completed' ? 6 : state.currentLevel;

  useEffect(() => {
    if (state) sessionStorage.removeItem('az_map_from_level');
  }, [state]);

  function handleArrive() {
    if (arrivedTargetRef.current === current) return;
    arrivedTargetRef.current = current;
    sfx.agentActivate();
    setToast(current === 6 ? 'FACILITY ESCAPED' : `${byIndex[current]?.name} UNLOCKED`);
    setTimeout(() => setToast(null), 2600);
  }

  if (loading || !state) return <div className="az-map-viewport" />;

  function enterLevel() {
    sfx.click();
    nav('/play');
  }

  return (
    <div className="az-map-viewport">
      <div className="az-map-header">
        <div className="az-map-header-left">
          <button
            className="az-btn-secondary"
            onClick={() => { sfx.click(); nav('/leaderboard'); }}
            onMouseEnter={() => sfx.hover()}
          >
            <IconTrophy size={14} style={{ marginRight: 6 }} /> Leaderboard
          </button>
        </div>
        <div className="az-map-header-center">
          <span className="az-badge az-map-station-badge">ECHO STATION // LEVEL MAP</span>
          <h2 className="az-title az-map-title">
            {state.status === 'completed' ? 'FACILITY ESCAPED' : byIndex[current]?.name}
          </h2>
          {state.status !== 'completed' && byIndex[current]?.subtitle && (
            <p className="az-hint az-map-subtitle">{byIndex[current].subtitle}</p>
          )}
        </div>
      </div>

      <div className="az-map-world">
        <Canvas
          shadows={false}
          dpr={[1, 1.5]}
          camera={{ position: [0, 2.6, 5.5], fov: 50 }}
          gl={{ antialias: true, powerPreference: 'low-power' }}
        >
          <Corridor
            current={current}
            startIndex={startIndex ?? current}
            onEnterGate={(i) => i === current && enterLevel()}
            robotZRef={robotZRef}
            onArrive={handleArrive}
          />
        </Canvas>

        {toast && <div className="az-map-toast az-glitch">{toast}</div>}
      </div>

      <div className="az-map-footer">
        {state.status === 'completed' ? (
          <button
            className="az-btn-primary az-btn-large"
            onClick={() => { sfx.click(); nav('/play'); }}
            onMouseEnter={() => sfx.hover()}
          >
            <IconCheck size={14} style={{ marginRight: 6 }} /> View Debriefing
          </button>
        ) : (
          <button
            className="az-btn-primary az-btn-large"
            onClick={enterLevel}
            onMouseEnter={() => sfx.hover()}
          >
            <IconPlay size={14} style={{ marginRight: 6 }} /> Enter {byIndex[current]?.name}
          </button>
        )}
      </div>
    </div>
  );
}

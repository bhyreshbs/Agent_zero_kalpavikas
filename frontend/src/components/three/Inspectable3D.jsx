import { useState } from 'react';
import { Html } from '@react-three/drei';
import { FAC } from './FacilityRoom3D.jsx';

const noRay = () => null;

// One clickable, inspectable object in a room. `shape` picks a rough silhouette
// so four different inspect-targets in the same room don't all look identical
// (a flat wall panel, a floor tile, a standing lamp, a door-like panel) while
// staying cheap (still just boxes/cylinders).
function Geometry({ shape }) {
  switch (shape) {
    case 'floor':
      return <boxGeometry args={[0.7, 0.04, 0.7]} />;
    case 'lamp':
      return <cylinderGeometry args={[0.05, 0.09, 1.3, 10]} />;
    case 'door':
      return <boxGeometry args={[0.9, 1.8, 0.08]} />;
    case 'wall':
    default:
      return <boxGeometry args={[0.7, 0.7, 0.08]} />;
  }
}

// ---- facility presentation ---------------------------------------------------
// The clickable surface stays an (invisible) mesh with the SAME geometry and the SAME
// pointer handlers as the legacy object, so hit-testing/interaction is unchanged; the
// visible detail below is decoration that never receives pointer events.
function Deco({ p, s, color = FAC.panel, emissive, ei = 0, rough = 0.7, metal = 0.45, rot, geo = 'box' }) {
  return (
    <mesh position={p} rotation={rot} raycast={noRay}>
      {geo === 'cyl' ? <cylinderGeometry args={s} /> : <boxGeometry args={s} />}
      <meshStandardMaterial color={color} emissive={emissive || '#000000'} emissiveIntensity={ei} roughness={rough} metalness={metal} />
    </mesh>
  );
}

function FacilityVisual({ shape, color, hovered, active, mounted, height = 1 }) {
  const glow = hovered ? 1 : active ? 0.6 : 0.3;
  // a wall-type object that is not mounted on a wall section stands on a post to the floor
  const post = !mounted && height > 0.6 ? (
    <Deco p={[0, -(height + 0.39) / 2, 0]} s={[0.04, 0.05, height - 0.39, 8]} geo="cyl" color={FAC.metal} rough={0.45} metal={0.7} />
  ) : null;
  switch (shape) {
    case 'wall': // wall-mounted access panel
      return (
        <group>
          {post}
          <Deco p={[0, 0, 0]} s={[0.78, 0.78, 0.06]} color={FAC.trim} />
          <Deco p={[0, 0, 0.04]} s={[0.62, 0.62, 0.04]} color="#161513" rough={0.55} metal={0.6} />
          {/* amber inset frame */}
          <Deco p={[0, 0.29, 0.065]} s={[0.56, 0.015, 0.01]} color={color} emissive={color} ei={glow} />
          <Deco p={[0, -0.29, 0.065]} s={[0.56, 0.015, 0.01]} color={color} emissive={color} ei={glow} />
          <Deco p={[-0.28, 0, 0.065]} s={[0.015, 0.56, 0.01]} color={color} emissive={color} ei={glow} />
          <Deco p={[0.28, 0, 0.065]} s={[0.015, 0.56, 0.01]} color={color} emissive={color} ei={glow} />
          {/* status readout bars */}
          {[0.12, 0, -0.12].map((y, i) => <Deco key={y} p={[-0.06 + i * 0.03, y, 0.07]} s={[0.3 - i * 0.06, 0.03, 0.01]} color={color} emissive={color} ei={glow * 0.8} />)}
          {[[-0.34, 0.34], [0.34, 0.34], [-0.34, -0.34], [0.34, -0.34]].map(([x, y]) => (
            <Deco key={`${x}${y}`} p={[x, y, 0.04]} s={[0.025, 0.025, 0.03, 8]} geo="cyl" rot={[Math.PI / 2, 0, 0]} color={FAC.metal} metal={0.8} />
          ))}
        </group>
      );
    case 'door': // secure bulkhead door
      return (
        <group>
          {/* leaf */}
          <Deco p={[0, 0, 0]} s={[0.9, 1.8, 0.08]} color="#1a1917" rough={0.55} metal={0.6} />
          <Deco p={[0, 0, 0.045]} s={[0.014, 1.7, 0.01]} color={color} emissive={color} ei={glow} />
          <Deco p={[0, 0.5, 0.045]} s={[0.7, 0.012, 0.01]} color={FAC.trim} />
          <Deco p={[0, -0.5, 0.045]} s={[0.7, 0.012, 0.01]} color={FAC.trim} />
          {/* frame: jambs + header */}
          <Deco p={[-0.52, 0, 0]} s={[0.14, 1.96, 0.24]} color={FAC.trim} />
          <Deco p={[0.52, 0, 0]} s={[0.14, 1.96, 0.24]} color={FAC.trim} />
          <Deco p={[0, 0.98, 0]} s={[1.2, 0.16, 0.26]} color={FAC.metal} metal={0.6} />
          {/* status light + keypad */}
          <Deco p={[0, 0.98, 0.14]} s={[0.5, 0.03, 0.01]} color={color} emissive={color} ei={glow + 0.2} />
          <Deco p={[0.66, 0.1, 0.05]} s={[0.14, 0.22, 0.06]} color="#12100f" />
          <Deco p={[0.66, 0.16, 0.085]} s={[0.07, 0.05, 0.01]} color={color} emissive={color} ei={glow + 0.3} />
          {/* hazard band at the foot of the door */}
          {[-0.36, -0.18, 0, 0.18, 0.36].map((x, i) => (
            <Deco key={x} p={[x, -0.86, 0.05]} s={[0.09, 0.06, 0.01]} color={i % 2 ? '#0a0908' : color} emissive={i % 2 ? '#000000' : color} ei={i % 2 ? 0 : 0.4} rot={[0, 0, 0.5]} />
          ))}
        </group>
      );
    case 'floor': // loose floor tile, seated in a dark recess
      return (
        <group rotation={[0, 0.06, 0]}>
          <Deco p={[0, -0.012, 0]} s={[0.78, 0.03, 0.78]} color="#0a0908" rough={0.9} metal={0.1} />
          <Deco p={[0, 0.004, 0]} s={[0.7, 0.04, 0.7]} color="#22201e" rough={0.55} metal={0.55} />
          <Deco p={[0, 0.03, 0]} s={[0.6, 0.006, 0.6]} color="#2b2927" rough={0.5} metal={0.6} />
          <Deco p={[0, 0.036, 0.29]} s={[0.5, 0.006, 0.02]} color={color} emissive={color} ei={glow * 0.9} />
          <Deco p={[0.29, 0.036, 0]} s={[0.02, 0.006, 0.5]} color={color} emissive={color} ei={glow * 0.5} />
        </group>
      );
    case 'lamp': // industrial work lamp
      return (
        <group position={[0, 0.65, 0]}>
          <Deco p={[0, -0.62, 0]} s={[0.22, 0.24, 0.07, 12]} geo="cyl" color={FAC.trim} rough={0.6} metal={0.6} />
          <Deco p={[0, -0.05, 0]} s={[0.035, 0.05, 1.2, 10]} geo="cyl" color={FAC.metal} rough={0.45} metal={0.7} />
          <Deco p={[0, 0.52, 0]} s={[0.13, 0.17, 0.26, 12]} geo="cyl" color={FAC.panel} rough={0.5} metal={0.6} />
          <Deco p={[0, 0.66, 0]} s={[0.15, 0.15, 0.03, 12]} geo="cyl" color={FAC.metal} metal={0.7} />
          {/* warm lens */}
          <Deco p={[0, 0.4, 0]} s={[0.115, 0.115, 0.03, 16]} geo="cyl" color={FAC.amberHi} emissive={FAC.amberHi} ei={hovered ? 1.6 : 1.0} rough={0.3} metal={0.1} />
          <pointLight position={[0, 0.3, 0]} intensity={hovered ? 9 : 5} distance={5} decay={2} color={FAC.amberHi} />
        </group>
      );
    case 'terminal': // wall/stand terminal with screen and keyboard shelf
      return (
        <group>
          {post}
          <Deco p={[0, 0, 0]} s={[0.82, 0.66, 0.12]} color={FAC.trim} />
          <Deco p={[0, 0.02, 0.07]} s={[0.7, 0.5, 0.02]} color="#0d0c0b" rough={0.4} metal={0.5} />
          {[0.14, 0.04, -0.06, -0.16].map((y, i) => <Deco key={y} p={[-0.05 - i * 0.02, y, 0.085]} s={[0.4 - i * 0.05, 0.03, 0.006]} color={color} emissive={color} ei={glow * 0.9} />)}
          <Deco p={[0.27, 0.16, 0.085]} s={[0.08, 0.08, 0.006]} color={color} emissive={color} ei={glow} />
          <Deco p={[0, -0.4, 0.1]} s={[0.7, 0.05, 0.22]} color={FAC.metal} metal={0.6} />
        </group>
      );
    case 'vent': // floor ventilation grille
      return (
        <group>
          <Deco p={[0, 0, 0]} s={[0.78, 0.03, 0.78]} color="#0a0908" rough={0.9} metal={0.2} />
          {[-0.27, -0.135, 0, 0.135, 0.27].map((z) => <Deco key={z} p={[0, 0.02, z]} s={[0.66, 0.02, 0.05]} color={FAC.metal} rough={0.5} metal={0.7} />)}
          <Deco p={[0, 0.035, 0.36]} s={[0.7, 0.008, 0.02]} color={color} emissive={color} ei={glow * 0.8} />
          <Deco p={[0, 0.035, -0.36]} s={[0.7, 0.008, 0.02]} color={color} emissive={color} ei={glow * 0.5} />
        </group>
      );
    case 'cabinet': { // maintenance-log locker
      const y0 = -Math.max(0, height - 0.93);
      return (
        <group position={[0, y0, 0]}>
          <Deco p={[0, 0, 0]} s={[0.96, 1.86, 0.3]} color="#1f1e1c" rough={0.6} metal={0.55} />
          {[0.55, 0, -0.55].map((y) => (
            <group key={y}>
              <Deco p={[0, y, 0.16]} s={[0.84, 0.48, 0.02]} color={FAC.trim} rough={0.55} metal={0.6} />
              <Deco p={[0, y + 0.13, 0.18]} s={[0.3, 0.025, 0.012]} color={color} emissive={color} ei={glow * 0.9} />
              <Deco p={[-0.28, y - 0.1, 0.18]} s={[0.22, 0.09, 0.008]} color="#d8d3c8" rough={0.7} metal={0.1} />
            </group>
          ))}
        </group>
      );
    }
    case 'keypad': // wall keypad
      return (
        <group>
          {post}
          <Deco p={[0, 0, 0]} s={[0.5, 0.7, 0.06]} color={FAC.trim} />
          <Deco p={[0, 0, 0.04]} s={[0.42, 0.62, 0.03]} color="#12100f" rough={0.5} metal={0.6} />
          {[0.18, 0.06, -0.06, -0.18].flatMap((y, r) => [-0.12, 0, 0.12].map((x, c) => (
            <Deco key={`${r}${c}`} p={[x, y - 0.03, 0.062]} s={[0.08, 0.08, 0.012]} color="#3a3835" emissive={color} ei={(r + c) % 3 === 0 ? glow : glow * 0.25} />
          )))}
          <Deco p={[0, 0.27, 0.06]} s={[0.3, 0.05, 0.01]} color={color} emissive={color} ei={glow} />
        </group>
      );
    default:
      return null;
  }
}

// The invisible hit volume for the lamp is raised to sit on the visible fixture and made wide
// enough to click comfortably (the legacy cylinder was a 0.1-radius rod centred on the floor);
// everything else keeps its geometry.
const HIT_OFFSET = { lamp: [0, 0.65, 0] };

export default function Inspectable3D({ position = [0, 0, 0], shape = 'wall', color = '#ffb84d', icon, label, active, disabled, onClick, variant = 'legacy', look, mounted = false }) {
  const [hovered, setHovered] = useState(false);
  const facility = variant === 'facility';
  const accent = facility ? FAC.amber : color;

  return (
    <group position={position}>
      <mesh
        position={facility ? HIT_OFFSET[shape] : undefined}
        onClick={(e) => { e.stopPropagation(); if (!disabled && onClick) onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); if (!disabled) { setHovered(true); if (facility) document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { setHovered(false); if (facility) document.body.style.cursor = 'auto'; }}
      >
        {facility && shape === 'lamp' ? <cylinderGeometry args={[0.24, 0.24, 1.5, 10]} /> : <Geometry shape={shape} />}
        {facility ? (
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        ) : (
          <meshStandardMaterial
            color={active ? color : '#1a1f27'}
            emissive={color}
            emissiveIntensity={hovered ? 0.9 : active ? 0.4 : 0.12}
            roughness={0.5}
            metalness={0.35}
          />
        )}
      </mesh>

      {facility && <FacilityVisual shape={look || shape} color={accent} hovered={hovered} active={active} mounted={mounted} height={position[1]} />}

      {!facility && shape === 'lamp' && (
        <mesh position={[0, 0.72, 0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.4 : 0.8} />
        </mesh>
      )}
      {label && hovered && (
        <Html position={[0, shape === 'lamp' ? (facility ? 1.45 : 1.05) : 0.55, 0]} center distanceFactor={11}>
          <div className={facility ? 'az-3d-tag ds-3d-tag' : 'az-3d-tag'} style={{ '--label-tone': accent }}>{icon} {label}</div>
        </Html>
      )}
    </group>
  );
}

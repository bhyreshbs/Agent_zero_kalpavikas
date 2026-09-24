// Tactical / classified facility shell for the 3D rooms (Agent Zero design language,
// see Stitch-Design/DESIGN.md): near-black warm charcoal, graphite structure,
// restrained amber technical indicators, red only for danger. Purely visual:
// nothing here has pointer handlers and every mesh opts out of raycasting, so it can
// never intercept a click meant for a gameplay object.
//
// Lights are sized for three r160's physically based lighting (point/spot values are
// candela-like, so they are much larger than the old legacy-unit values).

export const FAC = {
  bg: '#0f0e0d',
  floor: '#1a1a19',
  seam: '#0a0a09',
  wall: '#1e1e1d',
  panel: '#282827',
  trim: '#363634',
  metal: '#454442',
  amber: '#d4a853',
  amberHi: '#f2c36b',
  ivory: '#ede8df',
  crimson: '#9e382b',
  crimsonHi: '#c4523f',
  olive: '#5e7862',
};

const noRay = () => null;

// Legacy identity colours -> restrained facility palette (red stays red, cyan/blue read as steel, violet/amber as amber).
const TINTS = {
  '#35f2c2': '#7f9fb5',
  '#408cff': '#7f9fb5',
  '#ff3b5c': FAC.crimsonHi,
  '#9678ff': FAC.amber,
  '#ffb84d': '#c98a5e',
  '#eaf6ff': FAC.ivory,
  '#2a323c': '#3a3835',
};
export const facilityTint = (c) => TINTS[String(c).toLowerCase()] || c;

function Box({ p, s, color, emissive, ei = 0, rough = 0.85, metal = 0.25, rot }) {
  return (
    <mesh position={p} rotation={rot} raycast={noRay}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} emissive={emissive || '#000000'} emissiveIntensity={ei} roughness={rough} metalness={metal} />
    </mesh>
  );
}

const range = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to + 1e-6; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

export function FacilityLights() {
  return (
    <>
      <hemisphereLight args={['#e6e3dc', '#14130f', 1.25]} />
      <ambientLight intensity={0.5} color="#cfcbc2" />
      {/* key light: warm white from above-front, reads floor, walls and object faces */}
      <directionalLight position={[3.5, 7, 6]} intensity={2.6} color="#f4f0e6" />
      {/* pool of light over the control area */}
      <pointLight position={[0, 3.6, 0.6]} intensity={24} distance={11} decay={2} color="#eadfc4" />
      {/* faint amber rim from the back-left to separate silhouettes from the wall */}
      <pointLight position={[-4, 2.8, -3]} intensity={9} distance={10} decay={2} color="#d9c08a" />
      {/* cool-neutral fill from the right so the door side is not lost */}
      <pointLight position={[5, 2.2, 1]} intensity={12} distance={10} decay={2} color="#d8d6d0" />
    </>
  );
}

export default function FacilityRoom({ accent = FAC.amber }) {
  return (
    <group>
      {/* ---------------- floor: graphite plating with dark seams ---------------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRay}>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color={FAC.floor} roughness={0.78} metalness={0.3} />
      </mesh>
      {range(-7, 7, 2).map((x) => <Box key={`fx${x}`} p={[x, 0.004, 0]} s={[0.035, 0.008, 16]} color={FAC.seam} />)}
      {range(-4, 8, 2).map((z) => <Box key={`fz${z}`} p={[0, 0.004, z]} s={[16, 0.008, 0.035]} color={FAC.seam} />)}

      {/* operations zone marking (thin amber outline + corner ticks) */}
      {[
        { p: [0, 0.008, -1.6], s: [6.6, 0.006, 0.04] },
        { p: [0, 0.008, 2.8], s: [6.6, 0.006, 0.04] },
        { p: [-3.3, 0.008, 0.6], s: [0.04, 0.006, 4.44] },
        { p: [3.3, 0.008, 0.6], s: [0.04, 0.006, 4.44] },
      ].map((b, i) => <Box key={`zone${i}`} p={b.p} s={b.s} color={accent} emissive={accent} ei={0.45} />)}
      {[[-3.3, -1.6], [3.3, -1.6], [-3.3, 2.8], [3.3, 2.8]].map(([x, z], i) => (
        <Box key={`tick${i}`} p={[x, 0.01, z]} s={[0.22, 0.008, 0.22]} color={accent} emissive={accent} ei={0.7} />
      ))}

      {/* hazard chevrons in front of the east door */}
      {range(0, 5, 1).map((i) => (
        <Box key={`hz${i}`} p={[2.55 + i * 0.13, 0.01, -0.15]} s={[0.07, 0.006, 0.34]} color={i % 2 ? FAC.seam : accent} emissive={i % 2 ? '#000000' : accent} ei={i % 2 ? 0 : 0.35} rot={[0, 0.6, 0]} />
      ))}

      {/* ---------------- back wall ---------------- */}
      <mesh position={[0, 3, -4]} raycast={noRay}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color={FAC.wall} roughness={0.9} metalness={0.15} />
      </mesh>
      {range(-7, 7, 2).map((x) => <Box key={`bp${x}`} p={[x, 3, -3.95]} s={[0.22, 6, 0.1]} color={FAC.panel} rough={0.7} metal={0.4} />)}
      <Box p={[0, 1.05, -3.94]} s={[16, 0.08, 0.06]} color={FAC.trim} metal={0.5} />
      <Box p={[0, 3.7, -3.94]} s={[16, 0.08, 0.06]} color={FAC.trim} metal={0.5} />
      <Box p={[0, 0.16, -3.96]} s={[16, 0.32, 0.06]} color={FAC.bg} />
      {range(-6, 6, 2).map((x, i) => (
        <Box key={`bs${x}`} p={[x, 3.55, -3.92]} s={[1.3, 0.03, 0.02]} color={accent} emissive={accent} ei={i % 2 ? 0.28 : 0.55} />
      ))}

      {/* ---------------- side walls ---------------- */}
      {[-1, 1].map((side) => (
        <group key={`sw${side}`}>
          <mesh position={[side * 6, 3, 0]} rotation={[0, -side * Math.PI / 2, 0]} raycast={noRay}>
            <planeGeometry args={[8, 6]} />
            <meshStandardMaterial color={FAC.wall} roughness={0.9} metalness={0.15} />
          </mesh>
          {range(-3, 3, 2).map((z) => <Box key={`sp${side}${z}`} p={[side * 5.95, 3, z]} s={[0.1, 6, 0.22]} color={FAC.panel} rough={0.7} metal={0.4} />)}
          <Box p={[side * 5.94, 1.05, 0]} s={[0.06, 0.08, 8]} color={FAC.trim} metal={0.5} />
          <Box p={[side * 5.94, 3.7, 0]} s={[0.06, 0.08, 8]} color={FAC.trim} metal={0.5} />
          <Box p={[side * 5.96, 0.16, 0]} s={[0.06, 0.32, 8]} color={FAC.bg} />
          {range(-3, 3, 2).map((z, i) => (
            <Box key={`ss${side}${z}`} p={[side * 5.92, 3.55, z]} s={[0.02, 0.03, 1.3]} color={accent} emissive={accent} ei={i % 2 ? 0.28 : 0.55} />
          ))}
        </group>
      ))}

      {/* ---------------- ceiling structure ---------------- */}
      <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial color="#0c0b0a" roughness={0.95} />
      </mesh>
      {range(-6, 6, 3).map((x) => <Box key={`cb${x}`} p={[x, 5.85, 0]} s={[0.3, 0.3, 8]} color={FAC.trim} metal={0.5} />)}
      <Box p={[0, 5.85, -3.7]} s={[16, 0.3, 0.3]} color={FAC.trim} metal={0.5} />
      {[-2.4, 2.4].map((x) => (
        <Box key={`lb${x}`} p={[x, 5.68, 0]} s={[2.4, 0.06, 0.32]} color={FAC.ivory} emissive="#f5e6c8" ei={1.1} />
      ))}
    </group>
  );
}

/** Solid wall section that a wall-mounted gameplay panel can sit flush against. */
export function FacilityPartition({ position, size = [3.6, 2.6, 0.2] }) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <Box p={[0, 0, 0]} s={size} color={FAC.panel} rough={0.75} metal={0.35} />
      <Box p={[0, h / 2 + 0.03, 0]} s={[w + 0.12, 0.06, d + 0.08]} color={FAC.trim} metal={0.5} />
      <Box p={[0, -h / 2 + 0.03, 0]} s={[w + 0.12, 0.06, d + 0.08]} color={FAC.trim} metal={0.5} />
      {[-1, 1].map((sx) => <Box key={sx} p={[sx * (w / 2), 0, 0]} s={[0.06, h, d + 0.08]} color={FAC.trim} metal={0.5} />)}
      <Box p={[0, h / 2 - 0.25, d / 2 + 0.005]} s={[w - 0.3, 0.02, 0.01]} color={FAC.amber} emissive={FAC.amber} ei={0.5} />
      <Box p={[0, -h / 2 + 0.25, d / 2 + 0.005]} s={[w - 0.3, 0.02, 0.01]} color={FAC.amber} emissive={FAC.amber} ei={0.3} />
    </group>
  );
}

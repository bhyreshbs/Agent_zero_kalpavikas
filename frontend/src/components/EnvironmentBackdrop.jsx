// A fixed, full-viewport atmosphere layer sitting BEHIND all game content.
// Each chapter gets a distinct color identity and a couple of physical cues
// (a floor line, a horizon glow) so the room reads as a different physical
// location even though it's built entirely from CSS gradients — no images,
// no 3D engine, cheap to render on event-day laptops.
export default function EnvironmentBackdrop({ levelIndex = 0 }) {
  return (
    <div className={`az-room az-room-${levelIndex}`} aria-hidden="true">
      <div className="az-room-glow" />
      <div className="az-room-floor" />
    </div>
  );
}

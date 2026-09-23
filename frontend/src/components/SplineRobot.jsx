// SplineRobot — shared wrapper for the Spline 3D robot scene.
//
// Uses the official Spline iframe embed code exactly as exported from Spline.
// The scene URL (z0qCkDOpEe2kJNA1qZ4eCxgm) is the correct published share ID.
export default function SplineRobot({ className = '', style = {} }) {
  return (
    <div className={`spline-robot-wrapper ${className}`} style={style}>
      <iframe
        src="https://my.spline.design/genkubgreetingrobot-z0qCkDOpEe2kJNA1qZ4eCxgm/"
        frameBorder="0"
        width="100%"
        height="100%"
        style={{ border: 'none', display: 'block' }}
        title="Agent Zero Robot"
      />
    </div>
  );
}

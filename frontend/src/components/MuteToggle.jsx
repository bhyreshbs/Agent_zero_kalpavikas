import { useState } from 'react';
import { isMuted, toggleMuted } from '../sound.js';
import { IconAudio } from './GameIcons.jsx';

// variant="ds" renders with the shared design-system button (used inside .ds-page scopes);
// the default keeps the original look for legacy screens such as the game HUD.
export default function MuteToggle({ variant }) {
  const [muted, setMuted] = useState(isMuted());
  const label = muted ? 'Unmute sound' : 'Mute sound';

  if (variant === 'ds') {
    return (
      <button
        className="ds-btn ds-btn-ghost ds-btn-sm"
        style={{ minWidth: 32, padding: 0, color: muted ? 'var(--ds-text-muted)' : 'var(--ds-primary)' }}
        onClick={() => setMuted(toggleMuted())}
        title={label}
        aria-label={label}
      >
        <IconAudio muted={muted} size={16} color="currentColor" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setMuted(toggleMuted())}
      title={label}
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      <IconAudio muted={muted} size={16} />
    </button>
  );
}

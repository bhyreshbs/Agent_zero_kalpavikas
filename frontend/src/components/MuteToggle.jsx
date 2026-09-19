import { useState } from 'react';
import { isMuted, toggleMuted } from '../sound.js';
import { IconAudio } from './GameIcons.jsx';

export default function MuteToggle() {
  const [muted, setMuted] = useState(isMuted());
  return (
    <button
      onClick={() => setMuted(toggleMuted())}
      title={muted ? 'Unmute sound' : 'Mute sound'}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      <IconAudio muted={muted} size={16} />
    </button>
  );
}


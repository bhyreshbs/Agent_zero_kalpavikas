import { useCallback, useEffect, useRef, useState } from 'react';
import { tryEnterFullscreen } from '../components/SecureGameMode.jsx';

// Single source of truth for "is the browser really fullscreen right now".
// Always read from the DOM; never trust a remembered value.
export function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// Shared fullscreen requirement for every playable screen.
//
//   isFs    live, DOM-verified fullscreen state (re-checked on every
//           fullscreenchange, window focus and tab-visibility change)
//   enter   request fullscreen from a user gesture; resolves to the REAL state
//           afterwards (false if the browser rejected the request)
//   ensure  synchronous check to call before any gameplay action; returns
//           false (and flips isFs) when fullscreen is not active
//
// `onExit` fires once each time fullscreen is lost while `active` is true
// (e.g. the player pressed Esc). Nothing here requests fullscreen on its own,
// so there is no request loop; browsers only allow it from a user gesture.
export function useFullscreenGuard({ active, onExit }) {
  const [isFs, setIsFs] = useState(isFullscreenActive);
  const wasFs = useRef(isFullscreenActive());
  const activeRef = useRef(active);
  const onExitRef = useRef(onExit);
  activeRef.current = active;
  onExitRef.current = onExit;

  useEffect(() => {
    function sync() {
      const now = isFullscreenActive();
      setIsFs(now);
      if (wasFs.current && !now && activeRef.current) onExitRef.current?.();
      wasFs.current = now;
    }
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const enter = useCallback(async () => {
    await tryEnterFullscreen();
    const now = isFullscreenActive();
    wasFs.current = now;
    setIsFs(now);
    return now;
  }, []);

  const ensure = useCallback(() => {
    const now = isFullscreenActive();
    if (!now) setIsFs(false);
    return now;
  }, []);

  return { isFs, enter, ensure };
}

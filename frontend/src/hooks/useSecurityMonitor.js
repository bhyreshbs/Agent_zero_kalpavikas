import { useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client.js';

// Secure Game Mode detection (spec Part 3). A normal website cannot fully
// prevent OS-level Alt+Tab or another application taking focus — this only
// DETECTS that the game was left, via the browser APIs that are actually
// available: document.visibilitychange/hidden, window blur/focus, and
// fullscreenchange.
//
// VERIFY_MS is a short debounce so a harmless, instantly-recovered focus
// blip (opening a native file/password-manager prompt, a quick alt-tab that
// snaps right back, normal React re-renders, clicking into the emergency
// terminal or a game dialog) never counts as a violation — only a state
// that's still true after the verification window elapses gets reported.
// The server independently deduplicates multiple events from the same
// real-world tab-switch (blur + visibilitychange + fullscreenchange firing
// together) within its own cooldown window, so this is belt-and-suspenders,
// not the only protection against false positives / double-counting.
const VERIFY_MS = 600;

export function useSecurityMonitor({ enabled, onViolation }) {
  const hiddenTimer = useRef(null);
  const blurTimer = useRef(null);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const report = useCallback(async (reason) => {
    try {
      const out = await api.reportSecurityViolation(reason);
      if (!out || out.ignored || out.deduped) return;
      if (out.violationNumber) onViolationRef.current?.(out);
    } catch {
      // A monitoring-call hiccup must never block or interrupt gameplay.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function scheduleHiddenCheck() {
      clearTimeout(hiddenTimer.current);
      hiddenTimer.current = setTimeout(() => {
        if (document.hidden) report('visibility_hidden');
      }, VERIFY_MS);
    }
    function onVisibilityChange() {
      if (document.hidden) scheduleHiddenCheck();
      else clearTimeout(hiddenTimer.current);
    }

    function scheduleBlurCheck() {
      clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(() => {
        // document.hasFocus() re-checked after the debounce — a click that
        // merely moved focus between two elements inside the page never
        // leaves the window unfocused long enough to trip this.
        if (!document.hasFocus()) report('window_blur');
      }, VERIFY_MS);
    }
    function onBlur() { scheduleBlurCheck(); }
    function onFocus() { clearTimeout(blurTimer.current); }

    function onFullscreenChange() {
      if (!document.fullscreenElement) report('fullscreen_exit');
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      clearTimeout(hiddenTimer.current);
      clearTimeout(blurTimer.current);
    };
  }, [enabled, report]);
}

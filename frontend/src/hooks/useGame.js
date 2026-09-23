import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

// The server is the source of truth for lives/timer/level (spec section 21-22).
// This hook just polls /game/state periodically and exposes actions; it never
// computes the countdown locally beyond what the server last reported.
export function useGame() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setState(s);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 4000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const start = useCallback(async () => {
    const s = await api.startGame();
    setState(s);
  }, []);

  const exitGame = useCallback(async () => {
    try {
      const s = await api.exit();
      setState(s);
    } catch (err) {
      console.warn('exitGame failed:', err);
    }
  }, []);

  const sendAction = useCallback(async (action, payload) => {
    try {
      const outcome = await api.sendAction(action, payload);
      setState(outcome.clientState);
      setLastResult(outcome);
      return outcome;
    } catch (err) {
      if (err.data?.clientState) setState(err.data.clientState);
      setError(err.message);
      throw err;
    }
  }, []);
  const recoveryStart = useCallback(async () => {
    const outcome = await api.recoveryStart();
    return outcome;
  }, []);

  const recoverySubmit = useCallback(async (answer) => {
    const outcome = await api.recoverySubmit(answer);
    if (outcome.clientState) setState(outcome.clientState);
    return outcome;
  }, []);

  // Chat can (for a small whitelist of Level 5 intents) trigger the same
  // structured engine actions a button would — the response includes the
  // resulting clientState so the UI reflects it immediately. See AgentChat.jsx.
  const syncStateFrom = useCallback((clientState) => {
    if (clientState) setState(clientState);
  }, []);

  return { state, loading, error, lastResult, refresh, start, exitGame, sendAction, recoveryStart, recoverySubmit, syncStateFrom };
}

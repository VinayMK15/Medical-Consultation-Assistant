import { useEffect, useCallback } from 'react';

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Watches for user activity. If the user is idle for INACTIVITY_LIMIT_MS,
 * calls the provided onTimeout callback (typically: logout + redirect).
 *
 * Activity events watched: mousemove, mousedown, keydown, touchstart, scroll.
 */
export function useSessionTimeout(onTimeout, enabled = true) {
  const resetTimer = useCallback(() => {
    // Store the last-active timestamp in sessionStorage
    sessionStorage.setItem('medassist_last_active', Date.now().toString());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initialise last-active time
    resetTimer();

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    // Poll every minute to check if the inactivity limit has been exceeded
    const interval = setInterval(() => {
      const lastActive = parseInt(sessionStorage.getItem('medassist_last_active') || '0', 10);
      if (Date.now() - lastActive > INACTIVITY_LIMIT_MS) {
        onTimeout();
      }
    }, 60_000); // check every 60 seconds

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearInterval(interval);
    };
  }, [enabled, onTimeout, resetTimer]);
}

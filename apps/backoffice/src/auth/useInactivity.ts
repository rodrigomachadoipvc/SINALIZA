import { useCallback, useEffect, useRef, useState } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Tracks user activity. After `limitMs - warningMs` without activity `warning` turns true; after
 * `limitMs` `onTimeout` runs once. Activity during the warning does not dismiss it: the user has
 * to choose «Continuar sessão» (`stayActive`), so the warning is never missed.
 */
export function useInactivity(limitMs: number, warningMs: number, onTimeout: () => void) {
  const lastActivity = useRef(0);
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(limitMs);
  const warningRef = useRef(false);
  const timeout = useRef(onTimeout);

  useEffect(() => {
    timeout.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    lastActivity.current = Date.now();
    const onActivity = () => {
      if (!warningRef.current) lastActivity.current = Date.now();
    };
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });

    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      const remaining = limitMs - idle;
      if (remaining <= 0) {
        clearInterval(timer);
        warningRef.current = false;
        setWarning(false);
        timeout.current();
        return;
      }
      if (remaining <= warningMs && !warningRef.current) {
        warningRef.current = true;
        setWarning(true);
      }
      if (warningRef.current) setRemainingMs(remaining);
    }, 1000);

    return () => {
      clearInterval(timer);
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
    };
  }, [limitMs, warningMs]);

  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    warningRef.current = false;
    setWarning(false);
    setRemainingMs(limitMs);
  }, [limitMs]);

  return { warning, remainingMs, stayActive };
}

import { useEffect, useRef, useState } from 'react';

/**
 * Debounce primitive for search and filter inputs.
 *
 * The ledger can hold thousands of rows, so a keystroke must not trigger a full
 * re-filter on every character. The returned value settles after `delayMs` of
 * quiet, and the pending timer is always cleared on unmount so a fast navigation
 * cannot fire a stale update.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Debounced callback with a stable identity.
 *
 * `flush` lets a caller (e.g. a form submit) apply the pending call immediately
 * instead of waiting out the debounce window.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs = 250
): { run: (...args: Args) => void; flush: () => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const cancel = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  };

  const run = (...args: Args): void => {
    pendingArgsRef.current = args;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingArgsRef.current;
      pendingArgsRef.current = null;
      if (pending) callbackRef.current(...pending);
    }, delayMs);
  };

  const flush = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingArgsRef.current;
    pendingArgsRef.current = null;
    if (pending) callbackRef.current(...pending);
  };

  return { run, flush, cancel };
}

/**
 * Tracks a CSS media query with an SSR-safe first paint.
 *
 * Exported here as well as from `useResponsive` so molecules can react to a
 * single breakpoint without subscribing to the whole responsive state.
 */
export function useIsBelow(breakpointPx: number): boolean {
  const [below, setBelow] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.innerWidth < breakpointPx;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = `(max-width: ${breakpointPx - 1}px)`;
    const list = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent): void => setBelow(event.matches);

    setBelow(list.matches);
    list.addEventListener('change', handleChange);
    return () => list.removeEventListener('change', handleChange);
  }, [breakpointPx]);

  return below;
}

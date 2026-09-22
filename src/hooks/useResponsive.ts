import { useEffect, useState } from 'react';
import { Grid } from 'antd';
import {
  isCompactBucket,
  mobileContentInset,
  resolveViewportBucket,
  viewportTargets,
} from '../theme';
import type { ViewportBucket } from '../theme';

/**
 * Responsive primitives.
 *
 * The app is validated at 360px, 390px, 430px, 768px, 1024px and 1440px. Rather
 * than sprinkling raw media queries through components, every layout decision
 * reads from this hook so the breakpoint contract stays identical across the
 * shell, the views and the modal/drawer hybrid forms.
 *
 * The bucket maths itself lives in `src/theme` so it can be verified without a
 * browser; this module is the React binding around it.
 */

export type { ViewportBucket };
export { isCompactBucket, mobileContentInset, resolveViewportBucket };

export interface ResponsiveState {
  /** `false` on the first render, before the breakpoint observer settles. */
  isReady: boolean;
  /** Human-readable viewport bucket, useful for diagnostics and test hooks. */
  bucket: ViewportBucket;
  /** 360px and below: single column, full-width controls. */
  isMobileSmall: boolean;
  /** Below 768px: touch-first layout with the sticky bottom navigation. */
  isMobile: boolean;
  /** 768px-1023px: two-column dashboard, centred dialogs, no bottom navigation. */
  isTablet: boolean;
  /** 1024px and up: the three-column architecture. */
  isDesktop: boolean;
  /** 1440px and up: wide desktop with room for the analytics rail. */
  isDesktopWide: boolean;
  /** True for any layout that needs stacked, thumb-friendly controls. */
  isCompact: boolean;
  /** True when the pointer is fine enough for hover-revealed affordances. */
  prefersHover: boolean;
  /** True when the user asked the OS to reduce motion. */
  prefersReducedMotion: boolean;
}

/** Reactive `window.matchMedia` wrapper, safe when the API is unavailable. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent): void => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener('change', handleChange);
    return () => list.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/**
 * Reads live viewport metrics.
 *
 * Uses Ant Design's `useBreakpoint` so the values agree exactly with the
 * `Row`/`Col` grid, and layers a raw width probe on top for the 360px floor that
 * the Ant Design ladder does not model.
 */
export function useResponsive(): ResponsiveState {
  const screens = Grid.useBreakpoint();
  const isMobileSmall = useMediaQuery(`(max-width: ${viewportTargets.mobileSmall}px)`);
  const prefersHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? viewportTargets.desktop : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // `screens` is empty on the very first render, before the observer fires.
  const isReady = typeof screens.md === 'boolean';
  const isDesktop = screens.lg === true;
  const isTablet = screens.md === true && !isDesktop;
  const isMobile = !isDesktop && !isTablet;
  const bucket = resolveViewportBucket(viewportWidth);

  return {
    isReady,
    bucket,
    isMobileSmall,
    isMobile,
    isTablet,
    isDesktop,
    isDesktopWide: screens.xxl === true || viewportWidth >= viewportTargets.desktopUltra,
    isCompact: isCompactBucket(bucket),
    prefersHover,
    prefersReducedMotion,
  };
}

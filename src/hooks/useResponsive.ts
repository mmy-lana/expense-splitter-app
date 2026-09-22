import { useEffect, useState } from 'react';
import { Grid } from 'antd';
import { layoutMetrics, viewportTargets } from '../theme';

/**
 * Responsive primitives.
 *
 * The app is validated at 360px, 390px, 430px, 768px, 1024px and 1440px. Rather
 * than sprinkling raw media queries through components, every layout decision
 * reads from this single hook so the breakpoint contract stays identical across
 * the shell, the views and the modal/drawer hybrid form.
 */

export interface ResponsiveState {
  /** Reserved for SSR and the first paint before the observer settles. */
  isReady: boolean;
  /** Human readable viewport bucket, useful for diagnostics and test hooks. */
  bucket: ViewportBucket;
  /** Anthropic-grade danger: 360px and below. Single column, full-width controls. */
  isMobileSmall: boolean;
  /** 390px-767px: touch-first layout with the sticky bottom navigation. */
  isMobile: boolean;
  /** 768px-1023px: two column dashboard, centred modals, no bottom navigation. */
  isTablet: boolean;
  /** 1024px and up: full three column architecture. */
  isDesktop: boolean;
  /** 1440px and up: wide desktop with room for the analytics rail. */
  isDesktopWide: boolean;
  /** True for any layout that needs stacked, full-width, thumb-friendly controls. */
  isCompact: boolean;
  /** True when the pointer is fine enough for hover-revealed affordances. */
  prefersHover: boolean;
  /** True when the user asked the OS to reduce motion. */
  prefersReducedMotion: boolean;
}

export type ViewportBucket = 'MOBILE_SMALL' | 'MOBILE' | 'TABLET' | 'DESKTOP' | 'DESKTOP_WIDE';

function resolveBucket(width: number): ViewportBucket {
  if (width >= viewportTargets.desktopUltra) return 'DESKTOP_WIDE';
  if (width >= viewportTargets.desktop) return 'DESKTOP';
  if (width >= viewportTargets.tablet) return 'TABLET';
  if (width > viewportTargets.mobileSmall) return 'MOBILE';
  return 'MOBILE_SMALL';
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
 * `Row`/`Col` grid, and layers a raw `matchMedia` width probe on top for the
 * 360px floor that the Ant Design ladder does not model.
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
  const bucket: ViewportBucket = isReady ? resolveBucket(viewportWidth) : 'DESKTOP';

  return {
    isReady,
    bucket,
    isMobileSmall,
    isMobile,
    isTablet,
    isDesktop,
    isDesktopWide: screens.xxl === true || viewportWidth >= viewportTargets.desktopUltra,
    isCompact: isMobile || isMobileSmall,
    prefersHover,
    prefersReducedMotion,
  };
}

/** Grid spans that collapse cleanly at every validated viewport. */
export const responsiveSpans = {
  /** Metric tiles: 2-up on phones, 3-up from tablet, 4-up on wide desktop. */
  metric: { xs: 12, sm: 12, md: 8, xl: 6 },
  /** Main ledger column paired with the settlement rail. */
  primary: { xs: 24, lg: 15, xxl: 16 },
  secondary: { xs: 24, lg: 9, xxl: 8 },
  /** Equal halves that stack on phones. */
  half: { xs: 24, sm: 12 },
} as const;

/** Bottom padding that keeps content clear of the fixed mobile navigation. */
export function mobileContentInset(isMobile: boolean): number {
  return isMobile ? layoutMetrics.mobileNavHeight + 16 : 0;
}

import type { ThemeConfig } from 'antd';
import type { CSSProperties } from 'react';
import type { CurrencyCode } from '../types';
import { ZERO_EPSILON } from '../utils/currency';

/**
 * "Clean Finance & Soft Mint" design foundation.
 *
 * This module is the single source of truth for colour, spacing, motion,
 * elevation, breakpoints and Ant Design token overrides. Components never
 * hardcode a hex value: they import a token, so re-theming stays a one-file
 * change.
 */

/* ------------------------------------------------------------------ palette */

export const mintPalette = {
  /** Primary brand mint: credit, wealth, primary actions. */
  primary: '#00A86B',
  /** Hover/active mint for interactive surfaces. */
  primaryHover: '#059669',
  primaryActive: '#047857',
  /** Canvas surfaces for cards and elevated panels. */
  tint50: '#F0FDF7',
  /** Soft hover states, badge accents, paid-status backgrounds. */
  tint100: '#DCFCE7',
  /** Higher-contrast mint tint for chips inside tinted panels. */
  tint200: '#A7F3D0',
  /** High-contrast typography for primary labels on light mint backgrounds. */
  dark700: '#047857',
  dark800: '#065F46',
  /** Negative balances ("you owe"). */
  debtCrimson: '#E11D48',
  debtTint: '#FFF1F2',
  /** Positive balances ("you are owed"). */
  creditJade: '#059669',
  slateDark: '#0F172A',
  slateBody: '#334155',
  slateMuted: '#64748B',
  slateFaint: '#94A3B8',
  slateBorder: '#E2E8F0',
  slateDivider: '#EDF2F7',
  surface: '#FFFFFF',
  canvas: '#F8FAFC',
  warning: '#F59E0B',
  warningTint: '#FEF3C7',
} as const;

/* ------------------------------------------------------------------- tones */

export type BalanceTone = 'credit' | 'debit' | 'settled';

export interface ToneStyle {
  /** Foreground for numerals and labels. */
  text: string;
  /** Subdued surface tinted for the tone. */
  surface: string;
  /** Border that reads as part of the tone family. */
  border: string;
  /** Solid fill for accents and bars. */
  solid: string;
}

export const BALANCE_TONES: Record<BalanceTone, ToneStyle> = {
  credit: {
    text: mintPalette.creditJade,
    surface: mintPalette.tint50,
    border: mintPalette.tint100,
    solid: mintPalette.primary,
  },
  debit: {
    text: mintPalette.debtCrimson,
    surface: mintPalette.debtTint,
    border: '#FECDD3',
    solid: mintPalette.debtCrimson,
  },
  settled: {
    text: mintPalette.slateMuted,
    surface: '#F1F5F9',
    border: mintPalette.slateBorder,
    solid: mintPalette.slateFaint,
  },
};

/**
 * Classifies a signed balance into a design tone.
 *
 * Anything inside half a penny is treated as settled so a ledger that is
 * arithmetically zero never renders as a debt.
 */
export function resolveBalanceTone(
  amount: number,
  epsilon: number = ZERO_EPSILON
): BalanceTone {
  if (!Number.isFinite(amount)) return 'settled';
  if (amount > epsilon) return 'credit';
  if (amount < -epsilon) return 'debit';
  return 'settled';
}

export function toneLabel(tone: BalanceTone): string {
  if (tone === 'credit') return 'You are owed';
  if (tone === 'debit') return 'You owe';
  return 'Settled up';
}

/* -------------------------------------------------------------- dimensions */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const elevation = {
  flat: 'none',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
  lg: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.05)',
  /** Sticky bars that must read above scrolling content. */
  bar: '0 -1px 3px 0 rgba(15, 23, 42, 0.06)',
  /** Primary buttons carrying the mint accent. */
  primary: '0 2px 4px 0 rgba(0, 168, 107, 0.25)',
} as const;

/** Minimum interactive size for thumbs. iOS HIG asks for 44px. */
export const touchTarget = {
  min: 44,
  comfortable: 48,
  compact: 38,
} as const;

export const zIndex = {
  content: 1,
  stickyHeader: 100,
  drawer: 1000,
  bottomNav: 999,
  overlay: 1050,
} as const;

/* ------------------------------------------------------------- typography */

export const typography = {
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  /** Applied to every monetary numeral so columns of figures line up. */
  numericFontFeature: 'tabular-nums',
  sizes: {
    caption: 11,
    small: 12,
    body: 14,
    bodyLg: 15,
    subtitle: 16,
    title: 18,
    heading: 22,
    display: 28,
    hero: 34,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 800,
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    /** Uppercase eyebrow labels in dense tiles. */
    wide: '0.05em',
  },
} as const;

/** Shared style for any element that renders money. */
export const numericTextStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: typography.letterSpacing.tight,
};

/* ------------------------------------------------------------ breakpoints */

/**
 * Viewport validation targets from the specification.
 *
 * `mobileSmall` is the 360px floor (single column, full-width controls),
 * `mobile` covers 390-430px, `tablet` is 768px, `desktop` starts at 1024px.
 */
export const viewportTargets = {
  mobileSmall: 360,
  mobile: 390,
  mobileLarge: 430,
  tablet: 768,
  desktop: 1024,
  desktopWide: 1280,
  desktopUltra: 1440,
} as const;

export const layoutMetrics = {
  headerHeight: 60,
  /** Extra bottom padding so the fixed mobile nav never covers content. */
  mobileNavHeight: 60,
  sidebarWidth: 240,
  maxContentWidth: 1320,
  maxNarrowContentWidth: 720,
} as const;

/* ------------------------------------------------------------------ motion */

export interface MotionTokens {
  fast: string;
  base: string;
  slow: string;
  ease: string;
  /** Builds a `transition` shorthand that respects the shared easing curve. */
  transition: (property: string, duration?: string) => string;
}

export const motion: MotionTokens = {
  fast: '0.15s',
  base: '0.2s',
  slow: '0.3s',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Respects users who ask the OS to reduce animation. */
  transition: (property: string, duration: string = '0.2s'): string =>
    `${property} ${duration} cubic-bezier(0.4, 0, 0.2, 1)`,
};

/* ------------------------------------------------------- currency accents */

/** Accent colour per currency, used by chips and currency selectors. */
export const CURRENCY_ACCENTS: Record<CurrencyCode, string> = {
  USD: '#00A86B',
  EUR: '#2563EB',
  GBP: '#7C3AED',
  JPY: '#DC2626',
  CAD: '#DC2626',
  AUD: '#0891B2',
  INR: '#EA580C',
  SGD: '#DB2777',
};

/* ------------------------------------------------- ant design token theme */

export const cleanFinanceMintTheme: ThemeConfig = {
  token: {
    colorPrimary: mintPalette.primary,
    colorInfo: mintPalette.primary,
    colorSuccess: mintPalette.creditJade,
    colorWarning: mintPalette.warning,
    colorError: mintPalette.debtCrimson,
    colorTextBase: mintPalette.slateDark,
    colorBgBase: mintPalette.surface,
    colorBgLayout: mintPalette.canvas,
    colorBorder: mintPalette.slateBorder,
    colorBorderSecondary: mintPalette.slateDivider,
    borderRadius: radii.md,
    borderRadiusLG: radii.lg,
    borderRadiusSM: radii.sm,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontSizeHeading1: typography.sizes.display,
    fontSizeHeading2: typography.sizes.heading,
    fontSizeHeading3: typography.sizes.title,
    boxShadow: elevation.sm,
    boxShadowSecondary: elevation.md,
    controlHeight: touchTarget.compact,
    controlHeightLG: 46,
    controlHeightSM: 30,
    wireframe: false,
  },
  components: {
    Button: {
      fontWeight: typography.weights.semibold,
      controlHeight: touchTarget.compact,
      controlHeightLG: 46,
      primaryShadow: elevation.primary,
      defaultBorderColor: '#CBD5E1',
      paddingInline: spacing.lg,
    },
    Card: {
      paddingLG: spacing.xl,
      colorBorderSecondary: mintPalette.slateDivider,
      headerFontSize: typography.sizes.subtitle,
    },
    Table: {
      headerBg: mintPalette.tint50,
      headerColor: mintPalette.dark700,
      rowHoverBg: mintPalette.canvas,
      headerSplitColor: 'transparent',
      cellPaddingBlock: spacing.md,
    },
    Tabs: {
      itemSelectedColor: mintPalette.primary,
      itemHoverColor: mintPalette.primaryHover,
      inkBarColor: mintPalette.primary,
    },
    Modal: {
      borderRadiusLG: radii.xl,
      titleFontSize: typography.sizes.title,
    },
    Drawer: {
      paddingLG: spacing.xl,
    },
    Segmented: {
      itemSelectedBg: mintPalette.surface,
      itemSelectedColor: mintPalette.dark700,
      trackBg: '#F1F5F9',
      trackPadding: 3,
    },
    Input: {
      paddingBlock: spacing.sm,
    },
    Select: {
      optionSelectedBg: mintPalette.tint50,
      optionSelectedColor: mintPalette.dark700,
    },
    Tag: {
      defaultBg: '#F1F5F9',
      defaultColor: mintPalette.slateBody,
      borderRadiusSM: radii.sm,
    },
    Statistic: {
      titleFontSize: typography.sizes.small,
      contentFontSize: typography.sizes.heading,
    },
    Progress: {
      defaultColor: mintPalette.primary,
      remainingColor: mintPalette.slateDivider,
    },
    Empty: {
      colorTextDescription: mintPalette.slateMuted,
    },
    Message: {
      contentPadding: '10px 16px',
    },
    Popconfirm: {
      fontWeightStrong: typography.weights.semibold,
    },
  },
};

/** Ant Design breakpoint keys mapped onto the validation targets. */
export const antdBreakpoints = {
  xs: viewportTargets.mobileSmall,
  sm: 576,
  md: viewportTargets.tablet,
  lg: 992,
  xl: 1200,
  xxl: 1600,
} as const;

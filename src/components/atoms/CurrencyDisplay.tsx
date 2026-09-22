import type { CSSProperties, FC } from 'react';
import { Tooltip } from 'antd';
import type { CurrencyCode } from '../../types';
import {
  BALANCE_TONES,
  mintPalette,
  numericTextStyle,
  resolveBalanceTone,
  typography,
} from '../../theme';
import { renderMoney } from '../../utils/currency';

export { renderMoney };

/**
 * The canonical money renderer.
 *
 * Every amount shown anywhere in the app goes through this atom, so three
 * invariants hold everywhere: numerals are tabular (columns of figures line up),
 * the currency's own precision is respected (¥100 has no decimals), and the sign
 * is never ambiguous once the value is tinted by balance tone.
 */

export type CurrencyDisplaySize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

export interface CurrencyDisplayProps {
  /** Signed amount in major units. Positive reads as credit, negative as debt. */
  amount: number;
  currency?: CurrencyCode;
  /** Tints the value by balance tone (jade for credit, crimson for debt). */
  colored?: boolean;
  size?: CurrencyDisplaySize;
  /** Force a `+` on positive values; negative values always carry `-`. */
  showSign?: boolean;
  /** Overrides the currency's default minor-unit precision. */
  precision?: number;
  /** Renders `$1.2K` / `$3.4M` for dense tiles and chart labels. */
  compact?: boolean;
  /** Uppercase context rendered before the amount, e.g. "you lent". */
  prefix?: string;
  /** Context rendered after the amount, e.g. "each". */
  suffix?: string;
  /** Renders in a dimmed neutral tone, overriding `colored`. */
  muted?: boolean;
  /** Shows the exact, fully-precise value on hover (useful with `compact`). */
  tooltip?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SIZE_STYLES: Record<CurrencyDisplaySize, { fontSize: number; fontWeight: number }> = {
  sm: { fontSize: typography.sizes.small, fontWeight: typography.weights.semibold },
  md: { fontSize: typography.sizes.bodyLg, fontWeight: typography.weights.semibold },
  lg: { fontSize: typography.sizes.heading, fontWeight: typography.weights.bold },
  xl: { fontSize: typography.sizes.display, fontWeight: typography.weights.bold },
  hero: { fontSize: typography.sizes.hero, fontWeight: typography.weights.black },
};

/** Formats a signed amount at an explicit precision, with an explicit sign. */

export const CurrencyDisplay: FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  colored = false,
  size = 'md',
  showSign = false,
  precision,
  compact = false,
  prefix,
  suffix,
  muted = false,
  tooltip = false,
  className,
  style,
}) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const tone = resolveBalanceTone(safeAmount);
  const sizeStyle = SIZE_STYLES[size];

  const color = muted ? BALANCE_TONES.settled.text : colored ? BALANCE_TONES[tone].text : mintPalette.slateDark;

  // Always available to assistive tech, and reused as the hover tooltip.
  const exact = renderMoney(safeAmount, currency, { precision, showSign });
  const rendered = renderMoney(safeAmount, currency, { precision, showSign, compact });

  const accessorySize = Math.max(10, Math.round(sizeStyle.fontSize * 0.6));

  const body = (
    <span
      className={className}
      aria-label={exact}
      style={{
        ...numericTextStyle,
        color,
        fontSize: sizeStyle.fontSize,
        fontWeight: sizeStyle.fontWeight,
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        whiteSpace: 'nowrap',
        lineHeight: 1.25,
        ...style,
      }}
    >
      {prefix ? (
        <span
          style={{
            fontSize: accessorySize,
            fontWeight: typography.weights.semibold,
            color: BALANCE_TONES.settled.text,
            letterSpacing: typography.letterSpacing.wide,
            textTransform: 'uppercase',
          }}
        >
          {prefix}
        </span>
      ) : null}
      <span aria-hidden="true">{rendered}</span>
      {suffix ? (
        <span
          style={{
            fontSize: accessorySize,
            fontWeight: typography.weights.medium,
            color: BALANCE_TONES.settled.text,
          }}
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );

  if (!tooltip) return body;

  return (
    <Tooltip title={exact} placement="top">
      {body}
    </Tooltip>
  );
};

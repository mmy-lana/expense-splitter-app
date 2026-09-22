import type { CSSProperties, FC, MouseEventHandler, ReactNode } from 'react';
import type { CurrencyCode } from '../../types';
import { BALANCE_TONES, mintPalette, resolveBalanceTone, typography } from '../../theme';
import type { BalanceTone } from '../../theme';
import { CurrencyDisplay } from './CurrencyDisplay';
import type { CurrencyDisplaySize } from './CurrencyDisplay';

/**
 * Rounded status pill for a signed monetary value.
 *
 * Three visual states are guaranteed and designed, never accidental:
 *   credit  -> mint tint with jade text ("you are owed")
 *   debit   -> rose tint with crimson text ("you owe")
 *   settled -> slate tint with muted text ("settled")
 */

export type MintBadgeVariant = 'soft' | 'outline' | 'solid';
export type MintBadgeSize = 'sm' | 'md';

export interface MintBadgeProps {
  amount: number;
  currency?: CurrencyCode;
  /** Overrides tone inference; use for pre-resolved states such as "paid". */
  tone?: BalanceTone;
  /** Uppercase context label rendered inside the pill. */
  label?: string;
  /** Leading glyph, e.g. an arrow indicating direction. */
  icon?: ReactNode;
  variant?: MintBadgeVariant;
  size?: MintBadgeSize;
  /** Adds an explicit `+`/`-` to the value. */
  showSign?: boolean;
  /** Skips rendering the amount, leaving a label-only pill. */
  hideAmount?: boolean;
  /** Renders the pill as an interactive control. */
  onClick?: MouseEventHandler<HTMLSpanElement>;
  className?: string;
  style?: CSSProperties;
}

const SIZE_STYLES: Record<MintBadgeSize, { padding: string; fontSize: number; gap: number }> = {
  sm: { padding: '1px 8px', fontSize: typography.sizes.caption, gap: 4 },
  md: { padding: '3px 10px', fontSize: typography.sizes.small, gap: 6 },
};

const AMOUNT_SIZE: Record<MintBadgeSize, CurrencyDisplaySize> = {
  sm: 'sm',
  md: 'md',
};

function resolveToneStyles(
  tone: BalanceTone,
  variant: MintBadgeVariant
): { background: string; color: string; border: string } {
  const palette = BALANCE_TONES[tone];

  if (variant === 'solid') {
    return { background: palette.solid, color: mintPalette.surface, border: palette.solid };
  }
  if (variant === 'outline') {
    return { background: 'transparent', color: palette.text, border: palette.border };
  }
  return { background: palette.surface, color: palette.text, border: palette.border };
}

export const MintBadge: FC<MintBadgeProps> = ({
  amount,
  currency = 'USD',
  tone,
  label,
  icon,
  variant = 'soft',
  size = 'md',
  showSign = false,
  hideAmount = false,
  onClick,
  className,
  style,
}) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const resolvedTone = tone ?? resolveBalanceTone(safeAmount);
  const styles = resolveToneStyles(resolvedTone, variant);
  const sizing = SIZE_STYLES[size];

  const interactive = typeof onClick === 'function';

  return (
    <span
      className={className}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
              }
            }
          : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizing.gap,
        padding: sizing.padding,
        borderRadius: 999,
        backgroundColor: styles.background,
        color: styles.color,
        border: `1px solid ${styles.border}`,
        fontSize: sizing.fontSize,
        fontWeight: typography.weights.semibold,
        lineHeight: 1.7,
        whiteSpace: 'nowrap',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        ...style,
      }}
    >
      {icon ? (
        <span
          aria-hidden="true"
          style={{ display: 'inline-flex', alignItems: 'center', fontSize: sizing.fontSize + 2 }}
        >
          {icon}
        </span>
      ) : null}

      {label ? (
        <span
          style={{
            letterSpacing: typography.letterSpacing.wide,
            textTransform: 'uppercase',
            fontSize: sizing.fontSize - (size === 'md' ? 1 : 0),
            opacity: variant === 'solid' ? 0.92 : 0.78,
          }}
        >
          {label}
        </span>
      ) : null}

      {!hideAmount ? (
        <CurrencyDisplay
          amount={safeAmount}
          currency={currency}
          size={AMOUNT_SIZE[size]}
          showSign={showSign}
          style={{ color: styles.color }}
        />
      ) : null}
    </span>
  );
};

/**
 * Pill for non-monetary state, e.g. "Settled", "Settlement", "You".
 *
 * Kept alongside `MintBadge` so every pill in the app shares one geometry and
 * one set of tone pairs.
 */
export interface StatusPillProps {
  children: ReactNode;
  tone?: BalanceTone | 'info' | 'warning';
  variant?: MintBadgeVariant;
  size?: MintBadgeSize;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const StatusPill: FC<StatusPillProps> = ({
  children,
  tone = 'settled',
  variant = 'soft',
  size = 'sm',
  icon,
  className,
  style,
}) => {
  const sizing = SIZE_STYLES[size];

  const resolved: BalanceTone =
    tone === 'info' ? 'credit' : tone === 'warning' ? 'settled' : tone;

  const accent: { background: string; color: string; border: string; solid: string } =
    tone === 'info'
      ? { background: '#E0F2FE', color: '#0284C7', border: '#BAE6FD', solid: '#0284C7' }
      : tone === 'warning'
        ? {
            background: mintPalette.warningTint,
            color: '#B45309',
            border: '#FDE68A',
            solid: mintPalette.warning,
          }
        : { ...resolveToneStyles(resolved, variant), solid: BALANCE_TONES[resolved].solid };

  const background = variant === 'solid' ? accent.solid : variant === 'outline' ? 'transparent' : accent.background;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizing.gap,
        padding: sizing.padding,
        borderRadius: 999,
        backgroundColor: background,
        color: variant === 'solid' ? mintPalette.surface : accent.color,
        border: `1px solid ${variant === 'solid' ? accent.solid : accent.border}`,
        fontSize: sizing.fontSize,
        fontWeight: typography.weights.semibold,
        lineHeight: 1.7,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
};

/** Convenience wrapper: the net-balance pill used by every ledger header. */
export interface BalanceBadgeProps {
  amount: number;
  currency?: CurrencyCode;
  label?: string;
  size?: MintBadgeSize;
  variant?: MintBadgeVariant;
  className?: string;
  style?: CSSProperties;
}

export const BalanceBadge: FC<BalanceBadgeProps> = ({
  amount,
  currency = 'USD',
  label,
  size = 'md',
  variant = 'soft',
  className,
  style,
}) => {
  const tone = resolveBalanceTone(amount);
  const fallbackLabel =
    label ?? (tone === 'credit' ? 'You are owed' : tone === 'debit' ? 'You owe' : 'Settled');

  return (
    <MintBadge
      amount={amount}
      currency={currency}
      tone={tone}
      label={fallbackLabel}
      variant={variant}
      size={size}
      showSign={tone !== 'settled'}
      className={className}
      style={style}
    />
  );
};

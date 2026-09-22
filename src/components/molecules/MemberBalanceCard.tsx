import type { CSSProperties, FC } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import type { CurrencyCode, UUID, UserProfile } from '../../types';
import { BALANCE_TONES, elevation, mintPalette, motion, radii, spacing, touchTarget, typography } from '../../theme';
import { resolveBalanceTone } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { renderMoney } from '../../utils/currency';

/**
 * Friend/member balance tile.
 *
 * Answers one question at a glance — "where do I stand with this person?" — and
 * offers the single action that resolves it. Positive net means they owe you,
 * negative means you owe them, and anything inside half a penny is settled.
 */

export interface MemberBalanceCardProps {
  user: UserProfile;
  /** Signed net balance from the current user's perspective. */
  netBalance: number;
  /** What this person fronted in total, for context. */
  totalPaid?: number;
  /** What this person's share came to in total. */
  totalOwed?: number;
  currency?: CurrencyCode;
  /** Number of shared expenses with this person. */
  sharedExpenseCount?: number;
  /** Number of outstanding transfers that involve this person. */
  pendingTransferCount?: number;
  /** Marks the tile as the active selection in a list/detail split view. */
  selected?: boolean;
  onSelect?: (userId: UUID) => void;
  onSettle?: (userId: UUID) => void;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const MemberBalanceCard: FC<MemberBalanceCardProps> = ({
  user,
  netBalance,
  totalPaid,
  totalOwed,
  currency = 'USD',
  sharedExpenseCount,
  pendingTransferCount,
  selected = false,
  onSelect,
  onSettle,
  compact = false,
  className,
  style,
}) => {
  const tone = resolveBalanceTone(netBalance);
  const palette = BALANCE_TONES[tone];

  const directionLabel =
    tone === 'credit' ? 'owes you' : tone === 'debit' ? 'you owe' : 'settled up';

  const actionable = tone !== 'settled';

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0, flex: 1 }}>
        <UserAvatar
          name={user.name}
          avatarUrl={user.avatarUrl}
          size={compact ? 'md' : 'lg'}
          status={tone}
          statusLabel={`${user.name} ${directionLabel} ${renderMoney(Math.abs(netBalance), currency)}`}
          showTooltip={false}
          highlight={selected}
        />

        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Text
            strong
            ellipsis
            style={{ display: 'block', fontSize: typography.sizes.bodyLg, color: mintPalette.slateDark }}
          >
            {user.name}
          </Typography.Text>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: typography.sizes.caption,
                fontWeight: typography.weights.semibold,
                textTransform: 'uppercase',
                letterSpacing: typography.letterSpacing.wide,
                color: palette.text,
              }}
            >
              {directionLabel}
            </span>

            {typeof sharedExpenseCount === 'number' ? (
              <StatusPill>
                {sharedExpenseCount} shared
              </StatusPill>
            ) : null}

            {pendingTransferCount ? (
              <StatusPill tone="warning">
                {pendingTransferCount} pending
              </StatusPill>
            ) : null}
          </div>

          {!compact && (typeof totalPaid === 'number' || typeof totalOwed === 'number') ? (
            <Typography.Text
              type="secondary"
              style={{ display: 'block', fontSize: typography.sizes.small, marginTop: 4 }}
            >
              {typeof totalPaid === 'number' ? `Paid ${renderMoney(totalPaid, currency)}` : null}
              {typeof totalPaid === 'number' && typeof totalOwed === 'number' ? ' \u00b7 ' : null}
              {typeof totalOwed === 'number' ? `Share ${renderMoney(totalOwed, currency)}` : null}
            </Typography.Text>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: compact ? 'flex-end' : 'center',
          gap: spacing.sm,
          flexShrink: 0,
          flexDirection: compact ? 'column' : 'row',
        }}
      >
        <CurrencyDisplay
          amount={Math.abs(netBalance)}
          currency={currency}
          colored
          showSign={tone !== 'settled'}
          size={compact ? 'md' : 'lg'}
        />

        {onSettle && actionable ? (
          <Tooltip title={`Record a payment between you and ${user.name.split(' ')[0]}`}>
            <Button
              type="primary"
              size="small"
              icon={<SwapOutlined />}
              className="mint-touch-target"
              onClick={(event) => {
                event.stopPropagation();
                onSettle(user.id);
              }}
              style={{ backgroundColor: mintPalette.primary }}
            >
              Settle
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </>
  );

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: compact ? `${spacing.sm}px ${spacing.md}px` : `${spacing.md}px ${spacing.lg}px`,
    borderRadius: radii.lg,
    border: `1px solid ${selected ? mintPalette.tint200 : mintPalette.slateDivider}`,
    backgroundColor: selected ? mintPalette.tint50 : mintPalette.surface,
    boxShadow: selected ? `0 0 0 3px ${mintPalette.tint100}` : elevation.sm,
    transition: motion.transition('background-color, border-color, box-shadow', motion.fast),
    minHeight: touchTarget.min,
    ...style,
  };

  if (!onSelect) {
    return (
      <div className={className} style={containerStyle}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect(user.id)}
      aria-pressed={selected}
      style={{
        ...containerStyle,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      {content}
    </button>
  );
};

/**
 * Skeleton placeholder used while `useLiveQuery` resolves the first ledger read.
 */
export interface MemberBalanceCardSkeletonProps {
  className?: string;
}

export const MemberBalanceCardSkeleton: FC<MemberBalanceCardSkeletonProps> = ({ className }) => (
  <div
    className={className}
    aria-hidden="true"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: `${spacing.md}px ${spacing.lg}px`,
      borderRadius: radii.lg,
      border: `1px solid ${mintPalette.slateDivider}`,
      backgroundColor: mintPalette.surface,
    }}
  >
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        backgroundColor: mintPalette.slateDivider,
        flexShrink: 0,
      }}
    />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ width: '45%', height: 12, borderRadius: 4, backgroundColor: mintPalette.slateDivider }} />
      <div style={{ width: '30%', height: 10, borderRadius: 4, backgroundColor: mintPalette.slateDivider }} />
    </div>
    <div style={{ width: 72, height: 18, borderRadius: 4, backgroundColor: mintPalette.slateDivider }} />
  </div>
);

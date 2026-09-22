import type { CSSProperties, FC } from 'react';
import { Button, Card, Empty, Tooltip, Typography } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, ThunderboltFilled } from '@ant-design/icons';
import type { DebtTransfer, UUID, UserProfile, UserProfileMap } from '../../types';
import {
  BALANCE_TONES,
  mintPalette,
  radii,
  spacing,
  typography,
} from '../../theme';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { UserAvatar } from '../atoms/UserAvatar';
import { StatusPill } from '../atoms/MintBadge';
import { calculateOutstandingTotal, calculateTransferImpact } from '../../utils/debtEngine';
import { renderMoney } from '../../utils/currency';

/**
 * Visualises the minimum cash-flow settlement plan.
 *
 * In an unsimplified ledger N people can owe each other in up to N(N-1)/2
 * directions. This card shows the reconciled plan instead: at most N-1 payments
 * that clear every balance exactly. Transfers involving the signed-in user are
 * promoted to the top and given the one action that matters — settle now.
 */

export interface DebtSimplificationCardProps {
  transfers: DebtTransfer[];
  membersMap: UserProfileMap;
  currentUserId: UUID;
  /** Ledger label, used in the empty and summary copy. */
  groupName?: string;
  /** Opens the settlement wizard pre-filled with a suggested transfer. */
  onSettleTransfer?: (transfer: DebtTransfer) => void;
  /** Renders every transfer, including the ones between other people. */
  showAllTransfers?: boolean;
  /** Hides the audit line explaining how many payments were avoided. */
  showSavingsNote?: boolean;
  /** Number of directional debts in the raw ledger, for the savings note. */
  rawDebtCount?: number;
  className?: string;
  style?: CSSProperties;
}

interface TransferRowProps {
  transfer: DebtTransfer;
  membersMap: UserProfileMap;
  currentUserId: UUID;
  onSettle?: (transfer: DebtTransfer) => void;
}

const TransferRow: FC<TransferRowProps> = ({ transfer, membersMap, currentUserId, onSettle }) => {
  const fromUser = membersMap.get(transfer.fromUserId);
  const toUser = membersMap.get(transfer.toUserId);

  const iAmPayer = transfer.fromUserId === currentUserId;
  const iAmReceiver = transfer.toUserId === currentUserId;
  const involvesMe = iAmPayer || iAmReceiver;

  const labelFor = (user: UserProfile | undefined, isMe: boolean): string => {
    if (isMe) return 'You';
    if (!user) return 'Unknown';
    return user.name.split(' ')[0];
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: radii.md,
        border: `1px solid ${involvesMe ? mintPalette.tint200 : mintPalette.slateBorder}`,
        backgroundColor: involvesMe ? mintPalette.tint50 : mintPalette.canvas,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0, flex: 1 }}>
        <UserAvatar
          name={fromUser?.name ?? 'Unknown'}
          avatarUrl={fromUser?.avatarUrl}
          size="sm"
          status={iAmPayer ? 'debit' : undefined}
          highlight={iAmPayer}
        />
        <Typography.Text strong ellipsis style={{ fontSize: typography.sizes.body, maxWidth: 96 }}>
          {labelFor(fromUser, iAmPayer)}
        </Typography.Text>

        <ArrowRightOutlined style={{ color: mintPalette.slateFaint, fontSize: 12 }} />

        <UserAvatar
          name={toUser?.name ?? 'Unknown'}
          avatarUrl={toUser?.avatarUrl}
          size="sm"
          status={iAmReceiver ? 'credit' : undefined}
          highlight={iAmReceiver}
        />
        <Typography.Text strong ellipsis style={{ fontSize: typography.sizes.body, maxWidth: 96 }}>
          {labelFor(toUser, iAmReceiver)}
        </Typography.Text>

        {involvesMe ? (
          <StatusPill tone={iAmPayer ? 'debit' : 'credit'}>
            {iAmPayer ? 'you pay' : 'you receive'}
          </StatusPill>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexShrink: 0 }}>
        <CurrencyDisplay
          amount={transfer.amount}
          currency={transfer.currency}
          colored={involvesMe}
          size="md"
        />

        {involvesMe && onSettle ? (
          <Tooltip title={`Record this payment of ${renderMoney(transfer.amount, transfer.currency)}`}>
            <Button
              type="primary"
              size="small"
              onClick={() => onSettle(transfer)}
              style={{ backgroundColor: mintPalette.primary, minHeight: 32 }}
            >
              Settle
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
};

export const DebtSimplificationCard: FC<DebtSimplificationCardProps> = ({
  transfers,
  membersMap,
  currentUserId,
  groupName,
  onSettleTransfer,
  showAllTransfers = true,
  showSavingsNote = true,
  rawDebtCount,
  className,
  style,
}) => {
  const ledgerLabel = groupName ?? 'this ledger';

  // Transfers that involve me come first: they are the only actionable ones.
  const sortedTransfers = [
    ...transfers.filter((t) => t.fromUserId === currentUserId || t.toUserId === currentUserId),
    ...transfers.filter((t) => t.fromUserId !== currentUserId && t.toUserId !== currentUserId),
  ];

  const visibleTransfers = showAllTransfers
    ? sortedTransfers
    : sortedTransfers.filter(
        (t) => t.fromUserId === currentUserId || t.toUserId === currentUserId
      );

  if (transfers.length === 0) {
    return (
      <Card
        className={className}
        style={{
          borderRadius: radii.lg,
          backgroundColor: mintPalette.tint50,
          border: `1px solid ${mintPalette.tint100}`,
          textAlign: 'center',
          ...style,
        }}
        styles={{ body: { padding: `${spacing.xxl}px ${spacing.lg}px` } }}
      >
        <CheckCircleFilled style={{ fontSize: 40, color: mintPalette.primary, marginBottom: spacing.md }} />
        <Typography.Title level={4} style={{ margin: 0, color: mintPalette.dark800 }}>
          All settled up
        </Typography.Title>
        <Typography.Text type="secondary" style={{ color: mintPalette.dark700 }}>
          Nothing is outstanding in {ledgerLabel}.
        </Typography.Text>
      </Card>
    );
  }

  const myImpact = calculateTransferImpact(transfers, currentUserId);
  const outstanding = calculateOutstandingTotal(transfers);
  const savedPayments =
    rawDebtCount !== undefined && rawDebtCount > transfers.length
      ? rawDebtCount - transfers.length
      : 0;

  if (visibleTransfers.length === 0) {
    return (
      <Card
        className={className}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.sm }}>
            <ThunderboltFilled style={{ color: mintPalette.primary }} />
            Simplified settlements
          </span>
        }
        style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, ...style }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`You are not involved in the ${transfers.length} outstanding payment${transfers.length === 1 ? '' : 's'} in ${ledgerLabel}.`}
        />
      </Card>
    );
  }

  return (
    <Card
      className={className}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <ThunderboltFilled style={{ color: mintPalette.primary }} />
          <span>Simplified settlements</span>
          <StatusPill tone="info" style={{ marginLeft: 'auto' }}>
            {transfers.length} payment{transfers.length === 1 ? '' : 's'}
          </StatusPill>
        </div>
      }
      style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, ...style }}
      styles={{ body: { padding: spacing.lg } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {visibleTransfers.map((transfer, index) => (
          <TransferRow
            key={`${transfer.fromUserId}-${transfer.toUserId}-${transfer.amount}-${index}`}
            transfer={transfer}
            membersMap={membersMap}
            currentUserId={currentUserId}
            onSettle={onSettleTransfer}
          />
        ))}
      </div>

      {/* Your own position, stated once, in words and numbers */}
      {myImpact.owes > 0 || myImpact.isOwed > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            marginTop: spacing.md,
            paddingTop: spacing.md,
            borderTop: `1px solid ${mintPalette.slateDivider}`,
            flexWrap: 'wrap',
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Your part of the plan
          </Typography.Text>
          <div style={{ display: 'flex', gap: spacing.lg, flexWrap: 'wrap' }}>
            {myImpact.owes > 0 ? (
              <CurrencyDisplay
                amount={myImpact.owes}
                currency={transfers[0].currency}
                colored
                prefix="you pay"
                size="sm"
              />
            ) : null}
            {myImpact.isOwed > 0 ? (
              <CurrencyDisplay
                amount={myImpact.isOwed}
                currency={transfers[0].currency}
                colored
                prefix="you receive"
                size="sm"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {showSavingsNote ? (
        <Typography.Text
          type="secondary"
          style={{
            display: 'block',
            marginTop: spacing.md,
            fontSize: typography.sizes.caption,
            color: mintPalette.slateMuted,
          }}
        >
          {savedPayments > 0
            ? `The solver resolved ${rawDebtCount} separate debts into ${transfers.length} payment${transfers.length === 1 ? '' : 's'} — ${savedPayments} transfer${savedPayments === 1 ? '' : 's'} avoided.`
            : `${renderMoney(outstanding, transfers[0].currency)} outstanding across ${transfers.length} payment${transfers.length === 1 ? '' : 's'}; every balance clears after these transfers.`}
        </Typography.Text>
      ) : null}
    </Card>
  );
};

/**
 * Ledger-level summary strip: how much the solver saved, and in which direction
 * the signed-in user moves.
 */
export interface DebtSummaryBarProps {
  transfers: DebtTransfer[];
  currentUserId: UUID;
  rawDebtCount: number;
  currency: Parameters<typeof renderMoney>[1];
  className?: string;
  style?: CSSProperties;
}

export const DebtSummaryBar: FC<DebtSummaryBarProps> = ({
  transfers,
  currentUserId,
  rawDebtCount,
  currency,
  className,
  style,
}) => {
  const impact = calculateTransferImpact(transfers, currentUserId);
  const net = impact.isOwed - impact.owes;
  const tone = net > 0.005 ? 'credit' : net < -0.005 ? 'debit' : 'settled';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderRadius: radii.lg,
        backgroundColor: BALANCE_TONES[tone].surface,
        border: `1px solid ${BALANCE_TONES[tone].border}`,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div>
        <Typography.Text
          style={{
            display: 'block',
            fontSize: typography.sizes.caption,
            textTransform: 'uppercase',
            letterSpacing: typography.letterSpacing.wide,
            fontWeight: typography.weights.semibold,
            color: BALANCE_TONES[tone].text,
          }}
        >
          {tone === 'credit' ? 'You are owed' : tone === 'debit' ? 'You owe' : 'Settled up'}
        </Typography.Text>
        <CurrencyDisplay amount={Math.abs(net)} currency={currency} colored size="lg" />
      </div>

      <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
        {rawDebtCount} raw debt{rawDebtCount === 1 ? '' : 's'} → {transfers.length} payment
        {transfers.length === 1 ? '' : 's'}
      </Typography.Text>
    </div>
  );
};

import { useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Popconfirm, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileImageOutlined,
  PaperClipOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ExpenseItem, UUID, UserProfile, UserProfileMap } from '../../types';
import {
  BALANCE_TONES,
  elevation,
  mintPalette,
  motion,
  radii,
  spacing,
  touchTarget,
  typography,
} from '../../theme';
import { CategoryIcon, CategoryTag } from '../atoms/CategoryIcon';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { AvatarStack, UserAvatar } from '../atoms/UserAvatar';
import { calculateExpenseImpact } from '../../utils/debtEngine';
import { describeSplitType } from '../../utils/splitEngine';
import { formatMoney } from '../../utils/currency';

/**
 * A single ledger row.
 *
 * Responsive by construction rather than by media query: the same markup reflows
 * from a two-line phone card into a single-line desktop row, and every action is
 * reachable by tap. Nothing is hidden behind a hover state, because a touch user
 * has no way to hover.
 */

export interface ExpenseRowItemProps {
  expense: ExpenseItem;
  membersMap: UserProfileMap;
  currentUserId: UUID;
  /** Group name shown as a chip when the ledger is a mixed feed. */
  groupName?: string;
  onDelete?: (id: UUID) => void;
  onEdit?: (expense: ExpenseItem) => void;
  /** Opens the receipt lightbox for this expense. */
  onViewReceipt?: (expense: ExpenseItem) => void;
  /** Starts the settle-up flow for this expense's counterparty. */
  onSettle?: (expense: ExpenseItem) => void;
  /** Highlights the row, e.g. when deep-linked from an activity entry. */
  highlighted?: boolean;
  /** Stacks the layout regardless of viewport (used inside narrow rails). */
  dense?: boolean;
  className?: string;
  style?: CSSProperties;
}

function resolveUser(map: UserProfileMap, id: UUID | undefined): UserProfile | undefined {
  if (!id) return undefined;
  return map.get(id);
}

export const ExpenseRowItem: FC<ExpenseRowItemProps> = ({
  expense,
  membersMap,
  currentUserId,
  groupName,
  onDelete,
  onEdit,
  onViewReceipt,
  onSettle,
  highlighted = false,
  dense = false,
  className,
  style,
}) => {
  const [hovered, setHovered] = useState(false);

  const impact = calculateExpenseImpact(expense, currentUserId);
  const primaryPayer = resolveUser(membersMap, expense.paidBy[0]?.userId);
  const participantUsers = expense.splits
    .map((split) => resolveUser(membersMap, split.userId))
    .filter((user): user is UserProfile => user !== undefined);

  const tone = impact.net > 0.005 ? 'credit' : impact.net < -0.005 ? 'debit' : 'settled';

  /* What this row means for the signed-in user, in one sentence. */
  let statusLabel: string;
  if (expense.isSettlement) {
    const payerName =
      resolveUser(membersMap, expense.paidBy[0]?.userId)?.name.split(' ')[0] ?? 'Someone';
    const receiverName =
      resolveUser(membersMap, expense.splits[0]?.userId)?.name.split(' ')[0] ?? 'someone';
    statusLabel =
      expense.paidBy[0]?.userId === currentUserId
        ? `You paid ${receiverName}`
        : expense.splits[0]?.userId === currentUserId
          ? `${payerName} paid you`
          : `${payerName} paid ${receiverName}`;
  } else if (impact.isPayer && impact.net > 0.005) {
    statusLabel = 'You lent';
  } else if (impact.isPayer) {
    statusLabel = 'You paid for yourself';
  } else if (impact.isParticipant) {
    statusLabel = 'You borrowed';
  } else {
    statusLabel = 'Not involved';
  }

  const secondaryLine = (
    <span style={{ whiteSpace: 'nowrap' }}>
      {dayjs(expense.date).format('MMM D, YYYY')}
      {' \u00b7 '}
      {expense.paidBy.length > 1 ? (
        <>Paid by {expense.paidBy.length} people</>
      ) : (
        <>Paid by {primaryPayer?.name ? primaryPayer.name.split(' ')[0] : 'Unknown'}</>
      )}
    </span>
  );

  const iconSize = dense ? 34 : 42;
  const deleteEnabled = Boolean(onDelete);

  return (
    <article
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: dense ? `${spacing.sm}px ${spacing.md}px` : `${spacing.md}px ${spacing.lg}px`,
        borderRadius: radii.lg,
        border: `1px solid ${
          highlighted ? mintPalette.tint200 : hovered ? mintPalette.slateBorder : mintPalette.slateDivider
        }`,
        backgroundColor: expense.isSettlement
          ? mintPalette.tint50
          : hovered
            ? mintPalette.canvas
            : mintPalette.surface,
        boxShadow: highlighted ? `0 0 0 3px ${mintPalette.tint100}` : elevation.sm,
        transition: motion.transition('background-color, border-color, box-shadow', motion.fast),
        flexWrap: dense ? 'wrap' : 'nowrap',
        ...style,
      }}
    >
      {/* Identity: category, description, provenance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0, flex: 1 }}>
        {expense.isSettlement ? (
          <span
            aria-label="Settlement"
            role="img"
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: Math.round(iconSize * 0.28),
              backgroundColor: mintPalette.tint100,
              color: mintPalette.dark700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.round(iconSize * 0.44),
              flexShrink: 0,
            }}
          >
            <SwapOutlined />
          </span>
        ) : (
          <CategoryIcon category={expense.category} size={iconSize} />
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
            <Typography.Text
              strong
              ellipsis
              style={{
                fontSize: dense ? typography.sizes.body : typography.sizes.bodyLg,
                color: expense.isSettlement ? mintPalette.dark700 : mintPalette.slateDark,
                margin: 0,
              }}
            >
              {expense.description}
            </Typography.Text>

            {expense.receiptDataUrl && onViewReceipt ? (
              <Tooltip title="View receipt">
                <Button
                  type="text"
                  aria-label="View receipt"
                  icon={<PaperClipOutlined style={{ color: mintPalette.primary, fontSize: 16 }} />}
                  onClick={() => onViewReceipt(expense)}
                  className="mint-touch-target"
                  style={{ flexShrink: 0, minWidth: 44, minHeight: 44 }}
                />
              </Tooltip>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              marginTop: 2,
              flexWrap: 'wrap',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
              {secondaryLine}
            </Typography.Text>

            {!dense && participantUsers.length > 1 ? (
              <AvatarStack users={participantUsers} size="xs" max={3} />
            ) : null}

            {!dense ? (
              <StatusPill>{describeSplitType(expense.splitType)}</StatusPill>
            ) : null}

            {groupName ? (
              <StatusPill tone="info">{groupName}</StatusPill>
            ) : expense.groupId === null && !dense ? (
              <StatusPill>Direct</StatusPill>
            ) : null}
          </div>

          {expense.notes && !dense ? (
            <Typography.Text
              type="secondary"
              style={{
                display: 'block',
                fontSize: typography.sizes.small,
                marginTop: 4,
                fontStyle: 'italic',
              }}
            >
              {expense.notes}
            </Typography.Text>
          ) : null}
        </div>
      </div>

      {/* Impact for the signed-in user */}
      <div
        style={{
          textAlign: 'right',
          flexShrink: 0,
          minWidth: dense ? undefined : 116,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: typography.sizes.caption,
            fontWeight: typography.weights.semibold,
            textTransform: 'uppercase',
            letterSpacing: typography.letterSpacing.wide,
            color: BALANCE_TONES[tone].text,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>

        {impact.isInvolved ? (
          <CurrencyDisplay
            amount={impact.net !== 0 ? Math.abs(impact.net) : expense.amount}
            currency={expense.currency}
            colored={impact.net !== 0}
            showSign={impact.net !== 0}
            size={dense ? 'sm' : 'md'}
            tooltip={dense}
          />
        ) : (
          <CurrencyDisplay
            amount={expense.amount}
            currency={expense.currency}
            muted
            size={dense ? 'sm' : 'md'}
          />
        )}

        {!dense ? (
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
            Total {formatMoney(expense.amount, expense.currency)}
          </Typography.Text>
        ) : null}
      </div>

      {/* Actions: always visible, always thumb-sized */}
      {onSettle || onEdit || deleteEnabled || (expense.receiptDataUrl && onViewReceipt) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
          {expense.receiptDataUrl && onViewReceipt && dense ? (
            <Button
              type="text"
              aria-label="View receipt"
              icon={<FileImageOutlined />}
              onClick={() => onViewReceipt(expense)}
              className="mint-touch-target"
            />
          ) : null}

          {onSettle ? (
            <Tooltip title="Settle up">
              <Button
                type="text"
                aria-label="Settle up"
                icon={<SwapOutlined />}
                onClick={() => onSettle(expense)}
                className="mint-touch-target"
                style={{ color: mintPalette.primary }}
              />
            </Tooltip>
          ) : null}

          {onEdit ? (
            <Tooltip title="Edit expense">
              <Button
                type="text"
                aria-label="Edit expense"
                icon={<EditOutlined />}
                onClick={() => onEdit(expense)}
                className="mint-touch-target"
              />
            </Tooltip>
          ) : null}

          {deleteEnabled && onDelete ? (
            <Popconfirm
              title="Delete this expense?"
              description="Balances across every member are recalculated immediately."
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(expense.id)}
            >
              <Button
                type="text"
                danger
                aria-label="Delete expense"
                icon={<DeleteOutlined />}
                className="mint-touch-target"
                style={{ minWidth: touchTarget.min }}
              />
            </Popconfirm>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};

/**
 * Compact single-line variant for the activity feed and dense rails.
 *
 * Kept as a separate export rather than a `dense` flag so call sites read
 * explicitly and the two layouts can evolve independently.
 */
export interface ExpenseRowCompactProps {
  expense: ExpenseItem;
  membersMap: UserProfileMap;
  currentUserId: UUID;
  onClick?: (expense: ExpenseItem) => void;
  className?: string;
  style?: CSSProperties;
}

export const ExpenseRowCompact: FC<ExpenseRowCompactProps> = ({
  expense,
  membersMap,
  currentUserId,
  onClick,
  className,
  style,
}) => {
  const impact = calculateExpenseImpact(expense, currentUserId);
  const payer = resolveUser(membersMap, expense.paidBy[0]?.userId);
  const tone = impact.net > 0.005 ? 'credit' : impact.net < -0.005 ? 'debit' : 'settled';

  return (
    <button
      type="button"
      className={className}
      onClick={onClick ? () => onClick(expense) : undefined}
      disabled={!onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        width: '100%',
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: mintPalette.surface,
        border: `1px solid ${mintPalette.slateDivider}`,
        borderRadius: radii.md,
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        ...style,
      }}
    >
      {payer ? (
        <UserAvatar name={payer.name} avatarUrl={payer.avatarUrl} size="sm" showTooltip={false} />
      ) : (
        <CategoryIcon category={expense.category} size={28} showTooltip={false} />
      )}

      <span className="mint-truncate" style={{ flex: 1, fontSize: typography.sizes.body }}>
        {expense.description}
      </span>

      {!impact.isInvolved ? (
        <CategoryTag category={expense.category} size="sm" />
      ) : (
        <CurrencyDisplay
          amount={impact.net !== 0 ? Math.abs(impact.net) : expense.amount}
          currency={expense.currency}
          colored={impact.net !== 0}
          showSign={impact.net !== 0}
          size="sm"
          style={{ color: BALANCE_TONES[tone].text }}
        />
      )}
    </button>
  );
};

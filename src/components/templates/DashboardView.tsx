import { useMemo } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Card, Col, Empty, Row, Skeleton, Typography } from 'antd';
import { PlusCircleOutlined, RightOutlined, TeamOutlined } from '@ant-design/icons';
import type {
  CurrencyCode,
  ExpenseItem,
  Group,
  DebtTransfer,
  UserProfile,
  UserProfileMap,
  UUID,
} from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { AvatarStack } from '../atoms/UserAvatar';
import { ExpenseRowItem } from '../molecules/ExpenseRowItem';
import { MemberBalanceCard } from '../molecules/MemberBalanceCard';
import { DebtSimplificationCard } from '../organisms/DebtSimplificationCard';
import { BalanceCallout } from '../organisms/GroupAnalytics';
import {
  calculateNetBalances,
  calculatePairwiseBalance,
  calculateSimplifiedDebts,
  calculateOutstandingTotal,
  computePersonalTotals,
} from '../../utils/debtEngine';
import { renderMoney } from '../../utils/currency';
import dayjs from 'dayjs';

/**
 * Dashboard.
 *
 * The "where do I stand right now" view: one net figure, the ledgers you are part
 * of, the people you owe or are owed, and the shortest path to zero. Every number
 * comes from the debt engine over the full ledger — nothing here recomputes
 * arithmetic, and settlements are included in balances (they move money) while
 * being excluded from spend analytics.
 */

export interface FriendBalance {
  user: UserProfile;
  netBalance: number;
  totalPaid: number;
  totalOwed: number;
  sharedExpenseCount: number;
}

export interface DashboardViewProps {
  currentUserId: UUID;
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  membersMap: UserProfileMap;
  currency?: CurrencyCode;
  /** Rendered while the first IndexedDB read resolves. */
  loading?: boolean;
  /** Groups the signed-in user belongs to, pre-summarised by the caller. */
  groupSummaries: {
    group: Group;
    memberCount: number;
    expenseCount: number;
    totalSpend: number;
    myNetBalance: number;
  }[];
  onSelectGroup: (groupId: UUID) => void;
  onSelectFriend: (userId: UUID) => void;
  onAddExpense: () => void;
  onNewGroup: () => void;
  onSettleUp: (target?: { fromUserId: UUID; toUserId: UUID; amount: number }) => void;
  onSettleTransfer: (transfer: DebtTransfer) => void;
  onOpenExpense: (expense: ExpenseItem) => void;
  onViewReceipt: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: UUID) => void;
  recentLimit?: number;
  className?: string;
  style?: CSSProperties;
}

export const DashboardView: FC<DashboardViewProps> = ({
  currentUserId,
  users,
  groups,
  expenses,
  membersMap,
  currency = 'USD',
  loading = false,
  groupSummaries,
  onSelectGroup,
  onSelectFriend,
  onAddExpense,
  onNewGroup,
  onSettleUp,
  onSettleTransfer,
  onOpenExpense,
  onViewReceipt,
  onDeleteExpense,
  recentLimit = 8,
  className,
  style,
}) => {
  const personal = useMemo(
    () => computePersonalTotals(currentUserId, expenses, currency),
    [currentUserId, expenses, currency]
  );

  const allUserIds = useMemo(() => users.map((user) => user.id), [users]);

  const transfers = useMemo(
    () => calculateSimplifiedDebts(allUserIds, expenses, currency),
    [allUserIds, expenses, currency]
  );

  const outstanding = useMemo(() => calculateOutstandingTotal(transfers), [transfers]);

  /** Every person the signed-in user shares a ledger with, with their exposure. */
  const friends = useMemo<FriendBalance[]>(() => {
    return users
      .filter((user) => user.id !== currentUserId)
      .map((user) => {
        const shared = expenses.filter(
          (expense) =>
            expense.currency === currency &&
            (expense.paidBy.some((payer) => payer.userId === currentUserId) ||
              expense.splits.some((split) => split.userId === currentUserId)) &&
            (expense.paidBy.some((payer) => payer.userId === user.id) ||
              expense.splits.some((split) => split.userId === user.id))
        );

        return {
          user,
          // "What is between us", not their ledger-wide net: this tile is the
          // entry point to the friend view and must agree with it exactly.
          netBalance: calculatePairwiseBalance(currentUserId, user.id, expenses, currency),
          totalPaid: shared
            .filter((expense) => expense.currency === currency)
            .reduce(
              (total, expense) =>
                total +
                expense.paidBy
                  .filter((payer) => payer.userId === user.id)
                  .reduce((sum, payer) => sum + payer.amountPaid, 0),
              0
            ),
          totalOwed: shared
            .filter((expense) => expense.currency === currency)
            .reduce(
              (total, expense) =>
                total +
                expense.splits
                  .filter((split) => split.userId === user.id)
                  .reduce((sum, split) => sum + split.owedAmount, 0),
              0
            ),
          sharedExpenseCount: shared.length,
        };
      })
      .filter((entry) => entry.sharedExpenseCount > 0 || Math.abs(entry.netBalance) > 0.005)
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  }, [users, expenses, currency, currentUserId]);

  const recentExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.currency === currency)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, recentLimit),
    [expenses, currency, recentLimit]
  );

  /** Raw directional debt count, used to quantify what the solver saved. */
  const rawDebtCount = useMemo(() => {
    const balances = calculateNetBalances(allUserIds, expenses, currency);
    const creditors = Array.from(balances.values()).filter((value) => value.isGreaterThan(0)).length;
    const debtors = Array.from(balances.values()).filter((value) => value.isLessThan(0)).length;
    // An upper bound on distinct obligations, which is what the solver collapses.
    return creditors * debtors;
  }, [allUserIds, expenses, currency]);

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
        <Skeleton active paragraph={{ rows: 3 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  const hasAnyData = expenses.length > 0;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      {/* Your position, in one glance */}
      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24} md={8}>
          <BalanceCallout
            label="Net balance"
            amount={personal.netBalance}
            currency={currency}
            hint={
              personal.netBalance > 0.005
                ? 'Overall you are owed money'
                : personal.netBalance < -0.005
                  ? 'Overall you owe money'
                  : 'Everything is settled'
            }
            style={{ height: '100%' }}
          />
        </Col>
        <Col xs={12} md={8}>
          <div
            style={{
              padding: spacing.lg,
              borderRadius: radii.lg,
              border: `1px solid ${BALANCE_TONES.credit.border}`,
              backgroundColor: mintPalette.surface,
              height: '100%',
            }}
          >
            <Typography.Text
              style={{
                display: 'block',
                fontSize: typography.sizes.caption,
                textTransform: 'uppercase',
                letterSpacing: typography.letterSpacing.wide,
                fontWeight: typography.weights.semibold,
                color: BALANCE_TONES.credit.text,
              }}
            >
              Owed to you
            </Typography.Text>
            <div style={{ marginTop: spacing.xs }}>
              <CurrencyDisplay amount={personal.owedToMe} currency={currency} colored size="lg" />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              You fronted {renderMoney(personal.totalPaid, currency)}
            </Typography.Text>
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div
            style={{
              padding: spacing.lg,
              borderRadius: radii.lg,
              border: `1px solid ${BALANCE_TONES.debit.border}`,
              backgroundColor: mintPalette.surface,
              height: '100%',
            }}
          >
            <Typography.Text
              style={{
                display: 'block',
                fontSize: typography.sizes.caption,
                textTransform: 'uppercase',
                letterSpacing: typography.letterSpacing.wide,
                fontWeight: typography.weights.semibold,
                color: BALANCE_TONES.debit.text,
              }}
            >
              You owe
            </Typography.Text>
            <div style={{ marginTop: spacing.xs }}>
              <CurrencyDisplay amount={personal.iOwe} currency={currency} colored size="lg" />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              Your share is {renderMoney(personal.totalOwed, currency)}
            </Typography.Text>
          </div>
        </Col>
      </Row>

      {!hasAnyData ? (
        <Card
          style={{ borderRadius: radii.lg, border: `1px dashed ${mintPalette.slateBorder}`, textAlign: 'center' }}
          styles={{ body: { padding: `${spacing.xxxl}px ${spacing.lg}px` } }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No expenses yet. Add the first one and MintSplit will work out who owes whom."
          >
            <Button
              type="primary"
              size="large"
              icon={<PlusCircleOutlined />}
              onClick={onAddExpense}
              style={{ backgroundColor: mintPalette.primary }}
            >
              Add your first expense
            </Button>
          </Empty>
        </Card>
      ) : null}

      <Row gutter={[spacing.lg, spacing.lg]}>
        {/* Ledgers */}
        <Col xs={24} xl={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <Card
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.sm }}>
                  <TeamOutlined style={{ color: mintPalette.primary }} />
                  Your ledgers
                  <StatusPill>{groupSummaries.length}</StatusPill>
                </span>
              }
              extra={
                <Button size="small" type="link" onClick={onNewGroup}>
                  New group
                </Button>
              }
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              {groupSummaries.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="You are not in any groups yet. Create one for a trip, a flat, or a project."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {groupSummaries.slice(0, 5).map((summary) => (
                    <button
                      key={summary.group.id}
                      type="button"
                      onClick={() => onSelectGroup(summary.group.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.md,
                        width: '100%',
                        padding: spacing.md,
                        borderRadius: radii.md,
                        border: `1px solid ${mintPalette.slateDivider}`,
                        backgroundColor: mintPalette.surface,
                        cursor: 'pointer',
                        textAlign: 'left',
                        flexWrap: 'wrap',
                        minHeight: 56,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Typography.Text strong ellipsis style={{ display: 'block', fontSize: typography.sizes.bodyLg }}>
                          {summary.group.name}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                          {summary.memberCount} member{summary.memberCount === 1 ? '' : 's'} ·{' '}
                          {summary.expenseCount} expense{summary.expenseCount === 1 ? '' : 's'} ·{' '}
                          {renderMoney(summary.totalSpend, summary.group.currency)} spent
                        </Typography.Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}>
                        <CurrencyDisplay
                          amount={Math.abs(summary.myNetBalance)}
                          currency={summary.group.currency}
                          colored
                          showSign={Math.abs(summary.myNetBalance) > 0.005}
                          size="md"
                        />
                        <RightOutlined style={{ color: mintPalette.slateFaint, fontSize: 12 }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Friends */}
            <Card
              title="People you split with"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              {friends.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No shared expenses yet."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {friends.slice(0, 5).map((friend) => (
                    <MemberBalanceCard
                      key={friend.user.id}
                      user={friend.user}
                      netBalance={friend.netBalance}
                      totalPaid={friend.totalPaid}
                      totalOwed={friend.totalOwed}
                      currency={currency}
                      sharedExpenseCount={friend.sharedExpenseCount}
                      onSelect={onSelectFriend}
                      onSettle={() =>
                        onSettleUp({
                          fromUserId: friend.netBalance < 0 ? currentUserId : friend.user.id,
                          toUserId: friend.netBalance < 0 ? friend.user.id : currentUserId,
                          amount: Math.abs(friend.netBalance),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Col>

        {/* Settlement path + recent activity */}
        <Col xs={24} xl={10}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, minWidth: 280 }}>
            <DebtSimplificationCard
              transfers={transfers}
              membersMap={membersMap}
              currentUserId={currentUserId}
              groupName="every ledger"
              onSettleTransfer={onSettleTransfer}
              rawDebtCount={rawDebtCount}
            />

            <Card
              title="Recent activity"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              {recentExpenses.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded yet." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {recentExpenses.map((expense) => (
                    <ExpenseRowItem
                      key={expense.id}
                      expense={expense}
                      membersMap={membersMap}
                      currentUserId={currentUserId}
                      groupName={
                        expense.groupId ? groups.find((group) => group.id === expense.groupId)?.name : undefined
                      }
                      dense
                      onEdit={onOpenExpense}
                      onViewReceipt={onViewReceipt}
                      onDelete={onDeleteExpense}
                    />
                  ))}
                </div>
              )}

              {outstanding > 0 ? (
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginTop: spacing.md, fontSize: typography.sizes.caption }}
                >
                  {renderMoney(outstanding, currency)} outstanding across every ledger, as of{' '}
                  {dayjs().format('MMM D, YYYY')}.
                </Typography.Text>
              ) : null}

              {friends.length > 0 ? (
                <div style={{ marginTop: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <AvatarStack
                    users={friends.slice(0, 6).map((friend) => ({
                      id: friend.user.id,
                      name: friend.user.name,
                      avatarUrl: friend.user.avatarUrl,
                    }))}
                    size="xs"
                    max={5}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                    {friends.length} people share a ledger with you
                  </Typography.Text>
                </div>
              ) : null}
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
};

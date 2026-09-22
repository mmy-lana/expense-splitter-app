import { useMemo } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Card, Col, Empty, Row, Skeleton, Typography } from 'antd';
import { ArrowLeftOutlined, PlusCircleOutlined, SwapOutlined } from '@ant-design/icons';
import type {
  CurrencyCode,
  ExpenseItem,
  Group,
  UserProfile,
  UserProfileMap,
  UUID,
} from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { ExpenseRowItem } from '../molecules/ExpenseRowItem';
import { MemberBalanceCard } from '../molecules/MemberBalanceCard';
import {
  calculatePairwiseBalance,
  calculateSharedExpenses,
} from '../../utils/debtEngine';
import { renderMoney } from '../../utils/currency';
import dayjs from 'dayjs';

/**
 * One-to-one friend view.
 *
 * Answers "what is between us?" with a pairwise ledger: the net position, every
 * shared expense in order, and the two actions that matter (add another, settle
 * up). The pairwise balance uses proportional payment attribution, so it stays
 * correct even when other people paid into the same expenses.
 */

export interface FriendsDetailViewProps {
  /** The signed-in user. */
  currentUserId: UUID;
  /** The friend being inspected. */
  friend: UserProfile;
  /** Everyone, for the friend switcher rail. */
  users: UserProfile[];
  groups: Group[];
  /** Every expense in the database; this view filters to the shared subset. */
  expenses: ExpenseItem[];
  membersMap: UserProfileMap;
  currency?: CurrencyCode;
  loading?: boolean;
  onBack: () => void;
  onSelectFriend: (userId: UUID) => void;
  onAddExpense: () => void;
  onSettleUp: () => void;
  onEditExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: UUID) => void;
  onViewReceipt: (expense: ExpenseItem) => void;
  className?: string;
  style?: CSSProperties;
}

export const FriendsDetailView: FC<FriendsDetailViewProps> = ({
  currentUserId,
  friend,
  users,
  groups,
  expenses,
  membersMap,
  currency = 'USD',
  loading = false,
  onBack,
  onSelectFriend,
  onAddExpense,
  onSettleUp,
  onEditExpense,
  onDeleteExpense,
  onViewReceipt,
  className,
  style,
}) => {
  const pairwise = useMemo(
    () => calculatePairwiseBalance(currentUserId, friend.id, expenses, currency),
    [currentUserId, friend.id, expenses, currency]
  );

  const sharedExpenses = useMemo(
    () => calculateSharedExpenses(currentUserId, friend.id, expenses),
    [currentUserId, friend.id, expenses]
  );

  /** Which ledger each shared expense belongs to, for the row chips. */
  const groupNameFor = useMemo(() => {
    const byId = new Map(groups.map((group) => [group.id, group.name]));
    return (groupId: UUID | null): string | undefined =>
      groupId === null ? 'Direct' : byId.get(groupId);
  }, [groups]);

  const myContribution = useMemo(
    () =>
      sharedExpenses
        .filter((expense) => expense.currency === currency)
        .reduce(
          (total, expense) =>
            total +
            expense.paidBy
              .filter((payer) => payer.userId === currentUserId)
              .reduce((sum, payer) => sum + payer.amountPaid, 0),
          0
        ),
    [sharedExpenses, currency, currentUserId]
  );

  const theirContribution = useMemo(
    () =>
      sharedExpenses
        .filter((expense) => expense.currency === currency)
        .reduce(
          (total, expense) =>
            total +
            expense.paidBy
              .filter((payer) => payer.userId === friend.id)
              .reduce((sum, payer) => sum + payer.amountPaid, 0),
          0
        ),
    [sharedExpenses, currency, friend.id]
  );

  const otherFriends = users.filter(
    (user) => user.id !== currentUserId && user.id !== friend.id
  );

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  const settled = Math.abs(pairwise) <= 0.005;
  const tone = settled ? 'settled' : pairwise > 0 ? 'credit' : 'debit';

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ padding: 0, alignSelf: 'flex-start' }}>
        All people
      </Button>

      <Row gutter={[spacing.lg, spacing.lg]}>
        <Col xs={24} lg={15}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <Card
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
                <UserAvatar
                  name={friend.name}
                  avatarUrl={friend.avatarUrl}
                  size="xl"
                  status={tone}
                  statusLabel={`${friend.name} is ${settled ? 'settled up' : pairwise > 0 ? 'owed money by you' : 'owes you money'}`}
                  showTooltip={false}
                />

                <div style={{ flex: 1, minWidth: 200 }}>
                  <Typography.Title level={3} style={{ margin: 0, fontSize: typography.sizes.heading }}>
                    {friend.name}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                    {friend.email}
                  </Typography.Text>

                  <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                    <StatusPill>
                      {sharedExpenses.length} shared expense{sharedExpenses.length === 1 ? '' : 's'}
                    </StatusPill>
                    <StatusPill tone={tone === 'settled' ? 'settled' : tone}>
                      {settled ? 'settled up' : pairwise > 0 ? 'owes you' : 'you owe'}
                    </StatusPill>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <CurrencyDisplay
                    amount={Math.abs(pairwise)}
                    currency={currency}
                    colored
                    showSign={!settled}
                    size="xl"
                  />
                  <Typography.Text
                    type="secondary"
                    style={{ display: 'block', fontSize: typography.sizes.caption }}
                  >
                    {settled ? 'All square' : pairwise > 0 ? 'in your favour' : 'against you'}
                  </Typography.Text>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: spacing.sm,
                  marginTop: spacing.lg,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  type="primary"
                  icon={<PlusCircleOutlined />}
                  onClick={onAddExpense}
                  style={{ backgroundColor: mintPalette.primary, minHeight: 40 }}
                >
                  Add an expense with {friend.name.split(' ')[0]}
                </Button>
                <Button
                  icon={<SwapOutlined />}
                  onClick={onSettleUp}
                  disabled={settled}
                  style={{ minHeight: 40 }}
                >
                  Settle up
                </Button>
              </div>
            </Card>

            <Card
              title={`Shared ledger (${sharedExpenses.length})`}
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              {sharedExpenses.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={`You and ${friend.name.split(' ')[0]} have not split anything yet.`}
                >
                  <Button type="primary" onClick={onAddExpense} style={{ backgroundColor: mintPalette.primary }}>
                    Add the first expense
                  </Button>
                </Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {sharedExpenses.map((expense) => (
                    <ExpenseRowItem
                      key={expense.id}
                      expense={expense}
                      membersMap={membersMap}
                      currentUserId={currentUserId}
                      groupName={groupNameFor(expense.groupId)}
                      onEdit={onEditExpense}
                      onDelete={onDeleteExpense}
                      onViewReceipt={onViewReceipt}
                      onSettle={onSettleUp}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Col>

        <Col xs={24} lg={9}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <Card
              title="Between you two"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                    You have paid
                  </Typography.Text>
                  <CurrencyDisplay amount={myContribution} currency={currency} size="sm" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                    {friend.name.split(' ')[0]} has paid
                  </Typography.Text>
                  <CurrencyDisplay amount={theirContribution} currency={currency} size="sm" />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                    paddingTop: spacing.md,
                    borderTop: `1px solid ${mintPalette.slateDivider}`,
                  }}
                >
                  <Typography.Text strong style={{ fontSize: typography.sizes.body }}>
                    Net position
                  </Typography.Text>
                  <CurrencyDisplay
                    amount={Math.abs(pairwise)}
                    currency={currency}
                    colored
                    showSign={!settled}
                    size="md"
                  />
                </div>

                <Typography.Text
                  type="secondary"
                  style={{ fontSize: typography.sizes.caption, color: BALANCE_TONES[tone].text }}
                >
                  {settled
                    ? 'Nothing outstanding between you.'
                    : pairwise > 0
                      ? `${friend.name.split(' ')[0]} owes you ${renderMoney(pairwise, currency)}.`
                      : `You owe ${friend.name.split(' ')[0]} ${renderMoney(Math.abs(pairwise), currency)}.`}
                </Typography.Text>

                {sharedExpenses.length > 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                    Last shared expense on {dayjs(sharedExpenses[0].date).format('MMM D, YYYY')}.
                  </Typography.Text>
                ) : null}
              </div>
            </Card>

            <Card
              title="Other people"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              {otherFriends.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody else in this ledger." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {otherFriends.map((user) => {
                    const theirBalance = calculatePairwiseBalance(
                      currentUserId,
                      user.id,
                      expenses,
                      currency
                    );
                    return (
                      <MemberBalanceCard
                        key={user.id}
                        user={user}
                        netBalance={theirBalance}
                        currency={currency}
                        sharedExpenseCount={
                          calculateSharedExpenses(currentUserId, user.id, expenses).length
                        }
                        compact
                        onSelect={onSelectFriend}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
};

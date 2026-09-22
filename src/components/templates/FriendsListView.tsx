import { useMemo } from 'react';
import type { CSSProperties, FC } from 'react';
import { Card, Empty, Typography } from 'antd';
import type { CurrencyCode, ExpenseItem, UserProfile, UUID } from '../../types';
import { mintPalette, radii, spacing, typography } from '../../theme';
import { MemberBalanceCard } from '../molecules/MemberBalanceCard';
import { BalanceCallout } from '../organisms/GroupAnalytics';
import {
  calculateOutstandingTotal,
  calculatePairwiseBalance,
  calculateSimplifiedDebts,
  computePersonalTotals,
} from '../../utils/debtEngine';
import { renderMoney } from '../../utils/currency';

/**
 * People list.
 *
 * Every person the signed-in user shares money with, ordered by how much is at
 * stake, with the aggregate position above it. Someone whose balance is settled
 * and who shares no expenses drops out of the list entirely — a contact book is
 * not a ledger.
 */

export interface FriendsListViewProps {
  users: UserProfile[];
  /** Every expense in the database. */
  expenses: ExpenseItem[];
  currentUserId: UUID;
  currency: CurrencyCode;
  loading?: boolean;
  onSelectFriend: (userId: UUID) => void;
  onSettleUp: (fromUserId: UUID, toUserId: UUID, amount: number) => void;
  className?: string;
  style?: CSSProperties;
}

export const FriendsListView: FC<FriendsListViewProps> = ({
  users,
  expenses,
  currentUserId,
  currency,
  loading = false,
  onSelectFriend,
  onSettleUp,
  className,
  style,
}) => {
  const allUserIds = useMemo(() => users.map((user) => user.id), [users]);

  const personal = useMemo(
    () => computePersonalTotals(currentUserId, expenses, currency),
    [currentUserId, expenses, currency]
  );

  const transfers = useMemo(
    () => calculateSimplifiedDebts(allUserIds, expenses, currency),
    [allUserIds, expenses, currency]
  );

  const friends = useMemo(
    () =>
      users
        .filter((user) => user.id !== currentUserId)
        .map((user) => {
          const shared = expenses.filter(
            (expense) =>
              (expense.paidBy.some((payer) => payer.userId === currentUserId) ||
                expense.splits.some((split) => split.userId === currentUserId)) &&
              (expense.paidBy.some((payer) => payer.userId === user.id) ||
                expense.splits.some((split) => split.userId === user.id))
          );

          return {
            user,
            // The tile answers "what is between us", so it must be the *pairwise*
            // balance. A person's ledger-wide net balance is a different number:
            // it nets their dealings with everyone else in as well.
            netBalance: calculatePairwiseBalance(currentUserId, user.id, expenses, currency),
            sharedExpenseCount: shared.length,
            sharedTotal: shared
              .filter((expense) => expense.currency === currency)
              .reduce((total, expense) => total + expense.amount, 0),
          };
        })
        .filter((entry) => entry.sharedExpenseCount > 0 || Math.abs(entry.netBalance) > 0.005)
        .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance)),
    [users, expenses, currency, currentUserId]
  );

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0, fontSize: typography.sizes.heading }}>
          People
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          {friends.length} {friends.length === 1 ? 'person shares' : 'people share'} a ledger with you
        </Typography.Text>
      </div>

      {loading ? null : (
        <>
          <BalanceCallout
            label="Net balance with everyone"
            amount={personal.netBalance}
            currency={currency}
            hint={
              personal.netBalance > 0.005
                ? `You are owed ${renderMoney(personal.owedToMe, currency)} in total`
                : personal.netBalance < -0.005
                  ? `You owe ${renderMoney(personal.iOwe, currency)} in total`
                  : 'Everything is settled'
            }
          />

          {friends.length === 0 ? (
            <Card
              style={{ borderRadius: radii.lg, border: `1px dashed ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.xxxl } }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`${users.length} ${users.length === 1 ? 'person is' : 'people are'} saved, but you have not split anything together yet. Add an expense and pick them as a participant.`}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {friends.map((friend) => {
                const iOwe = friend.netBalance < -0.005;

                return (
                  <MemberBalanceCard
                    key={friend.user.id}
                    user={friend.user}
                    netBalance={friend.netBalance}
                    currency={currency}
                    sharedExpenseCount={friend.sharedExpenseCount}
                    onSelect={onSelectFriend}
                    onSettle={() =>
                      onSettleUp(
                        iOwe ? currentUserId : friend.user.id,
                        iOwe ? friend.user.id : currentUserId,
                        Math.abs(friend.netBalance)
                      )
                    }
                    style={{ marginBottom: 0 }}
                  />
                );
              })}
            </div>
          )}

          {transfers.length > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              {renderMoney(calculateOutstandingTotal(transfers), currency)} outstanding, resolvable in{' '}
              {transfers.length} payment{transfers.length === 1 ? '' : 's'}.
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              Every balance is zero. Nothing to settle.
            </Typography.Text>
          )}
        </>
      )}
    </div>
  );
};

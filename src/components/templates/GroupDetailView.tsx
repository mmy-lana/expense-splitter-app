import { useMemo, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Card, Col, Empty, Popconfirm, Row, Skeleton, Tabs, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  PlusCircleOutlined,
  SwapOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import BigNumber from 'bignumber.js';
import type { DebtTransfer, ExpenseItem, Group, UserProfile, UserProfileMap, UUID } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { StatusPill } from '../atoms/MintBadge';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { CategoryTag } from '../atoms/CategoryIcon';
import { MemberBalanceCard } from '../molecules/MemberBalanceCard';
import { DebtSimplificationCard } from '../organisms/DebtSimplificationCard';
import { GroupAnalytics } from '../organisms/GroupAnalytics';
import { GroupLedgerTable, LedgerTotalsBar } from '../organisms/GroupLedgerTable';
import {
  calculateMemberBalances,
  calculateNetBalances,
  calculatePairwiseBalance,
  calculateSimplifiedDebts,
} from '../../utils/debtEngine';
import { applyLedgerFilters } from '../../stores/useFilterStore';
import type { LedgerFilters } from '../../stores/useFilterStore';
import { renderMoney, ZERO_EPSILON } from '../../utils/currency';

/**
 * Group detail.
 *
 * Three tabs over one ledger: the expense feed, the balance sheet, and the
 * analytics. The header carries the facts a user needs before reading any of
 * them — members, total spend, and their own position — and the whole view is
 * scoped to a single currency, because a group is a single-currency ledger by
 * construction.
 */

export type GroupDetailTab = 'LEDGER' | 'BALANCES' | 'ANALYTICS';

export interface GroupDetailViewProps {
  group: Group;
  /** Every member profile, resolved in group order. */
  members: UserProfile[];
  membersMap: UserProfileMap;
  currentUserId: UUID;
  /** Expenses belonging to this group only. */
  expenses: ExpenseItem[];
  /** Filter state owned by `useFilterStore`, already applied by the caller. */
  filters: LedgerFilters;
  /** The filtered subset to render. */
  filteredExpenses: ExpenseItem[];
  loading?: boolean;
  /** Suggested transfers for this group only. */
  transfers?: DebtTransfer[];
  onBack: () => void;
  onAddExpense: () => void;
  onEditGroup: () => void;
  onAddMember: () => void;
  onRemoveMember: (userId: UUID) => void;
  onDeleteGroup: () => void;
  onSelectFriend: (userId: UUID) => void;
  onEditExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: UUID) => void;
  onViewReceipt: (expense: ExpenseItem) => void;
  onSettleTransfer: (transfer: DebtTransfer) => void;
  onSettleMember: (userId: UUID) => void;
  /** Seeds the open tab; defaults to the ledger. */
  initialTab?: GroupDetailTab;
  className?: string;
  style?: CSSProperties;
}

export const GroupDetailView: FC<GroupDetailViewProps> = ({
  group,
  members,
  membersMap,
  currentUserId,
  expenses,
  filters,
  filteredExpenses,
  loading = false,
  transfers,
  onBack,
  onAddExpense,
  onEditGroup,
  onAddMember,
  onRemoveMember,
  onDeleteGroup,
  onSelectFriend,
  onEditExpense,
  onDeleteExpense,
  onViewReceipt,
  onSettleTransfer,
  onSettleMember,
  initialTab = 'LEDGER',
  className,
  style,
}) => {
  const [tab, setTab] = useState<GroupDetailTab>(initialTab);

  const memberIds = useMemo(() => members.map((member) => member.id), [members]);

  const balances = useMemo(
    () => calculateMemberBalances(memberIds, expenses, group.currency),
    [memberIds, expenses, group.currency]
  );

  const netBalances = useMemo(
    () => calculateNetBalances(memberIds, expenses, group.currency),
    [memberIds, expenses, group.currency]
  );

  const myBalance = netBalances.get(currentUserId)?.decimalPlaces(2).toNumber() ?? 0;

  const groupTransfers = useMemo(
    () =>
      transfers ??
      (group.simplifyDebts
        ? calculateSimplifiedDebts(memberIds, expenses, group.currency)
        : pairUpBalances(netBalances, group.currency)),
    [transfers, group.simplifyDebts, memberIds, expenses, group.currency, netBalances]
  );

  const spendingTotal = useMemo(
    () =>
      expenses
        .filter((expense) => !expense.isSettlement && expense.currency === group.currency)
        .reduce((total, expense) => total + expense.amount, 0),
    [expenses, group.currency]
  );

  const currencyMismatch = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.currency))).filter(
      (currency) => currency !== group.currency
    ),
    [expenses, group.currency]
  );

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const balancePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <DebtSimplificationCard
        transfers={groupTransfers}
        membersMap={membersMap}
        currentUserId={currentUserId}
        groupName={group.name}
        onSettleTransfer={onSettleTransfer}
        rawDebtCount={
          group.simplifyDebts
            ? Math.floor((memberIds.length * (memberIds.length - 1)) / 2)
            : undefined
        }
      />

      <Card
        title="Member balances"
        style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
        styles={{ body: { padding: spacing.lg } }}
      >
        {balances.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members in this group yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {balances.map((entry) => {
              const user = membersMap.get(entry.userId);
              if (!user) return null;

              return (
                <MemberBalanceCard
                  key={entry.userId}
                  user={user}
                  /*
                   * The card is written from "your" point of view, so another
                   * member's number must be the pairwise balance — what they owe
                   * *you* — not their ledger-wide net position. For the signed-in
                   * user the two coincide with their group balance, which is the
                   * sum of their pairwise positions inside a single-currency
                   * ledger.
                   */
                  netBalance={
                    entry.userId === currentUserId
                      ? myBalance
                      : calculatePairwiseBalance(
                          currentUserId,
                          entry.userId,
                          expenses,
                          group.currency
                        )
                  }
                  totalPaid={entry.totalPaid}
                  totalOwed={entry.totalOwed}
                  currency={group.currency}
                  sharedExpenseCount={expenses.filter(
                    (expense) =>
                      expense.paidBy.some((payer) => payer.userId === entry.userId) ||
                      expense.splits.some((split) => split.userId === entry.userId)
                  ).length}
                  onSelect={entry.userId === currentUserId ? undefined : onSelectFriend}
                  onSettle={
                    entry.userId === currentUserId
                      ? undefined
                      : () => onSettleMember(entry.userId)
                  }
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      {/* Header */}
      <Card
        style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
        styles={{ body: { padding: spacing.lg } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{ padding: 0, marginBottom: spacing.xs }}
            >
              All ledgers
            </Button>

            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Typography.Title level={3} style={{ margin: 0, fontSize: typography.sizes.heading }}>
                {group.name}
              </Typography.Title>
              <StatusPill tone="info">{group.category.toLowerCase()}</StatusPill>
              {group.simplifyDebts ? (
                <StatusPill>simplified</StatusPill>
              ) : (
                <StatusPill tone="warning">as recorded</StatusPill>
              )}
              {currencyMismatch.length > 0 ? (
                <StatusPill tone="warning">
                  {currencyMismatch.length} other currenc{currencyMismatch.length === 1 ? 'y' : 'ies'}
                </StatusPill>
              ) : null}
            </div>

            {group.description ? (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: spacing.xs }}>
                {group.description}
              </Typography.Text>
            ) : null}

            <div
              style={{
                display: 'flex',
                gap: spacing.xxl,
                marginTop: spacing.md,
                flexWrap: 'wrap',
              }}
            >
              <HeaderMetric label="Total spend" value={renderMoney(spendingTotal, group.currency)} />
              <HeaderMetric
                label="Expenses"
                value={`${expenses.filter((expense) => !expense.isSettlement).length}`}
              />
              <HeaderMetric label="Members" value={`${group.members.length}`} />
              <div>
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', fontSize: typography.sizes.caption }}
                >
                  Your position
                </Typography.Text>
                <CurrencyDisplay
                  amount={Math.abs(myBalance)}
                  currency={group.currency}
                  colored
                  showSign={Math.abs(myBalance) > 0.005}
                  size="lg"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={onAddExpense}
              style={{ backgroundColor: mintPalette.primary, minHeight: 40 }}
            >
              Add expense
            </Button>
            <Button icon={<EditOutlined />} onClick={onEditGroup} style={{ minHeight: 40 }}>
              Edit group
            </Button>
            <Button icon={<UserAddOutlined />} onClick={onAddMember} style={{ minHeight: 40 }}>
              Members
            </Button>
            <Popconfirm
              title="Delete this group?"
              description="Only possible while it has no expenses."
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={onDeleteGroup}
            >
              <Button danger style={{ minHeight: 40 }}>
                Delete
              </Button>
            </Popconfirm>
          </div>
        </div>

        {/* Member roster with per-person removal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.lg,
            flexWrap: 'wrap',
          }}
        >
          <TeamOutlined style={{ color: mintPalette.slateMuted }} />
          {members.map((member) => (
            <span
              key={member.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `2px ${spacing.sm}px 2px 4px`,
                borderRadius: 999,
                border: `1px solid ${mintPalette.slateBorder}`,
                backgroundColor: mintPalette.canvas,
                fontSize: typography.sizes.small,
              }}
            >
              {member.id === currentUserId
                ? `${member.name} (you)`
                : member.name.replace(/(^\w+).*/, '$1')}
              {member.id === currentUserId ? null : (
                <Popconfirm
                  title={`Remove ${member.name}?`}
                  description="Only possible if they are not on any expense."
                  okText="Remove"
                  cancelText="Cancel"
                  onConfirm={() => onRemoveMember(member.id)}
                >
                  <Button
                    type="text"
                    aria-label={`Remove ${member.name} from this group`}
                    className="mint-touch-target"
                    style={{ minWidth: 44, minHeight: 44, padding: 0 }}
                  >
                    ×
                  </Button>
                </Popconfirm>
              )}
            </span>
          ))}
        </div>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as GroupDetailTab)}
        items={[
          {
            key: 'LEDGER',
            label: `Ledger (${filteredExpenses.length})`,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                <LedgerTotalsBar expenses={expenses} currency={group.currency} currentUserId={currentUserId} />
                <GroupLedgerTable
                  expenses={filteredExpenses}
                  membersMap={membersMap}
                  currentUserId={currentUserId}
                  totalCount={expenses.length}
                  groupName={group.name}
                  onAddExpense={onAddExpense}
                  onEditExpense={onEditExpense}
                  onDeleteExpense={onDeleteExpense}
                  onViewReceipt={onViewReceipt}
                />
                <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                  {filters.searchText
                    ? `Filtered by “${filters.searchText}”.`
                    : 'Showing every entry in this ledger.'}
                </Typography.Text>
              </div>
            ),
          },
          {
            key: 'BALANCES',
            label: 'Balances',
            children: balancePanel,
          },
          {
            key: 'ANALYTICS',
            label: 'Analytics',
            children: (
              <GroupAnalytics
                expenses={expenses}
                membersMap={membersMap}
                members={members}
                currency={group.currency}
                groupName={group.name}
              />
            ),
          },
        ]}
      />

      {/* Currency safety note: a group is one ledger in one currency. */}
      {currencyMismatch.length > 0 ? (
        <Card
          style={{
            borderRadius: radii.lg,
            border: `1px solid ${BALANCE_TONES.settled.border}`,
            backgroundColor: mintPalette.canvas,
          }}
          styles={{ body: { padding: spacing.md } }}
        >
          <Typography.Text style={{ fontSize: typography.sizes.small }}>
            This group holds expenses in {currencyMismatch.join(', ')} as well as {group.currency}.
            Each currency is balanced separately — {renderMoney(spendingTotal, group.currency)} above
            covers {group.currency} only, so no exchange rate is ever guessed.
          </Typography.Text>
        </Card>
      ) : null}

      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24} md={12}>
          <Card
            title="Settle up"
            style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
            styles={{ body: { padding: spacing.lg } }}
          >
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
              {groupTransfers.length === 0
                ? 'Nothing is outstanding in this group.'
                : `${groupTransfers.length} payment${groupTransfers.length === 1 ? '' : 's'} would clear every balance.`}
            </Typography.Text>
            <div style={{ marginTop: spacing.md }}>
              <Button
                icon={<SwapOutlined />}
                type="primary"
                disabled={groupTransfers.length === 0}
                onClick={() => {
                  const mine = groupTransfers.find(
                    (transfer) =>
                      transfer.fromUserId === currentUserId || transfer.toUserId === currentUserId
                  );
                  if (mine) onSettleTransfer(mine);
                }}
                style={{ backgroundColor: mintPalette.primary, minHeight: 40 }}
              >
                Settle my balance
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title="Categories in this ledger"
            style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
            styles={{ body: { padding: spacing.lg } }}
          >
            <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
              {Array.from(new Set(expenses.map((expense) => expense.category))).map((category) => (
                <CategoryTag key={category} category={category} size="sm" />
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const HeaderMetric: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <Typography.Text
      type="secondary"
      style={{ display: 'block', fontSize: typography.sizes.caption }}
    >
      {label}
    </Typography.Text>
    <Typography.Text strong style={{ fontSize: typography.sizes.subtitle }}>
      {value}
    </Typography.Text>
  </div>
);

/**
 * Pairs creditors with debtors directly without net multi-hop simplification,
 * decrementing balances to guarantee total debt does not exceed net liabilities.
 *
 * Exported because the allocation is the only arithmetic in this view: the
 * verification harness asserts conservation against it directly.
 */
export function pairUpBalances(
  netBalances: Map<UUID, BigNumber>,
  currency: Group['currency']
): DebtTransfer[] {
  interface MutableNode {
    userId: UUID;
    balance: BigNumber;
  }

  const creditors: MutableNode[] = [];
  const debtors: MutableNode[] = [];
  const ZERO = new BigNumber(ZERO_EPSILON);

  netBalances.forEach((balance, userId) => {
    if (balance.isGreaterThan(ZERO)) {
      creditors.push({ userId, balance: balance.decimalPlaces(2, BigNumber.ROUND_HALF_UP) });
    } else if (balance.isLessThan(ZERO.negated())) {
      debtors.push({ userId, balance: balance.abs().decimalPlaces(2, BigNumber.ROUND_HALF_UP) });
    }
  });

  const debts: DebtTransfer[] = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];
    const settleAmount = BigNumber.minimum(creditor.balance, debtor.balance);
    const amount = settleAmount.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber();

    if (amount > 0) {
      debts.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount,
        currency,
      });
    }

    creditor.balance = creditor.balance.minus(settleAmount);
    debtor.balance = debtor.balance.minus(settleAmount);

    if (creditor.balance.isLessThanOrEqualTo(ZERO)) cIdx++;
    if (debtor.balance.isLessThanOrEqualTo(ZERO)) dIdx++;
  }

  return debts;
}

/** Convenience: the filtered ledger for a group, using the shared predicate. */
export function filterGroupExpenses(
  expenses: ExpenseItem[],
  filters: LedgerFilters
): ExpenseItem[] {
  return applyLedgerFilters(expenses, filters);
}

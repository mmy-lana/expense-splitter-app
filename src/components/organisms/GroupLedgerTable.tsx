import { useMemo, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Card, Empty, Pagination, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusCircleOutlined, UnorderedListOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ExpenseItem, UUID, UserProfileMap } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { CategoryTag } from '../atoms/CategoryIcon';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { AvatarStack } from '../atoms/UserAvatar';
import { ExpenseRowItem } from '../molecules/ExpenseRowItem';
import { calculateExpenseImpact } from '../../utils/debtEngine';
import { describeSplitType } from '../../utils/splitEngine';
import { formatMoney } from '../../utils/currency';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * The ledger, rendered two ways.
 *
 * From 768px up it is a dense Ant Design table — sortable columns, aligned
 * numerals, one row per expense. Below 768px a table with eight columns is
 * unusable, so the same data renders as stacked cards built from `ExpenseRowItem`.
 * The two presentations share a single row model, so a change to how an expense
 * is interpreted cannot drift between them.
 */

export type LedgerViewMode = 'TABLE' | 'CARDS';

export interface GroupLedgerTableProps {
  expenses: ExpenseItem[];
  membersMap: UserProfileMap;
  currentUserId: UUID;
  /** Total rows before filtering, used by the empty-state copy. */
  totalCount?: number;
  /** Group name shown as a chip per row when supplied. */
  groupName?: string;
  /** Resolves a group name per row for mixed ledgers. */
  resolveGroupName?: (groupId: UUID | null) => string | undefined;
  onDeleteExpense?: (expenseId: UUID) => void;
  onEditExpense?: (expense: ExpenseItem) => void;
  onViewReceipt?: (expense: ExpenseItem) => void;
  onSettleExpense?: (expense: ExpenseItem) => void;
  onAddExpense?: () => void;
  /** Forces one presentation; by default it follows the viewport. */
  forceViewMode?: LedgerViewMode;
  /** Rows per page on desktop. */
  pageSize?: number;
  /** Hides pagination entirely (used inside already-paginated rails). */
  paginated?: boolean;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const GroupLedgerTable: FC<GroupLedgerTableProps> = ({
  expenses,
  membersMap,
  currentUserId,
  totalCount,
  groupName,
  resolveGroupName,
  onDeleteExpense,
  onEditExpense,
  onViewReceipt,
  onSettleExpense,
  onAddExpense,
  forceViewMode,
  pageSize = 12,
  paginated = true,
  loading = false,
  className,
  style,
}) => {
  const { isMobile } = useResponsive();
  const [page, setPage] = useState(1);

  const viewMode: LedgerViewMode = forceViewMode ?? (isMobile ? 'CARDS' : 'TABLE');

  // Guard against a page index that outlives its rows after a filter change.
  const safePage = Math.min(page, Math.max(1, Math.ceil(expenses.length / pageSize)));
  const visibleExpenses = paginated
    ? expenses.slice((safePage - 1) * pageSize, safePage * pageSize)
    : expenses;

  const columns = useMemo<ColumnsType<ExpenseItem>>(
    () => [
      {
        title: 'Expense',
        dataIndex: 'description',
        key: 'description',
        sorter: (a, b) => a.description.localeCompare(b.description),
        render: (_value, expense) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
            <CategoryTag category={expense.category} size="sm" />
            <Typography.Text ellipsis style={{ maxWidth: 220 }}>
              {expense.description}
            </Typography.Text>
            {expense.isSettlement ? <StatusPill tone="info">Settlement</StatusPill> : null}
          </div>
        ),
      },
      {
        title: 'Date',
        dataIndex: 'date',
        key: 'date',
        width: 128,
        sorter: (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        defaultSortOrder: 'descend',
        render: (value: string) => (
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            {dayjs(value).format('MMM D, YYYY')}
          </Typography.Text>
        ),
      },
      {
        title: 'Paid by',
        key: 'paidBy',
        width: 168,
        render: (_value, expense) => {
          const payers = expense.paidBy
            .map((payer) => membersMap.get(payer.userId))
            .filter((user): user is NonNullable<typeof user> => user !== undefined);
          if (payers.length === 0) {
            return (
              <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                Unknown
              </Typography.Text>
            );
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <AvatarStack users={payers} size="xs" max={2} />
              <Typography.Text ellipsis style={{ fontSize: typography.sizes.small, maxWidth: 90 }}>
                {payers.length === 1 ? payers[0].name.split(' ')[0] : `${payers.length} people`}
              </Typography.Text>
            </div>
          );
        },
      },
      {
        title: 'Split',
        dataIndex: 'splitType',
        key: 'splitType',
        width: 108,
        render: (value: ExpenseItem['splitType']) => (
          <StatusPill>{describeSplitType(value)}</StatusPill>
        ),
      },
      {
        title: 'Total',
        dataIndex: 'amount',
        key: 'amount',
        width: 124,
        align: 'right',
        sorter: (a, b) => a.amount - b.amount,
        render: (value: number, expense) => (
          <CurrencyDisplay amount={value} currency={expense.currency} size="sm" />
        ),
      },
      {
        title: 'Your share',
        key: 'yourShare',
        width: 132,
        align: 'right',
        render: (_value, expense) => {
          const impact = calculateExpenseImpact(expense, currentUserId);
          if (!impact.isInvolved) {
            return (
              <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                —
              </Typography.Text>
            );
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <CurrencyDisplay
                amount={impact.net !== 0 ? Math.abs(impact.net) : expense.amount}
                currency={expense.currency}
                colored={impact.net !== 0}
                showSign={impact.net !== 0}
                size="sm"
              />
              <Typography.Text
                type="secondary"
                style={{ fontSize: typography.sizes.caption, color: impact.net !== 0 ? BALANCE_TONES[impact.net > 0 ? 'credit' : 'debit'].text : undefined }}
              >
                {impact.net > 0.005 ? 'lent' : impact.net < -0.005 ? 'borrowed' : 'no effect'}
              </Typography.Text>
            </div>
          );
        },
      },
      {
        title: '',
        key: 'actions',
        width: 132,
        align: 'right',
        render: (_value, expense) => (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            {onSettleExpense && !expense.isSettlement ? (
              <Button
                type="link"
                size="small"
                onClick={() => onSettleExpense(expense)}
                aria-label={`Settle ${expense.description}`}
              >
                Settle
              </Button>
            ) : null}
            {onEditExpense ? (
              <Button
                type="link"
                size="small"
                onClick={() => onEditExpense(expense)}
                aria-label={`Edit ${expense.description}`}
              >
                Edit
              </Button>
            ) : null}
            {onDeleteExpense ? (
              <Button
                type="link"
                size="small"
                danger
                onClick={() => onDeleteExpense(expense.id)}
                aria-label={`Delete ${expense.description}`}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [membersMap, currentUserId, onDeleteExpense, onEditExpense, onSettleExpense]
  );

  const total = totalCount ?? expenses.length;

  if (expenses.length === 0) {
    return (
      <Card
        className={className}
        style={{
          borderRadius: radii.lg,
          border: `1px dashed ${mintPalette.slateBorder}`,
          textAlign: 'center',
          ...style,
        }}
        styles={{ body: { padding: `${spacing.xxxl}px ${spacing.lg}px` } }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            total > 0
              ? `No expenses match the current filters (${total} in this ledger).`
              : groupName
                ? `${groupName} has no expenses yet.`
                : 'No expenses recorded yet.'
          }
        >
          {onAddExpense ? (
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={onAddExpense}
              style={{ backgroundColor: mintPalette.primary }}
            >
              Add the first expense
            </Button>
          ) : null}
        </Empty>
      </Card>
    );
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <UnorderedListOutlined style={{ color: mintPalette.slateMuted }} />
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          {expenses.length} of {total} {total === 1 ? 'entry' : 'entries'}
        </Typography.Text>
        {forceViewMode === undefined ? (
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption, marginLeft: 'auto' }}>
            {viewMode === 'TABLE' ? 'Table view' : 'Card view'}
          </Typography.Text>
        ) : null}
      </div>

      {viewMode === 'TABLE' ? (
        <Card
          style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
          styles={{ body: { padding: spacing.sm } }}
        >
          <Table<ExpenseItem>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={visibleExpenses}
            loading={loading}
            pagination={false}
            scroll={{ x: 900 }}
            rowClassName={(expense) => (expense.isSettlement ? 'mint-ledger-settlement' : '')}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {visibleExpenses.map((expense) => (
            <ExpenseRowItem
              key={expense.id}
              expense={expense}
              membersMap={membersMap}
              currentUserId={currentUserId}
              groupName={resolveGroupName ? resolveGroupName(expense.groupId) : groupName}
              onDelete={onDeleteExpense}
              onEdit={onEditExpense}
              onViewReceipt={onViewReceipt}
              onSettle={onSettleExpense}
            />
          ))}
        </div>
      )}

      {paginated && expenses.length > pageSize ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination
            current={safePage}
            pageSize={pageSize}
            total={expenses.length}
            onChange={setPage}
            showSizeChanger={false}
            simple={isMobile}
          />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Ledger footer: totals for the current filter, stated in one line.
 */
export interface LedgerTotalsBarProps {
  expenses: ExpenseItem[];
  currency: Parameters<typeof formatMoney>[1];
  currentUserId: UUID;
  className?: string;
  style?: CSSProperties;
}

export const LedgerTotalsBar: FC<LedgerTotalsBarProps> = ({
  expenses,
  currency,
  currentUserId,
  className,
  style,
}) => {
  const { spend, settlements, myNet } = useMemo(() => {
    let spendTotal = 0;
    let settlementTotal = 0;
    let net = 0;

    for (const expense of expenses) {
      if (expense.isSettlement) settlementTotal += expense.amount;
      else spendTotal += expense.amount;

      const impact = calculateExpenseImpact(expense, currentUserId);
      net += impact.net;
    }

    return { spend: spendTotal, settlements: settlementTotal, myNet: net };
  }, [expenses, currentUserId]);

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
        border: `1px solid ${mintPalette.slateBorder}`,
        backgroundColor: mintPalette.surface,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: spacing.xxl, flexWrap: 'wrap' }}>
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: typography.sizes.caption }}>
            Spending
          </Typography.Text>
          <CurrencyDisplay amount={spend} currency={currency} size="md" />
        </div>
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: typography.sizes.caption }}>
            Settlements
          </Typography.Text>
          <CurrencyDisplay amount={settlements} currency={currency} size="md" />
        </div>
      </div>

      <CurrencyDisplay
        amount={Math.abs(myNet)}
        currency={currency}
        colored
        showSign={Math.abs(myNet) > 0.005}
        prefix={myNet > 0.005 ? 'you are owed' : myNet < -0.005 ? 'you owe' : 'settled'}
        size="lg"
      />
    </div>
  );
};

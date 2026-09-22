import type { CSSProperties, FC } from 'react';
import { Button, Card, Col, Empty, Row, Typography } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';
import type { CurrencyCode, ExpenseItem, UserProfileMap, UUID } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { GroupLedgerTable } from '../organisms/GroupLedgerTable';
import { applyLedgerFilters } from '../../stores/useFilterStore';
import type { LedgerFilters } from '../../stores/useFilterStore';
import type { GroupSummary } from '../../hooks/useLedger';
import { renderMoney } from '../../utils/currency';

/**
 * Groups list.
 *
 * Card-per-ledger overview plus the cross-group expense feed. Every card states
 * the two facts a user opens a group for — how big the ledger is and where they
 * stand in it — so the common question is answered without drilling in.
 */

export interface GroupsListViewProps {
  groupSummaries: GroupSummary[];
  /** Every expense in the database; the list view filters per group. */
  expenses: ExpenseItem[];
  membersMap: UserProfileMap;
  currentUserId: UUID;
  currency: CurrencyCode;
  filters: LedgerFilters;
  onSelectGroup: (groupId: UUID) => void;
  onNewGroup: () => void;
  onAddExpense: () => void;
  onEditExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: UUID) => void;
  onViewReceipt: (expense: ExpenseItem) => void;
  className?: string;
  style?: CSSProperties;
}

export const GroupsListView: FC<GroupsListViewProps> = ({
  groupSummaries,
  expenses,
  membersMap,
  currentUserId,
  currency,
  filters,
  onSelectGroup,
  onNewGroup,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onViewReceipt,
  className,
  style,
}) => {
  const groupIds = new Set(groupSummaries.map((summary) => summary.group.id));
  const visibleExpenses = applyLedgerFilters(
    expenses.filter((expense) => expense.groupId !== null && groupIds.has(expense.groupId)),
    filters
  );

  const groupNameById = new Map(groupSummaries.map((summary) => [summary.group.id, summary.group.name]));

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0, fontSize: typography.sizes.heading }}>
            Groups
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            {groupSummaries.length} ledger{groupSummaries.length === 1 ? '' : 's'} you belong to
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusCircleOutlined />}
          onClick={onNewGroup}
          style={{ backgroundColor: mintPalette.primary, minHeight: 40 }}
        >
          New group
        </Button>
      </div>

      {groupSummaries.length === 0 ? (
        <Card
          style={{ borderRadius: radii.lg, border: `1px dashed ${mintPalette.slateBorder}` }}
          styles={{ body: { padding: spacing.xxxl } }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No groups yet. A group keeps a trip, a flat or a project in its own ledger, separate from your direct splits."
          >
            <Button
              type="primary"
              onClick={onNewGroup}
              style={{ backgroundColor: mintPalette.primary }}
            >
              Create your first group
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[spacing.md, spacing.md]}>
          {groupSummaries.map((summary) => {
            const tone =
              Math.abs(summary.myNetBalance) <= 0.005
                ? 'settled'
                : summary.myNetBalance > 0
                  ? 'credit'
                  : 'debit';

            return (
              <Col key={summary.group.id} xs={24} md={12} xl={8}>
                <button
                  type="button"
                  onClick={() => onSelectGroup(summary.group.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    height: '100%',
                  }}
                >
                  <Card
                    style={{
                      borderRadius: radii.lg,
                      border: `1px solid ${
                        tone === 'settled' ? mintPalette.slateBorder : BALANCE_TONES[tone].border
                      }`,
                      height: '100%',
                    }}
                    styles={{ body: { padding: spacing.lg } }}
                  >
                    <Typography.Text
                      strong
                      ellipsis
                      style={{ display: 'block', fontSize: typography.sizes.subtitle }}
                    >
                      {summary.group.name}
                    </Typography.Text>

                    <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                      <StatusPill tone="info">{summary.group.category.toLowerCase()}</StatusPill>
                      <StatusPill>{summary.memberCount} members</StatusPill>
                      {summary.group.simplifyDebts ? <StatusPill>simplified</StatusPill> : null}
                    </div>

                    <div style={{ marginTop: spacing.md }}>
                      <Typography.Text
                        type="secondary"
                        style={{ display: 'block', fontSize: typography.sizes.caption }}
                      >
                        Your position
                      </Typography.Text>
                      <CurrencyDisplay
                        amount={Math.abs(summary.myNetBalance)}
                        currency={summary.group.currency}
                        colored
                        showSign={tone !== 'settled'}
                        size="lg"
                      />
                    </div>

                    <Typography.Text
                      type="secondary"
                      style={{ display: 'block', marginTop: spacing.sm, fontSize: typography.sizes.small }}
                    >
                      {summary.expenseCount} expense{summary.expenseCount === 1 ? '' : 's'} ·{' '}
                      {renderMoney(summary.totalSpend, summary.group.currency)} spent
                    </Typography.Text>

                    {summary.lastActivityAt ? (
                      <Typography.Text
                        type="secondary"
                        style={{ display: 'block', fontSize: typography.sizes.caption }}
                      >
                        Last entry {new Date(summary.lastActivityAt).toLocaleDateString()}
                      </Typography.Text>
                    ) : (
                      <Typography.Text
                        type="secondary"
                        style={{ display: 'block', fontSize: typography.sizes.caption }}
                      >
                        Nothing recorded yet
                      </Typography.Text>
                    )}
                  </Card>
                </button>
              </Col>
            );
          })}
        </Row>
      )}

      <Typography.Title level={4} style={{ margin: `${spacing.md}px 0 0`, fontSize: typography.sizes.title }}>
        Every group expense
      </Typography.Title>

      <GroupLedgerTable
        expenses={visibleExpenses}
        membersMap={membersMap}
        currentUserId={currentUserId}
        totalCount={visibleExpenses.length}
        resolveGroupName={(groupId) => (groupId ? groupNameById.get(groupId) : undefined)}
        onAddExpense={onAddExpense}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
        onViewReceipt={onViewReceipt}
      />

      <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
        Balances shown in {currency} unless a group uses its own currency.
      </Typography.Text>
    </div>
  );
};

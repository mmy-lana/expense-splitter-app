import { useMemo } from 'react';
import type { CSSProperties, FC } from 'react';
import { Card, Col, Empty, Progress, Row, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { CurrencyCode, ExpenseCategory, ExpenseItem, UserProfile, UserProfileMap } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { CATEGORY_META } from '../atoms/CategoryIcon';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { UserAvatar } from '../atoms/UserAvatar';
import { StatusPill } from '../atoms/MintBadge';
import {
  calculateCategoryTotals,
  calculateMemberBalances,
  calculateMonthlyBurn,
  calculatePayerTotals,
  calculateTotalSpend,
} from '../../utils/debtEngine';
import { renderMoney } from '../../utils/currency';

/**
 * Ledger analytics.
 *
 * Four views of the same rows — where the money went, who fronted it, how the
 * spend is trending, and how each member stands — all derived from the debt
 * engine rather than recomputed locally. Settlement rows are excluded from
 * spending analytics by the engine, because moving money between people is not
 * consumption and would otherwise double-count the same dollars.
 */

export interface GroupAnalyticsProps {
  expenses: ExpenseItem[];
  membersMap: UserProfileMap;
  members: UserProfile[];
  currency?: CurrencyCode;
  /** Ledger label used in the section headings. */
  groupName?: string;
  /** Renders only the requested panels. Defaults to all four. */
  panels?: ('CATEGORIES' | 'PAYERS' | 'BURN' | 'BALANCES')[];
  /** Trailing months in the burn chart. */
  burnMonths?: number;
  className?: string;
  style?: CSSProperties;
}

export const GroupAnalytics: FC<GroupAnalyticsProps> = ({
  expenses,
  membersMap,
  members,
  currency = 'USD',
  groupName,
  panels = ['CATEGORIES', 'PAYERS', 'BURN', 'BALANCES'],
  burnMonths = 6,
  className,
  style,
}) => {
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);

  const totalSpend = useMemo(() => calculateTotalSpend(expenses, currency), [expenses, currency]);
  const categoryTotals = useMemo(() => calculateCategoryTotals(expenses, currency), [expenses, currency]);
  const payerTotals = useMemo(
    () => calculatePayerTotals(memberIds, expenses, currency),
    [memberIds, expenses, currency]
  );
  const burn = useMemo(
    () => calculateMonthlyBurn(expenses, currency, burnMonths),
    [expenses, currency, burnMonths]
  );
  const balances = useMemo(
    () => calculateMemberBalances(memberIds, expenses, currency),
    [memberIds, expenses, currency]
  );

  const spendingCount = useMemo(
    () => expenses.filter((expense) => !expense.isSettlement && expense.currency === currency).length,
    [expenses, currency]
  );

  if (spendingCount === 0) {
    return (
      <Card
        className={className}
        style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, ...style }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            groupName
              ? `No spending recorded in ${groupName} yet, so there is nothing to analyse.`
              : 'No spending recorded yet, so there is nothing to analyse.'
          }
        />
      </Card>
    );
  }

  const maxMonthly = Math.max(...burn.map((point) => point.amount), 0.01);
  const previousMonth = burn.length >= 2 ? burn[burn.length - 2].amount : 0;
  const currentMonth = burn.length >= 1 ? burn[burn.length - 1].amount : 0;
  const monthDelta = currentMonth - previousMonth;
  const averagePerExpense = spendingCount > 0 ? totalSpend / spendingCount : 0;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
      {/* Headline metrics */}
      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={12} md={8}>
          <MetricTile label="Total spend" value={totalSpend} currency={currency} />
        </Col>
        <Col xs={12} md={8}>
          <MetricTile
            label="Average expense"
            value={averagePerExpense}
            currency={currency}
            hint={`${spendingCount} expense${spendingCount === 1 ? '' : 's'}`}
          />
        </Col>
        <Col xs={24} md={8}>
          <Card
            style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
            styles={{ body: { padding: spacing.lg } }}
          >
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              This month
            </Typography.Text>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xs }}>
              <CurrencyDisplay amount={currentMonth} currency={currency} size="lg" />
              {previousMonth > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    fontSize: typography.sizes.small,
                    color: monthDelta > 0 ? BALANCE_TONES.debit.text : BALANCE_TONES.credit.text,
                  }}
                >
                  {monthDelta > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {renderMoney(Math.abs(monthDelta), currency)}
                </span>
              ) : null}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
              vs previous month
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[spacing.lg, spacing.lg]}>
        {panels.includes('CATEGORIES') ? (
          <Col xs={24} lg={12}>
            <Card
              title="Spending by category"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {categoryTotals.map((entry) => (
                  <CategoryBar
                    key={entry.category}
                    category={entry.category}
                    amount={entry.amount}
                    percentage={entry.percentage}
                    count={entry.count}
                    currency={currency}
                  />
                ))}
              </div>
            </Card>
          </Col>
        ) : null}

        {panels.includes('PAYERS') ? (
          <Col xs={24} lg={12}>
            <Card
              title="Who fronted the money"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {payerTotals.map((entry) => {
                  const user = membersMap.get(entry.userId);
                  return (
                    <div
                      key={entry.userId}
                      style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}
                    >
                      <UserAvatar
                        name={user?.name ?? 'Unknown'}
                        avatarUrl={user?.avatarUrl}
                        size="sm"
                        showTooltip={false}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm }}>
                          <Typography.Text ellipsis style={{ fontSize: typography.sizes.small }}>
                            {user?.name ?? 'Unknown'}
                          </Typography.Text>
                          <CurrencyDisplay amount={entry.amount} currency={currency} size="sm" />
                        </div>
                        <Progress
                          percent={Math.round(entry.percentage * 10) / 10}
                          showInfo={false}
                          size="small"
                          strokeColor={mintPalette.primary}
                          trailColor={mintPalette.slateDivider}
                        />
                      </div>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: typography.sizes.caption, minWidth: 44, textAlign: 'right' }}
                      >
                        {entry.percentage.toFixed(1)}%
                      </Typography.Text>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Col>
        ) : null}

        {panels.includes('BURN') ? (
          <Col xs={24} lg={panels.includes('BALANCES') ? 12 : 24}>
            <Card
              title={`Monthly spend (${burn.length} months)`}
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                  height: 168,
                }}
              >
                {burn.map((point) => {
                  const heightPercent = Math.round((point.amount / maxMonthly) * 100);
                  return (
                    <Tooltip key={point.month} title={`${point.label}: ${renderMoney(point.amount, currency)}`}>
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: spacing.xs,
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <span
                          style={{
                            fontSize: typography.sizes.caption,
                            color: mintPalette.slateMuted,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {point.amount > 0 ? Math.round(point.amount) : ''}
                        </span>
                        <div
                          role="img"
                          aria-label={`${point.label}: ${renderMoney(point.amount, currency)}`}
                          style={{
                            width: '100%',
                            maxWidth: 48,
                            height: `${Math.max(heightPercent, point.amount > 0 ? 4 : 1)}%`,
                            minHeight: 2,
                            borderRadius: `${radii.sm}px ${radii.sm}px 0 0`,
                            backgroundColor: point.amount > 0 ? mintPalette.primary : mintPalette.slateDivider,
                            transition: 'height 0.25s ease',
                          }}
                        />
                        <span
                          style={{
                            fontSize: typography.sizes.caption,
                            color: mintPalette.slateMuted,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {point.label}
                        </span>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </Card>
          </Col>
        ) : null}

        {panels.includes('BALANCES') ? (
          <Col xs={24} lg={panels.includes('BURN') ? 12 : 24}>
            <Card
              title="Member balances"
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {balances.map((entry) => {
                  const user = membersMap.get(entry.userId);
                  const tone = entry.netBalance > 0.005 ? 'credit' : entry.netBalance < -0.005 ? 'debit' : 'settled';
                  return (
                    <div
                      key={entry.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.md,
                        paddingBottom: spacing.sm,
                        borderBottom: `1px solid ${mintPalette.slateDivider}`,
                      }}
                    >
                      <UserAvatar
                        name={user?.name ?? 'Unknown'}
                        avatarUrl={user?.avatarUrl}
                        size="sm"
                        status={tone}
                        showTooltip={false}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text ellipsis style={{ display: 'block', fontSize: typography.sizes.small }}>
                          {user?.name ?? 'Unknown'}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                          Paid {renderMoney(entry.totalPaid, currency)} · Share{' '}
                          {renderMoney(entry.totalOwed, currency)}
                        </Typography.Text>
                      </div>
                      <CurrencyDisplay
                        amount={Math.abs(entry.netBalance)}
                        currency={currency}
                        colored
                        showSign={tone !== 'settled'}
                        size="sm"
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          </Col>
        ) : null}
      </Row>
    </div>
  );
};

interface MetricTileProps {
  label: string;
  value: number;
  currency: CurrencyCode;
  hint?: string;
}

const MetricTile: FC<MetricTileProps> = ({ label, value, currency, hint }) => (
  <Card
    style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}`, height: '100%' }}
    styles={{ body: { padding: spacing.lg } }}
  >
    <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
      {label}
    </Typography.Text>
    <div style={{ marginTop: spacing.xs }}>
      <CurrencyDisplay amount={value} currency={currency} size="lg" />
    </div>
    {hint ? (
      <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
        {hint}
      </Typography.Text>
    ) : null}
  </Card>
);

interface CategoryBarProps {
  category: ExpenseCategory;
  amount: number;
  percentage: number;
  count: number;
  currency: CurrencyCode;
}

const CategoryBar: FC<CategoryBarProps> = ({ category, amount, percentage, count, currency }) => {
  const meta = CATEGORY_META[category];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
          <span
            role="img"
            aria-label={meta.label}
            style={{
              width: 26,
              height: 26,
              borderRadius: radii.sm,
              backgroundColor: meta.background,
              color: meta.color,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {meta.icon}
          </span>
          <Typography.Text ellipsis style={{ fontSize: typography.sizes.small }}>
            {meta.label}
          </Typography.Text>
          <StatusPill>
            {count} expense{count === 1 ? '' : 's'}
          </StatusPill>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <CurrencyDisplay amount={amount} currency={currency} size="sm" />
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: typography.sizes.caption }}>
            {percentage.toFixed(1)}%
          </Typography.Text>
        </div>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: mintPalette.slateDivider,
          marginTop: spacing.xs,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(percentage, amount > 0 ? 2 : 0))}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: meta.color,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
};

/**
 * Single-number callout used by the dashboard header.
 */
export interface BalanceCalloutProps {
  label: string;
  amount: number;
  currency: CurrencyCode;
  hint?: string;
  tone?: 'credit' | 'debit' | 'settled';
  className?: string;
  style?: CSSProperties;
}

export const BalanceCallout: FC<BalanceCalloutProps> = ({
  label,
  amount,
  currency,
  hint,
  tone,
  className,
  style,
}) => {
  const resolved = tone ?? (amount > 0.005 ? 'credit' : amount < -0.005 ? 'debit' : 'settled');

  return (
    <div
      className={className}
      style={{
        padding: spacing.lg,
        borderRadius: radii.lg,
        backgroundColor: BALANCE_TONES[resolved].surface,
        border: `1px solid ${BALANCE_TONES[resolved].border}`,
        ...style,
      }}
    >
      <Typography.Text
        style={{
          display: 'block',
          fontSize: typography.sizes.caption,
          textTransform: 'uppercase',
          letterSpacing: typography.letterSpacing.wide,
          fontWeight: typography.weights.semibold,
          color: BALANCE_TONES[resolved].text,
        }}
      >
        {label}
      </Typography.Text>
      <div style={{ marginTop: spacing.xs }}>
        <CurrencyDisplay amount={Math.abs(amount)} currency={currency} colored size="xl" />
      </div>
      {hint ? (
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
          {hint}
        </Typography.Text>
      ) : null}
    </div>
  );
};

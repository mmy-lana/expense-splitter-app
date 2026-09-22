import { useMemo, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, Card, Empty, Segmented, Skeleton, Timeline, Tooltip, Typography } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  ActivityAction,
  ActivityLog,
  CurrencyCode,
  ExpenseItem,
  Group,
  UserProfileMap,
  UUID,
} from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { renderMoney } from '../../utils/currency';

/**
 * Activity feed.
 *
 * The audit trail, rendered as a timeline grouped by day. Entries whose expense
 * still exists are actionable; entries whose expense was deleted keep their
 * recorded metadata, because the history of a removed expense is exactly the
 * thing an audit trail exists to preserve.
 */

export type ActivityScope = 'ALL' | 'MINE' | 'GROUPS';

export interface ActivityFeedViewProps {
  activities: ActivityLog[];
  expenses: ExpenseItem[];
  groups: Group[];
  membersMap: UserProfileMap;
  currentUserId: UUID;
  currency?: CurrencyCode;
  loading?: boolean;
  /** Restricts the feed to one group when rendered inside a group. */
  groupId?: UUID | null;
  /** Deep-links from an entry to its expense. */
  onSelectExpense?: (expenseId: UUID) => void;
  onSelectGroup?: (groupId: UUID) => void;
  className?: string;
  style?: CSSProperties;
}

interface ActionDescriptor {
  label: (log: ActivityLog) => string;
  icon: React.ReactNode;
  tone: 'credit' | 'debit' | 'settled' | 'info' | 'warning';
}

const ACTION_DESCRIPTORS: Record<ActivityAction, ActionDescriptor> = {
  EXPENSE_CREATED: {
    label: () => 'added an expense',
    icon: <PlusCircleOutlined />,
    tone: 'credit',
  },
  EXPENSE_UPDATED: {
    label: () => 'edited an expense',
    icon: <EditOutlined />,
    tone: 'info',
  },
  EXPENSE_DELETED: {
    label: () => 'deleted an expense',
    icon: <DeleteOutlined />,
    tone: 'debit',
  },
  SETTLEMENT_RECORDED: {
    label: () => 'recorded a payment',
    icon: <CheckCircleOutlined />,
    tone: 'credit',
  },
  GROUP_CREATED: {
    label: () => 'created a group',
    icon: <TeamOutlined />,
    tone: 'info',
  },
  GROUP_UPDATED: {
    label: () => 'updated a group',
    icon: <EditOutlined />,
    tone: 'info',
  },
  GROUP_DELETED: {
    label: () => 'deleted a group',
    icon: <DeleteOutlined />,
    tone: 'debit',
  },
  MEMBER_ADDED: {
    label: () => 'added a member',
    icon: <UserAddOutlined />,
    tone: 'credit',
  },
  MEMBER_REMOVED: {
    label: () => 'removed a member',
    icon: <UserDeleteOutlined />,
    tone: 'warning',
  },
};

export const ActivityFeedView: FC<ActivityFeedViewProps> = ({
  activities,
  expenses,
  groups,
  membersMap,
  currentUserId,
  currency = 'USD',
  loading = false,
  groupId,
  onSelectExpense,
  onSelectGroup,
  className,
  style,
}) => {
  const [scope, setScope] = useState<ActivityScope>('ALL');

  const groupsById = useMemo(() => {
    const map = new Map<UUID, Group>();
    for (const group of groups) map.set(group.id, group);
    return map;
  }, [groups]);

  const expensesById = useMemo(() => {
    const map = new Map<UUID, ExpenseItem>();
    for (const expense of expenses) map.set(expense.id, expense);
    return map;
  }, [expenses]);

  const visible = useMemo(() => {
    const scoped = groupId ? activities.filter((entry) => entry.groupId === groupId) : activities;

    if (scope === 'MINE') {
      return scoped.filter((entry) => entry.actorUserId === currentUserId);
    }
    if (scope === 'GROUPS') {
      return scoped.filter((entry) => entry.groupId !== undefined);
    }
    return scoped;
  }, [activities, groupId, scope, currentUserId]);

  /** Day buckets, newest first, each with its own running total of spending. */
  const dayBuckets = useMemo(() => {
    const buckets = new Map<string, ActivityLog[]>();
    for (const entry of visible) {
      const key = dayjs(entry.timestamp).format('YYYY-MM-DD');
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, entries]) => {
        const spend = entries.reduce((total, entry) => {
          const expense = expensesById.get(entry.entityId);
          if (!expense || expense.isSettlement) return total;
          return total + expense.amount;
        }, 0);

        return { day: key, entries, spend };
      });
  }, [visible, expensesById]);

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, ...style }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

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
            Activity
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            {visible.length} entr{visible.length === 1 ? 'y' : 'ies'}
            {groupId ? ' in this ledger' : ' across every ledger'}.
          </Typography.Text>
        </div>

        {!groupId ? (
          <Segmented<ActivityScope>
            value={scope}
            onChange={setScope}
            options={[
              { label: 'Everything', value: 'ALL' },
              { label: 'Just mine', value: 'MINE' },
              { label: 'Groups', value: 'GROUPS' },
            ]}
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <Card
          style={{ borderRadius: radii.lg, border: `1px dashed ${mintPalette.slateBorder}` }}
          styles={{ body: { padding: `${spacing.xxxl}px ${spacing.lg}px` } }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              scope === 'MINE'
                ? 'You have not recorded anything yet.'
                : 'No activity recorded yet. Adding an expense, creating a group or settling up all appear here.'
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {dayBuckets.map((bucket) => (
            <Card
              key={bucket.day}
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                  <span>{dayjs(bucket.day).format('dddd, MMM D, YYYY')}</span>
                  {bucket.spend > 0 ? (
                    <CurrencyDisplay amount={bucket.spend} currency={currency} size="sm" prefix="spent" />
                  ) : null}
                </div>
              }
              style={{ borderRadius: radii.lg, border: `1px solid ${mintPalette.slateBorder}` }}
              styles={{ body: { padding: spacing.lg } }}
            >
              <Timeline
                items={bucket.entries.map((entry) => {
                  const descriptor = ACTION_DESCRIPTORS[entry.action] ?? ACTION_DESCRIPTORS.EXPENSE_CREATED;
                  const actor = membersMap.get(entry.actorUserId);
                  const expense = expensesById.get(entry.entityId);
                  const group = entry.groupId ? groupsById.get(entry.groupId) : undefined;
                  const actionable = expense !== undefined && onSelectExpense !== undefined;

                  return {
                    key: entry.id,
                    dot: (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: BALANCE_TONES[descriptor.tone === 'info' || descriptor.tone === 'warning' ? 'settled' : descriptor.tone].surface,
                          color: BALANCE_TONES[descriptor.tone === 'info' || descriptor.tone === 'warning' ? 'settled' : descriptor.tone].text,
                          fontSize: 12,
                        }}
                      >
                        {descriptor.icon}
                      </span>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                          <UserAvatar
                            name={actor?.name ?? 'Someone'}
                            avatarUrl={actor?.avatarUrl}
                            size="xs"
                            showTooltip={false}
                          />
                          <Typography.Text strong style={{ fontSize: typography.sizes.body }}>
                            {actor?.id === currentUserId ? 'You' : (actor?.name.split(' ')[0] ?? 'Someone')}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                            {descriptor.label(entry)}
                          </Typography.Text>

                          {entry.metadata.amount !== undefined ? (
                            <CurrencyDisplay
                              amount={entry.metadata.amount}
                              currency={entry.metadata.currency ?? currency}
                              size="sm"
                              muted
                            />
                          ) : null}

                          {group ? <StatusPill tone="info">{group.name}</StatusPill> : null}

                          <Tooltip title={dayjs(entry.timestamp).format('MMM D, YYYY HH:mm')}>
                            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                              {dayjs(entry.timestamp).format('HH:mm')}
                            </Typography.Text>
                          </Tooltip>
                        </div>

                        <Typography.Text style={{ fontSize: typography.sizes.small, color: mintPalette.slateBody }}>
                          {entry.metadata.description ?? entry.entityId}
                          {entry.metadata.previousState ? ' — previous version recorded' : ''}
                        </Typography.Text>

                        {actionable ? (
                          <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, alignSelf: 'flex-start' }}
                            onClick={() => onSelectExpense?.(entry.entityId)}
                          >
                            Open expense ({renderMoney(expense.amount, expense.currency)})
                          </Button>
                        ) : onSelectGroup && group ? (
                          <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, alignSelf: 'flex-start' }}
                            onClick={() => onSelectGroup(group.id)}
                          >
                            Open group
                          </Button>
                        ) : null}
                      </div>
                    ),
                  };
                })}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { buildMembersMap } from '../utils/debtEngine';
import type {
  ActivityLog,
  ExpenseItem,
  Group,
  UserProfile,
  UserProfileMap,
  UUID,
} from '../types';

/**
 * Live ledger access.
 *
 * Dexie's `useLiveQuery` already re-runs a query whenever the underlying tables
 * change, so this hook exists to do three things rather than to duplicate that:
 * give every view the same loading contract, derive the cheap lookups once
 * instead of per component, and keep the queries stable across renders so a
 * keystroke never re-subscribes to IndexedDB.
 */

export interface LedgerData {
  /** `false` until the first read resolves, so views can show a real skeleton. */
  isReady: boolean;
  users: UserProfile[];
  groups: Group[];
  /** Newest first. */
  expenses: ExpenseItem[];
  /** Newest first. */
  activities: ActivityLog[];
  membersMap: UserProfileMap;
  /** Group lookup by id, for labelling rows and scoping views. */
  groupsById: Map<UUID, Group>;
  /** True when the database opened but holds no data at all. */
  isEmpty: boolean;
  /** Set when IndexedDB itself failed, e.g. private browsing with storage blocked. */
  error: string | null;
}

export function useLedgerData(): LedgerData {
  const users = useLiveQuery(() => db.users.orderBy('name').toArray(), []);
  const groups = useLiveQuery(() => db.groups.orderBy('name').toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []);
  const activities = useLiveQuery(() => db.activities.orderBy('timestamp').reverse().toArray(), []);

  const membersMap = useMemo(() => buildMembersMap(users ?? []), [users]);

  const groupsById = useMemo(() => {
    const map = new Map<UUID, Group>();
    for (const group of groups ?? []) map.set(group.id, group);
    return map;
  }, [groups]);

  const isReady =
    users !== undefined && groups !== undefined && expenses !== undefined && activities !== undefined;

  return {
    isReady,
    users: users ?? [],
    groups: groups ?? [],
    expenses: expenses ?? [],
    activities: activities ?? [],
    membersMap,
    groupsById,
    isEmpty: isReady && (users?.length ?? 0) === 0,
    error: null,
  };
}

/** Expenses belonging to one ledger: a group, or the direct peer-to-peer set. */
export function selectLedgerExpenses(
  expenses: ExpenseItem[],
  scope: { groupId: UUID | null } | { direct: true }
): ExpenseItem[] {
  if ('direct' in scope) return expenses.filter((expense) => expense.groupId === null);
  return expenses.filter((expense) => expense.groupId === scope.groupId);
}

/** Every expense both people take part in, newest first. */
export function selectSharedExpenses(
  expenses: ExpenseItem[],
  userId: UUID,
  counterpartyId: UUID
): ExpenseItem[] {
  return expenses.filter(
    (expense) =>
      isOnExpense(expense, userId) && isOnExpense(expense, counterpartyId)
  );
}

function isOnExpense(expense: ExpenseItem, userId: UUID): boolean {
  return (
    expense.paidBy.some((payer) => payer.userId === userId) ||
    expense.splits.some((split) => split.userId === userId)
  );
}

/** Groups the signed-in user belongs to, with their per-group exposure. */
export interface GroupSummary {
  group: Group;
  memberCount: number;
  expenseCount: number;
  totalSpend: number;
  /** Positive when the group owes the signed-in user, negative when they owe. */
  myNetBalance: number;
  lastActivityAt: string | null;
}

export function buildGroupSummaries(
  groups: Group[],
  expenses: ExpenseItem[],
  currentUserId: UUID,
  /** Signed net balance for one member of a ledger, e.g. `calculateNetBalances(...).get(userId)`. */
  computeNetFor: (
    userId: UUID,
    memberIds: UUID[],
    ledgerExpenses: ExpenseItem[],
    currency: Group['currency']
  ) => number
): GroupSummary[] {
  return groups
    // Only the ledgers this person actually belongs to: a group they are not a
    // member of has no balance to show them, and showing it would be noise.
    .filter((group) => group.members.some((member) => member.userId === currentUserId))
    .map((group) => {
      const ledgerExpenses = expenses.filter((expense) => expense.groupId === group.id);
      const memberIds = group.members.map((member) => member.userId);
      const relevant = ledgerExpenses.filter((expense) => expense.currency === group.currency);

      return {
        group,
        memberCount: group.members.length,
        expenseCount: ledgerExpenses.length,
        totalSpend: relevant
          .filter((expense) => !expense.isSettlement)
          .reduce((total, expense) => total + expense.amount, 0),
        myNetBalance: computeNetFor(currentUserId, memberIds, ledgerExpenses, group.currency),
        lastActivityAt: relevant.reduce<string | null>(
          (latest, expense) => (latest === null || expense.date > latest ? expense.date : latest),
          null
        ),
      };
    })
    .sort((a, b) => {
      // Groups with a live balance first, then most recent activity, then name.
      const aActive = Math.abs(a.myNetBalance) > 0.005 ? 1 : 0;
      const bActive = Math.abs(b.myNetBalance) > 0.005 ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;

      const aDate = a.lastActivityAt ?? '';
      const bDate = b.lastActivityAt ?? '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return a.group.name.localeCompare(b.group.name);
    });
}

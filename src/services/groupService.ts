import { db } from './db';
import { computeSplits } from '../utils/splitEngine';
import type {
  ActivityLog,
  CurrencyCode,
  ExpenseItem,
  Group,
  GroupCategory,
  ISODateString,
  UUID,
} from '../types';

/**
 * Group lifecycle and membership.
 *
 * Mirrors `expenseService`: every mutation is one Dexie transaction covering the
 * group row, the optional expense re-scoping, and the audit entry. Membership
 * changes are deliberately *not* allowed to orphan money — removing a member who
 * still has expenses is recorded, but the expenses stay and continue to be
 * attributed to them, because silently deleting someone's debts would be a data
 * loss bug, not a convenience.
 */

export interface GroupDraft {
  name: string;
  category: GroupCategory;
  description: string;
  currency: CurrencyCode;
  avatarIcon: string;
  memberIds: UUID[];
  simplifyDebts: boolean;
}

export interface GroupMutationResult {
  ok: boolean;
  groupId?: UUID;
  error?: string;
  /** Non-fatal notes for the UI, e.g. "that member still has 3 expenses". */
  warnings?: string[];
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function activity(input: {
  action: ActivityLog['action'];
  actorUserId: UUID;
  entityId: UUID;
  groupId?: UUID | null;
  metadata: ActivityLog['metadata'];
}): ActivityLog {
  const entry: ActivityLog = {
    id: newId('act'),
    actorUserId: input.actorUserId,
    action: input.action,
    entityId: input.entityId,
    metadata: input.metadata,
    timestamp: new Date().toISOString(),
  };
  if (input.groupId) entry.groupId = input.groupId;
  return entry;
}

export function validateGroupDraft(draft: GroupDraft): string | null {
  if (draft.name.trim().length === 0) return 'Give this group a name.';
  if (draft.name.trim().length > 60) return 'Group names are limited to 60 characters.';
  if (draft.memberIds.length === 0) return 'Add at least one person to this group.';
  return null;
}

export async function createGroup(draft: GroupDraft, actorUserId: UUID): Promise<GroupMutationResult> {
  const error = validateGroupDraft(draft);
  if (error) return { ok: false, error };

  const now = new Date().toISOString();
  const groupId = newId('group');

  // The creator always administers the group, even if they were not ticked.
  const memberIds = Array.from(new Set([actorUserId, ...draft.memberIds]));

  const group: Group = {
    id: groupId,
    name: draft.name.trim(),
    category: draft.category,
    description: draft.description.trim(),
    currency: draft.currency,
    avatarIcon: draft.avatarIcon,
    simplifyDebts: draft.simplifyDebts,
    members: memberIds.map((userId) => ({
      userId,
      joinedAt: now,
      role: userId === actorUserId ? 'ADMIN' : 'MEMBER',
    })),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', db.groups, db.activities, async () => {
    await db.groups.add(group);
    await db.activities.add(
      activity({
        action: 'GROUP_CREATED',
        actorUserId,
        entityId: groupId,
        groupId,
        metadata: { description: group.name },
      })
    );
  });

  return { ok: true, groupId };
}

export async function updateGroup(
  groupId: UUID,
  draft: GroupDraft,
  actorUserId: UUID
): Promise<GroupMutationResult> {
  const error = validateGroupDraft(draft);
  if (error) return { ok: false, error };

  const existing = await db.groups.get(groupId);
  if (!existing) return { ok: false, error: 'That group no longer exists.' };

  const isAdmin = existing.members.some(
    (member) => member.userId === actorUserId && member.role === 'ADMIN'
  );
  if (!isAdmin) {
    return { ok: false, error: 'Only group administrators can modify group configuration.' };
  }

  const now = new Date().toISOString();
  const memberIds = Array.from(new Set([actorUserId, ...draft.memberIds]));

  const updated: Group = {
    ...existing,
    name: draft.name.trim(),
    category: draft.category,
    description: draft.description.trim(),
    currency: draft.currency,
    avatarIcon: draft.avatarIcon,
    simplifyDebts: draft.simplifyDebts,
    members: memberIds.map((userId) => {
      const previous = existing.members.find((member) => member.userId === userId);
      return {
        userId,
        // Preserve the original join date: it is part of the audit trail.
        joinedAt: previous?.joinedAt ?? now,
        role: previous?.role ?? (userId === actorUserId ? 'ADMIN' : 'MEMBER'),
      };
    }),
    updatedAt: now,
  };

  await db.transaction('rw', db.groups, db.activities, async () => {
    await db.groups.put(updated);
    await db.activities.add(
      activity({
        action: 'GROUP_UPDATED',
        actorUserId,
        entityId: groupId,
        groupId,
        metadata: {
          description: updated.name,
          previousState: JSON.stringify(existing),
        },
      })
    );
  });

  return { ok: true, groupId };
}

/** Adds an existing person to a group. Idempotent. */
export async function addGroupMember(
  groupId: UUID,
  userId: UUID,
  actorUserId: UUID
): Promise<GroupMutationResult> {
  const group = await db.groups.get(groupId);
  if (!group) return { ok: false, error: 'That group no longer exists.' };

  const isAdmin = group.members.some(
    (member) => member.userId === actorUserId && member.role === 'ADMIN'
  );
  if (!isAdmin) {
    return { ok: false, error: 'Only group administrators can add members.' };
  }

  if (group.members.some((member) => member.userId === userId)) {
    return { ok: true, groupId, warnings: ['That person is already in this group.'] };
  }

  const now = new Date().toISOString();
  await db.transaction('rw', db.groups, db.activities, async () => {
    await db.groups.put({
      ...group,
      members: [...group.members, { userId, joinedAt: now, role: 'MEMBER' }],
      updatedAt: now,
    });
    await db.activities.add(
      activity({
        action: 'MEMBER_ADDED',
        actorUserId,
        entityId: groupId,
        groupId,
        metadata: { description: `Member added to ${group.name}` },
      })
    );
  });

  return { ok: true, groupId };
}

/**
 * Removes a person from a group.
 *
 * Refuses when they still carry a share of the ledger: dropping them would either
 * orphan their expenses or silently redistribute their debt, and neither is a
 * decision this function is allowed to make on the user's behalf.
 */
export async function removeGroupMember(
  groupId: UUID,
  userId: UUID,
  actorUserId: UUID
): Promise<GroupMutationResult> {
  const group = await db.groups.get(groupId);
  if (!group) return { ok: false, error: 'That group no longer exists.' };

  const isActorAdmin = group.members.some(
    (member) => member.userId === actorUserId && member.role === 'ADMIN'
  );
  if (!isActorAdmin && actorUserId !== userId) {
    return { ok: false, error: 'Only administrators or the members themselves can leave or remove members.' };
  }

  const remainingMembers = group.members.filter((member) => member.userId !== userId);
  if (remainingMembers.length === group.members.length) {
    return { ok: false, error: 'That person is not in this group.' };
  }
  if (remainingMembers.length === 0) {
    return { ok: false, error: 'A group needs at least one member.' };
  }

  const isTargetAdmin = group.members.some(
    (member) => member.userId === userId && member.role === 'ADMIN'
  );
  const remainingAdmins = remainingMembers.filter((member) => member.role === 'ADMIN');
  if (isTargetAdmin && remainingAdmins.length === 0) {
    return { ok: false, error: 'Cannot remove the sole administrator. Promote another member to admin first.' };
  }

  let removalError: string | null = null;
  const now = new Date().toISOString();

  await db.transaction('rw', db.groups, db.expenses, db.activities, async () => {
    const currentGroup = await db.groups.get(groupId);
    if (!currentGroup) {
      removalError = 'That group no longer exists.';
      return;
    }

    const groupExpenses = await db.expenses.where('groupId').equals(groupId).toArray();
    const involved = groupExpenses.filter(
      (expense) =>
        expense.paidBy.some((payer) => payer.userId === userId) ||
        expense.splits.some((split) => split.userId === userId)
    );
    if (involved.length > 0) {
      removalError = `They still appear on ${involved.length} expense${involved.length === 1 ? '' : 's'} in this group. Delete or reassign those first.`;
      return;
    }

    await db.groups.put({ ...currentGroup, members: remainingMembers, updatedAt: now });
    await db.activities.add(
      activity({
        action: 'MEMBER_REMOVED',
        actorUserId,
        entityId: groupId,
        groupId,
        metadata: { description: `Member removed from ${currentGroup.name}` },
      })
    );
  });

  if (removalError) return { ok: false, error: removalError };
  return { ok: true, groupId };
}

/**
 * Deletes a group.
 *
 * Refuses while expenses reference it, for the same reason membership removal
 * does: the expenses would be left pointing at a group that no longer exists.
 */
export async function deleteGroup(groupId: UUID, actorUserId: UUID): Promise<GroupMutationResult> {
  const group = await db.groups.get(groupId);
  if (!group) return { ok: false, error: 'That group no longer exists.' };

  const isAdmin = group.members.some(
    (member) => member.userId === actorUserId && member.role === 'ADMIN'
  );
  if (!isAdmin) {
    return { ok: false, error: 'Only group administrators can delete this group.' };
  }

  let deletionError: string | null = null;

  await db.transaction('rw', db.groups, db.expenses, db.activities, async () => {
    // Re-read inside the critical section. Two concurrent deletes must not both
    // pass the guard above: Dexie serialises these transactions, so the loser
    // sees the row already gone instead of writing a second audit entry for one
    // deletion and reporting a success that never happened.
    const current = await db.groups.get(groupId);
    if (!current) {
      deletionError = 'That group no longer exists.';
      return;
    }

    const expenseCount = await db.expenses.where('groupId').equals(groupId).count();
    if (expenseCount > 0) {
      deletionError = `This group still has ${expenseCount} expense${expenseCount === 1 ? '' : 's'}. Delete them first, or keep the group as an archive.`;
      return;
    }

    await db.groups.delete(groupId);
    await db.activities.add(
      activity({
        action: 'GROUP_DELETED',
        actorUserId,
        entityId: groupId,
        groupId,
        metadata: { description: current.name, previousState: JSON.stringify(current) },
      })
    );
  });

  if (deletionError) {
    return { ok: false, error: deletionError };
  }

  return { ok: true, groupId };
}

/**
 * Recomputes a group's stored currency from its expenses.
 *
 * A group is a single-currency ledger by construction (see the debt engine's
 * currency partitioning), so this reports a mismatch instead of silently mixing
 * currencies in one balance vector.
 */
export function summariseGroupCurrencies(
  expenses: ExpenseItem[],
  groupCurrency: CurrencyCode
): { consistent: boolean; currencies: CurrencyCode[] } {
  const currencies = Array.from(new Set(expenses.map((expense) => expense.currency)));
  return {
    consistent: currencies.every((currency) => currency === groupCurrency),
    currencies,
  };
}

/** Rebuilds the splits of an existing expense after its total amount changed. */
export function rebuildSplitsForAmount(
  expense: ExpenseItem,
  newAmount: number
): ReturnType<typeof computeSplits> {
  const customValues: Record<UUID, number> = {};
  for (const split of expense.splits) {
    customValues[split.userId] =
      split.rawInput ?? split.percentage ?? split.shares ?? split.owedAmount;
  }

  return computeSplits({
    totalAmount: newAmount,
    splitType: expense.splitType,
    participantIds: expense.splits.map((split) => split.userId),
    customValues: expense.splitType === 'EQUAL' ? undefined : customValues,
    currency: expense.currency,
  });
}

/** Timestamp helper kept here so group and expense services agree on the format. */
export function nowIso(): ISODateString {
  return new Date().toISOString();
}

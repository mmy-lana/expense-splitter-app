import { db } from './db';
import { computeSplits } from '../utils/splitEngine';
import { validateExpenseDraft } from '../utils/expenseValidation';
import type { ExpenseDraft } from '../utils/expenseValidation';
import { toMinorUnits } from '../utils/currency';
import type { ActivityLog, CurrencyCode, ExpenseItem, ISODateString, UUID } from '../types';

/**
 * Ledger write operations.
 *
 * Every mutation of the ledger goes through this module so three invariants hold
 * no matter which organism triggered it:
 *
 *  1. each write is a single ACID Dexie transaction covering both the row and
 *     its audit-trail entry, so history can never disagree with the ledger;
 *  2. the stored splits are always produced by `computeSplits`, never by the
 *     caller, so Σ owed === total to the exact penny;
 *  3. validation runs *before* the transaction opens, so a rejected expense
 *     cannot leave a partial write behind.
 */

export type { ExpenseDraft } from '../utils/expenseValidation';
export { validateDraft, validateExpenseDraft } from '../utils/expenseValidation';

export interface LedgerMutationResult {
  ok: boolean;
  expenseId?: UUID;
  error?: string;
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/** Creates the matching audit entry for a ledger mutation. */
function buildActivity(input: {
  action: ActivityLog['action'];
  actorUserId: UUID;
  entityId: UUID;
  groupId?: UUID | null;
  metadata: ActivityLog['metadata'];
  timestamp: ISODateString;
}): ActivityLog {
  const entry: ActivityLog = {
    id: newId('act'),
    actorUserId: input.actorUserId,
    action: input.action,
    entityId: input.entityId,
    metadata: input.metadata,
    timestamp: input.timestamp,
  };
  if (input.groupId) entry.groupId = input.groupId;
  return entry;
}

/**
 * Pre-flight validation shared by create and update.
 * @returns an error message, or `null` when the draft is safe to persist.
 */

/** Creates an expense, its splits, and its audit entry in one transaction. */
export async function createExpense(
  draft: ExpenseDraft,
  actorUserId: UUID
): Promise<LedgerMutationResult> {
  const validationError = validateExpenseDraft(draft);
  if (validationError) return { ok: false, error: validationError };

  const splitResult = computeSplits({
    totalAmount: draft.amount,
    splitType: draft.splitType,
    participantIds: draft.participantIds,
    customValues: draft.customValues,
    currency: draft.currency,
  });

  const expenseId = newId('exp');
  const now = new Date().toISOString();

  const expense: ExpenseItem = {
    id: expenseId,
    groupId: draft.groupId,
    description: draft.description.trim(),
    category: draft.category,
    amount: draft.amount,
    currency: draft.currency,
    paidBy: draft.paidBy,
    splitType: draft.splitType,
    splits: splitResult.splits,
    date: draft.date,
    isSettlement: false,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  if (draft.notes && draft.notes.trim().length > 0) expense.notes = draft.notes.trim();
  if (draft.receiptDataUrl) expense.receiptDataUrl = draft.receiptDataUrl;

  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.add(expense);
    await db.activities.add(
      buildActivity({
        action: 'EXPENSE_CREATED',
        actorUserId,
        entityId: expenseId,
        groupId: draft.groupId,
        metadata: {
          description: expense.description,
          amount: expense.amount,
          currency: expense.currency,
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

/** Updates an expense in place, keeping the previous state in the audit trail. */
export async function updateExpense(
  expenseId: UUID,
  draft: ExpenseDraft,
  actorUserId: UUID
): Promise<LedgerMutationResult> {
  const validationError = validateExpenseDraft(draft);
  if (validationError) return { ok: false, error: validationError };

  const existing = await db.expenses.get(expenseId);
  if (!existing) return { ok: false, error: 'That expense no longer exists.' };

  const splitResult = computeSplits({
    totalAmount: draft.amount,
    splitType: draft.splitType,
    participantIds: draft.participantIds,
    customValues: draft.customValues,
    currency: draft.currency,
  });

  const now = new Date().toISOString();
  const updated: ExpenseItem = {
    ...existing,
    groupId: draft.groupId,
    description: draft.description.trim(),
    category: draft.category,
    amount: draft.amount,
    currency: draft.currency,
    paidBy: draft.paidBy,
    splitType: draft.splitType,
    splits: splitResult.splits,
    date: draft.date,
    updatedAt: now,
    createdBy: existing.createdBy,
  };

  if (draft.notes && draft.notes.trim().length > 0) {
    updated.notes = draft.notes.trim();
  } else {
    delete updated.notes;
  }

  if (draft.receiptDataUrl) {
    updated.receiptDataUrl = draft.receiptDataUrl;
  } else {
    delete updated.receiptDataUrl;
  }

  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.put(updated);
    await db.activities.add(
      buildActivity({
        action: 'EXPENSE_UPDATED',
        actorUserId,
        entityId: expenseId,
        groupId: updated.groupId,
        metadata: {
          description: updated.description,
          amount: updated.amount,
          currency: updated.currency,
          // Audit trail: the row as it was, so a disputed change is traceable.
          previousState: JSON.stringify(existing),
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

/** Deletes an expense, recording the removed row in the audit trail. */
export async function deleteExpense(
  expenseId: UUID,
  actorUserId: UUID
): Promise<LedgerMutationResult> {
  const existing = await db.expenses.get(expenseId);
  if (!existing) return { ok: false, error: 'That expense no longer exists.' };

  const now = new Date().toISOString();

  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.delete(expenseId);
    await db.activities.add(
      buildActivity({
        action: 'EXPENSE_DELETED',
        actorUserId,
        entityId: expenseId,
        groupId: existing.groupId,
        metadata: {
          description: existing.description,
          amount: existing.amount,
          currency: existing.currency,
          previousState: JSON.stringify(existing),
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

/**
 * Records a debt payoff.
 *
 * A settlement is modelled as an expense in which the payer fronted the whole
 * amount and the recipient carries the entire share: the two balances move in
 * opposite directions by exactly the same number of pennies, which is what
 * "settled" means arithmetically. It is flagged `isSettlement` so analytics and
 * the default ledger view exclude it from spending.
 */
export async function recordSettlement(input: {
  fromUserId: UUID;
  toUserId: UUID;
  amount: number;
  currency: CurrencyCode;
  groupId?: UUID | null;
  note?: string;
  date?: ISODateString;
}): Promise<LedgerMutationResult> {
  if (input.fromUserId === input.toUserId) {
    return { ok: false, error: 'A payment needs two different people.' };
  }
  if (!Number.isFinite(input.amount) || toMinorUnits(input.amount, input.currency) <= 0) {
    return { ok: false, error: 'Enter a payment amount greater than zero.' };
  }

  const expenseId = newId('settle');
  const now = new Date().toISOString();
  const date = input.date ?? now;

  const settlement: ExpenseItem = {
    id: expenseId,
    groupId: input.groupId ?? null,
    description: 'Settlement Payment',
    category: 'GENERAL',
    amount: input.amount,
    currency: input.currency,
    paidBy: [{ userId: input.fromUserId, amountPaid: input.amount }],
    splitType: 'EXACT',
    splits: [{ userId: input.toUserId, owedAmount: input.amount }],
    date,
    isSettlement: true,
    createdBy: input.fromUserId,
    createdAt: now,
    updatedAt: now,
  };

  if (input.note && input.note.trim().length > 0) settlement.notes = input.note.trim();

  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.add(settlement);
    await db.activities.add(
      buildActivity({
        action: 'SETTLEMENT_RECORDED',
        actorUserId: input.fromUserId,
        entityId: expenseId,
        groupId: settlement.groupId,
        metadata: {
          description: settlement.description,
          amount: settlement.amount,
          currency: settlement.currency,
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

/** Persists a receipt image onto an existing expense. */
export async function attachReceipt(
  expenseId: UUID,
  receiptDataUrl: string,
  actorUserId: UUID
): Promise<LedgerMutationResult> {
  const existing = await db.expenses.get(expenseId);
  if (!existing) return { ok: false, error: 'That expense no longer exists.' };

  const now = new Date().toISOString();
  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.put({ ...existing, receiptDataUrl, updatedAt: now });
    await db.activities.add(
      buildActivity({
        action: 'EXPENSE_UPDATED',
        actorUserId,
        entityId: expenseId,
        groupId: existing.groupId,
        metadata: {
          description: `Receipt attached to ${existing.description}`,
          amount: existing.amount,
          currency: existing.currency,
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

/**
 * Removes a receipt image from an expense.
 *
 * This is an update, never a delete: the money is real whether or not the paper
 * survives, and a receipt payload is often the largest row in the database.
 */
export async function removeReceipt(
  expenseId: UUID,
  actorUserId: UUID
): Promise<LedgerMutationResult> {
  const existing = await db.expenses.get(expenseId);
  if (!existing) return { ok: false, error: 'That expense no longer exists.' };
  if (!existing.receiptDataUrl) {
    return { ok: true, expenseId };
  }

  const now = new Date().toISOString();
  const { receiptDataUrl: _discarded, ...withoutReceipt } = existing;

  await db.transaction('rw', db.expenses, db.activities, async () => {
    await db.expenses.put({ ...withoutReceipt, updatedAt: now });
    await db.activities.add(
      buildActivity({
        action: 'EXPENSE_UPDATED',
        actorUserId,
        entityId: expenseId,
        groupId: existing.groupId,
        metadata: {
          description: `Receipt removed from ${existing.description}`,
          amount: existing.amount,
          currency: existing.currency,
        },
        timestamp: now,
      })
    );
  });

  return { ok: true, expenseId };
}

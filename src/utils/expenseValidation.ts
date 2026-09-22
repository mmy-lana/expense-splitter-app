import type {
  CurrencyCode,
  ExpenseCategory,
  ExpensePayer,
  ISODateString,
  SplitType,
  UUID,
} from '../types';
import { computeSplits, isSplitBalanced } from './splitEngine';
import { toMinorUnits } from './currency';

/**
 * Expense draft validation.
 *
 * The rules that decide whether an expense may be written are domain rules, not
 * persistence concerns, so they live here rather than in the Dexie service. The
 * form uses them to disable Save with an explanation, and `createExpense` /
 * `updateExpense` use the same function as their last line of defence — one
 * implementation, so the UI can never permit something the write path rejects.
 */

export interface ExpenseDraft {
  groupId: UUID | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  paidBy: ExpensePayer[];
  splitType: SplitType;
  /** Participant ids, in display order (drives the penny-remainder assignment). */
  participantIds: UUID[];
  /** Raw input per participant for non-EQUAL splits. */
  customValues?: Record<UUID, number>;
  date: ISODateString;
  notes?: string;
  receiptDataUrl?: string;
}

export interface DraftValidation {
  /** `null` when the draft may be persisted. */
  error: string | null;
  /** Every problem found, in the order a user should fix them. */
  problems: string[];
  /** The splits the engine would store, for previews and dry runs. */
  splits: ReturnType<typeof computeSplits>['splits'];
}

function draftProblems(draft: ExpenseDraft): string[] {
  const problems: string[] = [];

  if (draft.description.trim().length === 0) {
    problems.push('Give this expense a description.');
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    problems.push('Enter an amount greater than zero.');
  }
  if (draft.participantIds.length === 0) {
    problems.push('Select at least one person to split this expense with.');
  }
  if (new Set(draft.participantIds).size !== draft.participantIds.length) {
    problems.push('Each person may only appear once in a split.');
  }
  if (draft.paidBy.length === 0) {
    problems.push('Select who paid for this expense.');
  }

  const duplicatePayer = draft.paidBy.length !== new Set(draft.paidBy.map((p) => p.userId)).size;
  if (duplicatePayer) {
    problems.push('A payer may only appear once; combine their amounts.');
  }

  const negativePayer = draft.paidBy.find((payer) => !Number.isFinite(payer.amountPaid) || payer.amountPaid < 0);
  if (negativePayer) {
    problems.push('A payer amount cannot be negative.');
  }

  return problems;
}

/**
 * Validates a draft and reports the exact splits that would be stored.
 *
 * Amount problems are reported before split problems so the user is not asked to
 * fix a percentage split of a total that is still zero.
 */
export function validateDraft(draft: ExpenseDraft): DraftValidation {
  const problems = draftProblems(draft);

  // Without a usable total there is nothing meaningful to split.
  if (problems.length > 0) {
    return { error: problems[0], problems, splits: [] };
  }

  const paidMinorUnits = draft.paidBy.reduce(
    (total, payer) => total + toMinorUnits(payer.amountPaid, draft.currency),
    0
  );
  if (paidMinorUnits !== toMinorUnits(draft.amount, draft.currency)) {
    problems.push('The amounts each payer fronted must add up to the expense total.');
    return { error: problems[0], problems, splits: [] };
  }

  const splitResult = computeSplits({
    totalAmount: draft.amount,
    splitType: draft.splitType,
    participantIds: draft.participantIds,
    customValues: draft.customValues,
    currency: draft.currency,
  });

  if (!splitResult.isValid) {
    problems.push(splitResult.validationError ?? 'This split is not valid.');
    return { error: problems[0], problems, splits: splitResult.splits };
  }

  if (!isSplitBalanced(draft.amount, splitResult.splits, draft.currency)) {
    problems.push('The split does not reconcile with the expense total.');
    return { error: problems[0], problems, splits: splitResult.splits };
  }

  return { error: null, problems: [], splits: splitResult.splits };
}

/** Convenience wrapper for callers that only need the first error. */
export function validateExpenseDraft(draft: ExpenseDraft): string | null {
  return validateDraft(draft).error;
}

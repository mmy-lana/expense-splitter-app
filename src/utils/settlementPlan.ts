import type { CurrencyCode, ExpenseItem, UUID } from '../types';
import { calculatePairwiseBalance } from './debtEngine';
import { fromMinorUnits, toMinorUnits } from './currency';

/**
 * Settlement planning.
 *
 * The wizard's decisions — what amount to suggest, whether the user may submit,
 * whether this payment clears the debt, what would remain — are pure arithmetic
 * over the ledger. Keeping them here rather than inside the modal means the rules
 * are exercised directly by the verification harness and cannot drift from the
 * write path, which is where a settlement actually changes the balances.
 */

/** Where the two parties currently stand, from `fromUserId`'s perspective. */
export type SettlementPosition = 'OWES' | 'OWED' | 'SETTLED';

export interface SettlementPlanInput {
  fromUserId: UUID;
  toUserId: UUID;
  /** The amount the user is proposing, in major units. */
  amount: number;
  currency: CurrencyCode;
  expenses: ExpenseItem[];
}

export interface SettlementPlan {
  /** Pairwise balance: negative means `fromUserId` owes `toUserId`. */
  pairwiseBalance: number;
  position: SettlementPosition;
  /** What is outstanding, as a positive magnitude. */
  outstanding: number;
  /** The proposed amount in integer minor units. */
  amountMinorUnits: number;
  /** True when the payment is allowed to be written. */
  canSubmit: boolean;
  /** Why it is not submittable, or `null`. */
  validationError: string | null;
  /** True when this payment settles the debt completely. */
  clearsBalance: boolean;
  /** What would still be owed afterwards, as a positive magnitude. */
  remainingAfter: number;
  /** True when the amount exceeds what is actually owed. */
  overpays: boolean;
}

/**
 * The amount to pre-fill: exactly what is outstanding, rounded to the currency.
 *
 * "One-click settle" is only honest if the pre-filled number really does clear
 * the balance, so this is derived, never guessed.
 */
export function suggestSettlementAmount(
  fromUserId: UUID,
  toUserId: UUID,
  expenses: ExpenseItem[],
  currency: CurrencyCode = 'USD'
): number {
  const pairwise = calculatePairwiseBalance(fromUserId, toUserId, expenses, currency);
  if (pairwise >= 0) return 0;
  return fromMinorUnits(toMinorUnits(Math.abs(pairwise), currency), currency);
}

/** True when the two ids identify different people. */
export function isSelfSettlement(fromUserId: UUID, toUserId: UUID): boolean {
  return fromUserId === toUserId || toUserId.length === 0;
}

export function buildSettlementPlan(input: SettlementPlanInput): SettlementPlan {
  const { fromUserId, toUserId, amount, currency, expenses } = input;

  const pairwiseBalance = calculatePairwiseBalance(fromUserId, toUserId, expenses, currency);
  const position: SettlementPosition =
    pairwiseBalance < 0 ? 'OWES' : pairwiseBalance > 0 ? 'OWED' : 'SETTLED';

  const outstanding = Math.abs(pairwiseBalance);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const amountMinorUnits = toMinorUnits(safeAmount, currency);

  let validationError: string | null = null;
  if (fromUserId === toUserId) {
    validationError = 'A payment needs two different people.';
  } else if (toUserId.length === 0) {
    validationError = 'Choose who receives the payment.';
  } else if (amountMinorUnits <= 0) {
    validationError = 'Enter a payment amount greater than zero.';
  }

  const outstandingMinorUnits = toMinorUnits(outstanding, currency);
  const clearsBalance = position === 'OWES' && amountMinorUnits >= outstandingMinorUnits && outstandingMinorUnits > 0;
  const overpays = position === 'OWES' && amountMinorUnits > outstandingMinorUnits;

  // A payment between two people who are already settled simply flips the debt
  // in the other direction, so "remaining" is the resulting magnitude either way.
  const remainingAfter =
    position === 'OWES'
      ? Math.max(0, outstandingMinorUnits - amountMinorUnits)
      : amountMinorUnits;

  return {
    pairwiseBalance,
    position,
    outstanding,
    amountMinorUnits,
    canSubmit: validationError === null,
    validationError,
    clearsBalance,
    remainingAfter: fromMinorUnits(remainingAfter, currency),
    overpays,
  };
}

/** Human phrasing for the plan, used by the wizard's confirmation copy. */
export function describeSettlementPosition(
  position: SettlementPosition,
  fromName: string,
  toName: string,
  outstanding: number,
  currency: CurrencyCode
): string {
  const amount = `${currency === 'JPY' ? '¥' : ''}${outstanding.toFixed(currency === 'JPY' ? 0 : 2)}`;

  if (position === 'OWES') return `${fromName} owes ${toName} ${amount}`;
  if (position === 'OWED') return `${toName} owes ${fromName} ${amount}`;
  return `${fromName} and ${toName} are settled up`;
}

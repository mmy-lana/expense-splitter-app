import BigNumber from 'bignumber.js';
import type {
  CurrencyCode,
  ExpenseSplitParticipant,
  SplitType,
  UUID,
} from '../types';
import {
  BASE_CURRENCY,
  ZERO_EPSILON,
  fromMinorUnits,
  toMinorUnits,
} from './currency';

/**
 * Split Calculator Engine with penny-rounding resolution.
 *
 * Naive division (`100 / 3 = 33.333...`) leaks cents: the participants' debts no
 * longer add up to the expense total, and the ledger drifts forever. This engine
 * always works in integer minor units (pennies), floors every proportional share
 * and then hands the residual pennies out sequentially so that:
 *
 *     Σ splits[i].owedAmount === totalAmount   (exact, to the last penny)
 */

export interface CalculateSplitInput {
  totalAmount: number;
  splitType: SplitType;
  participantIds: UUID[];
  /** Exact amounts, percentages, or share counts, keyed by user id. */
  customValues?: Record<UUID, number>;
  currency?: CurrencyCode;
}

export interface SplitResult {
  splits: ExpenseSplitParticipant[];
  isValid: boolean;
  validationError?: string;
}

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  EQUAL: 'Equally',
  EXACT: 'Exact Amounts',
  PERCENT: 'Percentages',
  SHARES: 'Shares',
};

export const SPLIT_TYPE_OPTIONS: { label: string; value: SplitType }[] = (
  Object.keys(SPLIT_TYPE_LABELS) as SplitType[]
).map((value) => ({ label: SPLIT_TYPE_LABELS[value], value }));

export const SPLIT_TYPE_HINTS: Record<SplitType, string> = {
  EQUAL: 'Everyone selected pays the same amount; leftover pennies are assigned in order.',
  EXACT: 'Type the exact amount each person owes. The amounts must add up to the total.',
  PERCENT: 'Assign a percentage to each person. The percentages must add up to 100%.',
  SHARES: 'Weight the split by shares (2 shares pays twice as much as 1 share).',
};

export function describeSplitType(splitType: SplitType): string {
  return SPLIT_TYPE_LABELS[splitType] ?? splitType;
}

function invalid(validationError: string): SplitResult {
  return { splits: [], isValid: false, validationError };
}

function invalidWithSplits(
  splits: ExpenseSplitParticipant[],
  validationError: string
): SplitResult {
  return { splits, isValid: false, validationError };
}

/** Distributes `remainder` pennies one at a time across the leading entries. */
function distributeRemainder<T extends { minorUnits: number }>(
  entries: T[],
  remainder: number
): void {
  let remaining = remainder;
  for (let i = 0; i < entries.length && remaining > 0; i++) {
    entries[i].minorUnits += 1;
    remaining -= 1;
  }
}

function toSplit(userId: UUID, minorUnits: number, currency: CurrencyCode): ExpenseSplitParticipant {
  return { userId, owedAmount: fromMinorUnits(minorUnits, currency) };
}

/**
 * Pre-flight validation used by forms to surface an error before the engine runs.
 * Returns `null` when the input is acceptable.
 */
export function validateSplitInput(input: CalculateSplitInput): string | null {
  const { totalAmount, splitType, participantIds, customValues = {} } = input;

  if (participantIds.length === 0) {
    return 'Select at least one person to split this expense with.';
  }
  if (new Set(participantIds).size !== participantIds.length) {
    return 'Each participant may only appear once in a split.';
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return 'Enter an expense amount greater than zero.';
  }

  const values = participantIds.map((id) => customValues[id] ?? 0);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return 'Split values must be zero or greater.';
  }

  if (splitType === 'PERCENT') {
    const sum = values.reduce((total, value) => total.plus(new BigNumber(value)), new BigNumber(0));
    if (!sum.isEqualTo(100)) {
      return `Percentages must add up to exactly 100%. Current sum: ${sum.toFixed(2)}%`;
    }
  }

  if (splitType === 'SHARES') {
    const totalShares = values.reduce((total, value) => total + Math.floor(value), 0);
    if (totalShares <= 0) {
      return 'Total shares must be greater than zero.';
    }
  }

  return null;
}

export function computeSplits(input: CalculateSplitInput): SplitResult {
  const {
    totalAmount,
    splitType,
    participantIds,
    customValues = {},
    currency = BASE_CURRENCY,
  } = input;

  const preflightError = validateSplitInput(input);
  if (preflightError) return invalid(preflightError);

  const count = participantIds.length;
  const totalMinorUnits = toMinorUnits(totalAmount, currency);
  if (totalMinorUnits <= 0) {
    return invalid('The expense amount rounds to zero in this currency.');
  }

  switch (splitType) {
    case 'EQUAL': {
      const baseShare = Math.floor(totalMinorUnits / count);
      const entries = participantIds.map((userId) => ({
        userId,
        minorUnits: baseShare,
      }));
      distributeRemainder(entries, totalMinorUnits - baseShare * count);

      return {
        splits: entries.map((entry) => toSplit(entry.userId, entry.minorUnits, currency)),
        isValid: true,
      };
    }

    case 'EXACT': {
      const entries = participantIds.map((userId) => {
        const value = customValues[userId] ?? 0;
        return { userId, minorUnits: toMinorUnits(value, currency), rawInput: value };
      });

      const sumEntered = entries.reduce((total, entry) => total + entry.minorUnits, 0);
      const splits = entries.map((entry) => ({
        ...toSplit(entry.userId, entry.minorUnits, currency),
        rawInput: entry.rawInput,
      }));

      const difference = totalMinorUnits - sumEntered;
      if (difference !== 0) {
        const direction = difference > 0 ? 'remaining' : 'over by';
        return invalidWithSplits(
          splits,
          `Exact amounts total ${fromMinorUnits(sumEntered, currency).toFixed(2)}, which does not match the expense total ${totalAmount.toFixed(2)}. You are ${direction} ${fromMinorUnits(Math.abs(difference), currency).toFixed(2)}.`
        );
      }

      return { splits, isValid: true };
    }

    case 'PERCENT': {
      const entries = participantIds.map((userId) => {
        const percentage = customValues[userId] ?? 0;
        const rawMinorUnits = new BigNumber(totalMinorUnits)
          .times(percentage)
          .dividedBy(100)
          .integerValue(BigNumber.ROUND_FLOOR)
          .toNumber();
        return { userId, minorUnits: rawMinorUnits, percentage };
      });

      const distributed = entries.reduce((total, entry) => total + entry.minorUnits, 0);
      distributeRemainder(entries, totalMinorUnits - distributed);

      return {
        splits: entries.map((entry) => ({
          ...toSplit(entry.userId, entry.minorUnits, currency),
          percentage: entry.percentage,
          rawInput: entry.percentage,
        })),
        isValid: true,
      };
    }

    case 'SHARES': {
      const entries = participantIds.map((userId) => ({
        userId,
        shares: Math.max(0, Math.floor(customValues[userId] ?? 1)),
      }));
      const totalShares = entries.reduce((total, entry) => total + entry.shares, 0);

      if (totalShares <= 0) {
        return invalid('Total shares must be greater than zero.');
      }

      const allocations = entries.map((entry) => ({
        userId: entry.userId,
        shares: entry.shares,
        minorUnits: new BigNumber(totalMinorUnits)
          .times(entry.shares)
          .dividedBy(totalShares)
          .integerValue(BigNumber.ROUND_FLOOR)
          .toNumber(),
      }));

      const distributed = allocations.reduce((total, entry) => total + entry.minorUnits, 0);
      distributeRemainder(allocations, totalMinorUnits - distributed);

      return {
        splits: allocations.map((entry) => ({
          ...toSplit(entry.userId, entry.minorUnits, currency),
          shares: entry.shares,
          rawInput: entry.shares,
        })),
        isValid: true,
      };
    }

    default: {
      return invalid(`Unsupported split type: ${String(splitType)}`);
    }
  }
}

/** Exact decimal sum of every participant's owed amount. */
export function sumSplitAmounts(splits: ExpenseSplitParticipant[]): number {
  return splits
    .reduce((total, split) => total.plus(new BigNumber(split.owedAmount)), new BigNumber(0))
    .toNumber();
}

/** True when the splits reproduce the expense total to the exact penny. */
export function isSplitBalanced(
  totalAmount: number,
  splits: ExpenseSplitParticipant[],
  currency: CurrencyCode = BASE_CURRENCY
): boolean {
  const totalMinorUnits = toMinorUnits(totalAmount, currency);
  const splitMinorUnits = splits.reduce(
    (total, split) => total + toMinorUnits(split.owedAmount, currency),
    0
  );
  return totalMinorUnits === splitMinorUnits;
}

/**
 * Recomputes an existing expense's splits after its total amount changed,
 * preserving the original split semantics where possible.
 */
export function recomputeSplitsForAmount(
  splitType: SplitType,
  totalAmount: number,
  splits: ExpenseSplitParticipant[],
  currency: CurrencyCode = BASE_CURRENCY
): SplitResult {
  const participantIds = splits.map((split) => split.userId);

  if (splitType === 'EQUAL') {
    return computeSplits({ totalAmount, splitType, participantIds, currency });
  }

  const customValues: Record<UUID, number> = {};
  for (const split of splits) {
    const value = split.rawInput ?? split.percentage ?? split.shares ?? split.owedAmount;
    customValues[split.userId] = value;
  }

  if (splitType === 'EXACT') {
    // Exact splits cannot be scaled: the user must re-enter the amounts.
    const currentTotal = sumSplitAmounts(splits);
    if (new BigNumber(currentTotal).abs().minus(totalAmount).abs().isGreaterThan(ZERO_EPSILON)) {
      return {
        splits,
        isValid: false,
        validationError:
          'Exact-amount splits must be re-entered when the expense total changes.',
      };
    }
  }

  return computeSplits({ totalAmount, splitType, participantIds, customValues, currency });
}

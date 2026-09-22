import BigNumber from 'bignumber.js';
import type {
  UUID,
  CurrencyCode,
  ExpenseItem,
  DebtTransfer,
  SplitType,
  ExpenseSplitParticipant,
} from '../types';

export function calculateSimplifiedDebts(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode
): DebtTransfer[] {
  const balanceMap = new Map<UUID, BigNumber>();
  for (const id of memberIds) {
    balanceMap.set(id, new BigNumber(0));
  }

  for (const expense of expenses) {
    if (expense.currency !== currency) continue;

    for (const payer of expense.paidBy) {
      const current = balanceMap.get(payer.userId) ?? new BigNumber(0);
      balanceMap.set(payer.userId, current.plus(new BigNumber(payer.amountPaid)));
    }

    for (const split of expense.splits) {
      const current = balanceMap.get(split.userId) ?? new BigNumber(0);
      balanceMap.set(split.userId, current.minus(new BigNumber(split.owedAmount)));
    }
  }

  interface BalanceNode {
    userId: UUID;
    balance: BigNumber;
  }

  const creditors: BalanceNode[] = [];
  const debtors: BalanceNode[] = [];
  const ZERO = new BigNumber(0.005);

  balanceMap.forEach((balance, userId) => {
    if (balance.isGreaterThan(ZERO)) {
      creditors.push({ userId, balance });
    } else if (balance.isLessThan(ZERO.negated())) {
      debtors.push({ userId, balance: balance.abs() });
    }
  });

  creditors.sort((a, b) => b.balance.comparedTo(a.balance));
  debtors.sort((a, b) => b.balance.comparedTo(a.balance));

  const transfers: DebtTransfer[] = [];
  let cIndex = 0;
  let dIndex = 0;

  while (cIndex < creditors.length && dIndex < debtors.length) {
    const creditor = creditors[cIndex];
    const debtor = debtors[dIndex];

    const settleAmount = BigNumber.minimum(creditor.balance, debtor.balance);
    const roundedAmount = settleAmount.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber();

    if (roundedAmount > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: roundedAmount,
        currency,
      });
    }

    creditor.balance = creditor.balance.minus(settleAmount);
    debtor.balance = debtor.balance.minus(settleAmount);

    if (creditor.balance.isLessThanOrEqualTo(ZERO)) {
      cIndex++;
    }
    if (debtor.balance.isLessThanOrEqualTo(ZERO)) {
      dIndex++;
    }
  }

  return transfers;
}

export interface CalculateSplitInput {
  totalAmount: number;
  splitType: SplitType;
  participantIds: UUID[];
  customValues?: Record<UUID, number>;
}

export interface SplitResult {
  splits: ExpenseSplitParticipant[];
  isValid: boolean;
  validationError?: string;
}

export function computeSplits(input: CalculateSplitInput): SplitResult {
  const { totalAmount, splitType, participantIds, customValues = {} } = input;
  const count = participantIds.length;

  if (count === 0 || totalAmount <= 0) {
    return { splits: [], isValid: false, validationError: 'Participant list and amount must be positive.' };
  }

  const totalCents = new BigNumber(totalAmount).times(100).integerValue(BigNumber.ROUND_HALF_UP).toNumber();
  const splits: ExpenseSplitParticipant[] = [];

  switch (splitType) {
    case 'EQUAL': {
      const baseShareCents = Math.floor(totalCents / count);
      let remainderCents = totalCents - baseShareCents * count;

      for (let i = 0; i < count; i++) {
        const extraCent = remainderCents > 0 ? 1 : 0;
        if (remainderCents > 0) remainderCents--;

        const participantCents = baseShareCents + extraCent;
        splits.push({
          userId: participantIds[i],
          owedAmount: new BigNumber(participantCents).dividedBy(100).toNumber(),
        });
      }
      return { splits, isValid: true };
    }

    case 'EXACT': {
      let sumEnteredCents = 0;
      for (const id of participantIds) {
        const val = customValues[id] ?? 0;
        const valCents = new BigNumber(val).times(100).integerValue(BigNumber.ROUND_HALF_UP).toNumber();
        sumEnteredCents += valCents;
        splits.push({
          userId: id,
          owedAmount: new BigNumber(valCents).dividedBy(100).toNumber(),
          rawInput: val,
        });
      }

      const diff = totalCents - sumEnteredCents;
      if (diff !== 0) {
        return {
          splits,
          isValid: false,
          validationError: `Exact amounts total ${new BigNumber(sumEnteredCents / 100).toFixed(2)}, expected ${new BigNumber(totalAmount).toFixed(2)}.`,
        };
      }
      return { splits, isValid: true };
    }

    case 'PERCENT': {
      let sumPct = new BigNumber(0);
      for (const id of participantIds) {
        sumPct = sumPct.plus(new BigNumber(customValues[id] ?? 0));
      }

      if (!sumPct.isEqualTo(100)) {
        return {
          splits: [],
          isValid: false,
          validationError: `Percentages must add up to 100%. Current sum: ${sumPct.toFixed(2)}%`,
        };
      }

      let distributedCents = 0;
      const initialSplits: { userId: UUID; cents: number; pct: number }[] = [];

      for (const id of participantIds) {
        const pct = customValues[id] ?? 0;
        const rawCents = new BigNumber(totalCents).times(pct).dividedBy(100).integerValue(BigNumber.ROUND_FLOOR).toNumber();
        distributedCents += rawCents;
        initialSplits.push({ userId: id, cents: rawCents, pct });
      }

      let remainder = totalCents - distributedCents;
      for (let i = 0; i < initialSplits.length && remainder > 0; i++) {
        initialSplits[i].cents += 1;
        remainder--;
      }

      for (const item of initialSplits) {
        splits.push({
          userId: item.userId,
          owedAmount: new BigNumber(item.cents).dividedBy(100).toNumber(),
          percentage: item.pct,
          rawInput: item.pct,
        });
      }

      return { splits, isValid: true };
    }

    case 'SHARES': {
      let totalShares = 0;
      for (const id of participantIds) {
        const share = Math.max(0, Math.floor(customValues[id] ?? 1));
        totalShares += share;
      }

      if (totalShares <= 0) {
        return { splits: [], isValid: false, validationError: 'Total shares must be greater than zero.' };
      }

      let distributedCents = 0;
      const intermediate: { userId: UUID; cents: number; shares: number }[] = [];

      for (const id of participantIds) {
        const shares = Math.max(0, Math.floor(customValues[id] ?? 1));
        const shareRatio = new BigNumber(shares).dividedBy(totalShares);
        const itemCents = new BigNumber(totalCents).times(shareRatio).integerValue(BigNumber.ROUND_FLOOR).toNumber();
        distributedCents += itemCents;
        intermediate.push({ userId: id, cents: itemCents, shares });
      }

      let remainder = totalCents - distributedCents;
      for (let i = 0; i < intermediate.length && remainder > 0; i++) {
        intermediate[i].cents += 1;
        remainder--;
      }

      for (const item of intermediate) {
        splits.push({
          userId: item.userId,
          owedAmount: new BigNumber(item.cents).dividedBy(100).toNumber(),
          shares: item.shares,
          rawInput: item.shares,
        });
      }

      return { splits, isValid: true };
    }
  }
}

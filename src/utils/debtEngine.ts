import BigNumber from 'bignumber.js';
import type {
  CurrencyCode,
  DebtTransfer,
  ExpenseCategory,
  ExpenseItem,
  MemberBalanceSummary,
  UUID,
  UserProfile,
  UserProfileMap,
} from '../types';
import { BASE_CURRENCY, fromMinorUnits, getMinorUnitFactor, toMinorUnits } from './currency';

/**
 * Net-balance vector math and the greedy minimum cash-flow solver.
 *
 * In an unsimplified ledger `N` people can generate up to `N(N-1)/2` directional
 * debts. The greedy solver collapses the balance vector into at most `N-1`
 * settlement transfers while keeping every operation in integer minor units, so
 * the resulting transfers reconcile to the exact penny.
 */

interface BalanceNode {
  userId: UUID;
  /** Absolute value of the node's balance, in integer minor units. */
  minorUnits: number;
}

export interface PersonalTotals {
  userId: UUID;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
  /** Sum of the positive per-expense residuals: what others owe the user. */
  owedToMe: number;
  /** Sum of the negative per-expense residuals: what the user owes others. */
  iOwe: number;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  amount: number;
  count: number;
  percentage: number;
}

export interface PayerTotal {
  userId: UUID;
  amount: number;
  percentage: number;
}

export interface MonthlyBurnPoint {
  /** `YYYY-MM` bucket key. */
  month: string;
  label: string;
  amount: number;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  amount: number;
  count: number;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function buildMembersMap(users: UserProfile[]): UserProfileMap {
  const map: UserProfileMap = new Map();
  for (const user of users) map.set(user.id, user);
  return map;
}

function isInvolved(expense: ExpenseItem, userId: UUID): boolean {
  return (
    expense.paidBy.some((payer) => payer.userId === userId) ||
    expense.splits.some((split) => split.userId === userId)
  );
}

function paidByUser(expense: ExpenseItem, userId: UUID): number {
  return expense.paidBy
    .filter((payer) => payer.userId === userId)
    .reduce((total, payer) => total.plus(new BigNumber(payer.amountPaid)), new BigNumber(0))
    .toNumber();
}

function owedByUser(expense: ExpenseItem, userId: UUID): number {
  return expense.splits
    .filter((split) => split.userId === userId)
    .reduce((total, split) => total.plus(new BigNumber(split.owedAmount)), new BigNumber(0))
    .toNumber();
}

/** Expenses denominated in the requested currency (the ledger partition). */
export function filterExpensesByCurrency(
  expenses: ExpenseItem[],
  currency: CurrencyCode
): ExpenseItem[] {
  return expenses.filter((expense) => expense.currency === currency);
}

/** Signed net balance for every supplied member: positive = owed money. */
export function calculateNetBalances(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): Map<UUID, BigNumber> {
  const balances = new Map<UUID, BigNumber>();
  for (const id of memberIds) balances.set(id, new BigNumber(0));

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    for (const payer of expense.paidBy) {
      const current = balances.get(payer.userId) ?? new BigNumber(0);
      balances.set(payer.userId, current.plus(new BigNumber(payer.amountPaid)));
    }
    for (const split of expense.splits) {
      const current = balances.get(split.userId) ?? new BigNumber(0);
      balances.set(split.userId, current.minus(new BigNumber(split.owedAmount)));
    }
  }

  return balances;
}

/** Per-member paid/owed/net summary, sorted by net balance descending. */
export function calculateMemberBalances(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): MemberBalanceSummary[] {
  const summaries = new Map<UUID, MemberBalanceSummary>();
  for (const id of memberIds) {
    summaries.set(id, { userId: id, netBalance: 0, totalPaid: 0, totalOwed: 0 });
  }

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    for (const payer of expense.paidBy) {
      const summary = summaries.get(payer.userId);
      if (summary) summary.totalPaid += payer.amountPaid;
    }
    for (const split of expense.splits) {
      const summary = summaries.get(split.userId);
      if (summary) summary.totalOwed += split.owedAmount;
    }
  }

  const netBalances = calculateNetBalances(memberIds, expenses, currency);

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      netBalance: netBalances.get(summary.userId)?.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber() ?? 0,
    }))
    .sort((a, b) => (b.netBalance !== a.netBalance ? b.netBalance - a.netBalance : a.userId.localeCompare(b.userId)));
}

/**
 * Greedy minimum cash-flow solver.
 *
 * Repeatedly matches the largest creditor with the largest debtor, settling the
 * smaller of the two balances, until every balance is zero. Returns at most
 * `N - 1` transfers for `N` members with a non-zero balance.
 */
export function calculateSimplifiedDebts(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): DebtTransfer[] {
  const factor = getMinorUnitFactor(currency);
  const balances = calculateNetBalances(memberIds, expenses, currency);

  const creditors: BalanceNode[] = [];
  const debtors: BalanceNode[] = [];

  balances.forEach((balance, userId) => {
    const minorUnits = balance.times(factor).integerValue(BigNumber.ROUND_HALF_UP).toNumber();
    if (minorUnits > 0) creditors.push({ userId, minorUnits });
    else if (minorUnits < 0) debtors.push({ userId, minorUnits: Math.abs(minorUnits) });
  });

  // Settle the largest obligations first; tie-break on id for stable output.
  const byMagnitude = (a: BalanceNode, b: BalanceNode): number =>
    b.minorUnits !== a.minorUnits ? b.minorUnits - a.minorUnits : a.userId.localeCompare(b.userId);
  creditors.sort(byMagnitude);
  debtors.sort(byMagnitude);

  const transfers: DebtTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const settleMinorUnits = Math.min(creditor.minorUnits, debtor.minorUnits);

    if (settleMinorUnits > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: fromMinorUnits(settleMinorUnits, currency),
        currency,
      });
    }

    creditor.minorUnits -= settleMinorUnits;
    debtor.minorUnits -= settleMinorUnits;

    if (creditor.minorUnits <= 0) creditorIndex += 1;
    if (debtor.minorUnits <= 0) debtorIndex += 1;
  }

  return transfers;
}

/** How a single expense moves one person's position in the ledger. */
export interface ExpenseImpact {
  userId: UUID;
  /** What this user actually fronted on this expense. */
  paid: number;
  /** This user's share of the expense. */
  owed: number;
  /** `paid - owed`: positive means the expense left them owed money. */
  net: number;
  /** They put money in (possibly as one of several payers). */
  isPayer: boolean;
  /** They carry a share of the cost. */
  isParticipant: boolean;
  /** They appear on the row at all. */
  isInvolved: boolean;
}

/**
 * Per-expense impact for one user, in exact decimal arithmetic.
 *
 * Used by the ledger rows and the friend view, where a single expense has to
 * explain itself ("you lent $60.00") without the row having to re-derive the
 * arithmetic on raw floats.
 */
export function calculateExpenseImpact(expense: ExpenseItem, userId: UUID): ExpenseImpact {
  const paid = new BigNumber(paidByUser(expense, userId));
  const owed = new BigNumber(owedByUser(expense, userId));

  return {
    userId,
    paid: paid.toNumber(),
    owed: owed.toNumber(),
    net: paid.minus(owed).decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber(),
    isPayer: paid.isGreaterThan(0),
    isParticipant: owed.isGreaterThan(0),
    isInvolved: isInvolved(expense, userId),
  };
}

/** Paid/owed/net breakdown for one user, split into "owed to me" and "I owe". */
export function computePersonalTotals(  userId: UUID,
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): PersonalTotals {
  let totalPaid = new BigNumber(0);
  let totalOwed = new BigNumber(0);
  let owedToMe = new BigNumber(0);
  let iOwe = new BigNumber(0);

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    const paid = paidByUser(expense, userId);
    const owed = owedByUser(expense, userId);
    if (paid === 0 && owed === 0) continue;

    totalPaid = totalPaid.plus(paid);
    totalOwed = totalOwed.plus(owed);

    const residual = new BigNumber(paid).minus(owed);
    if (residual.isGreaterThan(0)) owedToMe = owedToMe.plus(residual);
    else if (residual.isLessThan(0)) iOwe = iOwe.plus(residual.abs());
  }

  return {
    userId,
    totalPaid: totalPaid.toNumber(),
    totalOwed: totalOwed.toNumber(),
    netBalance: totalPaid.minus(totalOwed).toNumber(),
    owedToMe: owedToMe.toNumber(),
    iOwe: iOwe.toNumber(),
  };
}

/**
 * Direct 1-on-1 balance between two people, via proportional payment attribution.
 *
 * For every expense both are involved in, the counterparty's obligation is
 * attributed across the payers in proportion to how much each payer fronted, and
 * vice versa. With a single payer on an expense this is exactly "who paid for
 * whom"; with several payers each obligation is distributed pro-rata, so the
 * pairwise figures always add back up to the full obligation.
 *
 * Positive result = `userId` is owed money by `counterpartyId`.
 */
export function calculatePairwiseBalance(
  userId: UUID,
  counterpartyId: UUID,
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): number {
  let net = new BigNumber(0);

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    if (!isInvolved(expense, userId) || !isInvolved(expense, counterpartyId)) continue;

    const paidTotal = expense.paidBy.reduce(
      (total, payer) => total.plus(new BigNumber(payer.amountPaid)),
      new BigNumber(0)
    );
    if (paidTotal.isZero()) continue;

    const myPaid = new BigNumber(paidByUser(expense, userId));
    const theirPaid = new BigNumber(paidByUser(expense, counterpartyId));
    const myOwed = new BigNumber(owedByUser(expense, userId));
    const theirOwed = new BigNumber(owedByUser(expense, counterpartyId));

    // What they owe me for what I fronted, minus what I owe them for what they fronted.
    net = net
      .plus(theirOwed.times(myPaid).dividedBy(paidTotal))
      .minus(myOwed.times(theirPaid).dividedBy(paidTotal));
  }

  return net.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber();
}

/** Expenses both users take part in, newest first. */
export function calculateSharedExpenses(
  userId: UUID,
  counterpartyId: UUID,
  expenses: ExpenseItem[]
): ExpenseItem[] {
  return expenses
    .filter(
      (expense) => isInvolved(expense, userId) && isInvolved(expense, counterpartyId)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Total spend across a ledger, ignoring settlements (which are not spending). */
export function calculateTotalSpend(
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): number {
  return filterExpensesByCurrency(expenses, currency)
    .filter((expense) => !expense.isSettlement)
    .reduce((total, expense) => total.plus(new BigNumber(expense.amount)), new BigNumber(0))
    .toNumber();
}

/** Spend grouped by category, largest first. */
export function calculateCategoryTotals(
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): CategoryTotal[] {
  const totals = new Map<ExpenseCategory, { amount: BigNumber; count: number }>();
  let grandTotal = new BigNumber(0);

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    if (expense.isSettlement) continue;
    const current = totals.get(expense.category) ?? { amount: new BigNumber(0), count: 0 };
    current.amount = current.amount.plus(new BigNumber(expense.amount));
    current.count += 1;
    totals.set(expense.category, current);
    grandTotal = grandTotal.plus(new BigNumber(expense.amount));
  }

  return Array.from(totals.entries())
    .map(([category, value]) => ({
      category,
      amount: value.amount.toNumber(),
      count: value.count,
      percentage: grandTotal.isZero()
        ? 0
        : value.amount.dividedBy(grandTotal).times(100).toNumber(),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** How much each member fronted, and their share of the total paid. */
export function calculatePayerTotals(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): PayerTotal[] {
  const totals = new Map<UUID, BigNumber>();
  for (const id of memberIds) totals.set(id, new BigNumber(0));

  let grandTotal = new BigNumber(0);
  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    if (expense.isSettlement) continue;
    for (const payer of expense.paidBy) {
      const current = totals.get(payer.userId) ?? new BigNumber(0);
      totals.set(payer.userId, current.plus(new BigNumber(payer.amountPaid)));
      grandTotal = grandTotal.plus(new BigNumber(payer.amountPaid));
    }
  }

  return Array.from(totals.entries())
    .map(([userId, amount]) => ({
      userId,
      amount: amount.toNumber(),
      percentage: grandTotal.isZero() ? 0 : amount.dividedBy(grandTotal).times(100).toNumber(),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Monthly spend buckets for the trailing `months` calendar months. */
export function calculateMonthlyBurn(
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY,
  months = 6,
  referenceDate: Date = new Date()
): MonthlyBurnPoint[] {
  const buckets: MonthlyBurnPoint[] = [];
  const bucketIndex = new Map<string, MonthlyBurnPoint>();

  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const point: MonthlyBurnPoint = {
      month: key,
      label: `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`,
      amount: 0,
    };
    buckets.push(point);
    bucketIndex.set(key, point);
  }

  for (const expense of filterExpensesByCurrency(expenses, currency)) {
    if (expense.isSettlement) continue;
    const date = new Date(expense.date);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = bucketIndex.get(key);
    if (bucket) bucket.amount += expense.amount;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    amount: new BigNumber(bucket.amount).decimalPlaces(2, BigNumber.ROUND_HALF_UP).toNumber(),
  }));
}

/** Ledger totals partitioned by currency (multi-currency groups stay separate). */
export function calculateCurrencyTotals(expenses: ExpenseItem[]): CurrencyTotal[] {
  const totals = new Map<CurrencyCode, { amount: number; count: number }>();

  for (const expense of expenses) {
    if (expense.isSettlement) continue;
    const current = totals.get(expense.currency) ?? { amount: 0, count: 0 };
    current.amount = new BigNumber(current.amount)
      .plus(new BigNumber(expense.amount))
      .toNumber();
    current.count += 1;
    totals.set(expense.currency, current);
  }

  return Array.from(totals.entries())
    .map(([currency, value]) => ({ currency, ...value }))
    .sort((a, b) => b.amount - a.amount);
}

/** Minor-unit reconciliation check used by the ledger and the test harness. */
export function isLedgerBalanced(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode = BASE_CURRENCY
): boolean {
  const balances = calculateNetBalances(memberIds, expenses, currency);
  const sumMinorUnits = Array.from(balances.values()).reduce(
    (total, balance) =>
      total + balance.times(getMinorUnitFactor(currency)).integerValue(BigNumber.ROUND_HALF_UP).toNumber(),
    0
  );
  return sumMinorUnits === 0;
}

/** Sum of the outstanding simplified transfers, for progress indicators. */
export function calculateOutstandingTotal(transfers: DebtTransfer[]): number {
  return transfers
    .reduce((total, transfer) => total.plus(new BigNumber(transfer.amount)), new BigNumber(0))
    .toNumber();
}

/** Converts a transfer list into a per-user "you still owe / are owed" view. */
export function calculateTransferImpact(
  transfers: DebtTransfer[],
  userId: UUID
): { owes: number; isOwed: number } {
  let owes = new BigNumber(0);
  let isOwed = new BigNumber(0);

  for (const transfer of transfers) {
    if (transfer.fromUserId === userId) owes = owes.plus(new BigNumber(transfer.amount));
    if (transfer.toUserId === userId) isOwed = isOwed.plus(new BigNumber(transfer.amount));
  }

  return { owes: owes.toNumber(), isOwed: isOwed.toNumber() };
}

/** Recomputes the member ids that participate in any expense of a ledger. */
export function collectLedgerMemberIds(
  expenses: ExpenseItem[],
  fallbackIds: UUID[] = []
): UUID[] {
  const ids = new Set<UUID>(fallbackIds);
  for (const expense of expenses) {
    for (const payer of expense.paidBy) ids.add(payer.userId);
    for (const split of expense.splits) ids.add(split.userId);
  }
  return Array.from(ids);
}

/** Convenience helper: minor-unit total of an expense, for storage audits. */
export function toExpenseMinorUnits(
  expense: ExpenseItem
): { paid: number; owed: number; balanced: boolean } {
  const paid = expense.paidBy.reduce(
    (total, payer) => total + toMinorUnits(payer.amountPaid, expense.currency),
    0
  );
  const owed = expense.splits.reduce(
    (total, split) => total + toMinorUnits(split.owedAmount, expense.currency),
    0
  );
  return { paid, owed, balanced: paid === owed };
}

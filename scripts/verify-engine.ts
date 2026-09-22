/**
 * MintSplit engine verification harness.
 *
 * Runs the *real* split and debt engines (no mocks) against the acceptance
 * criteria in `plan.md` §9 and exits non-zero on any regression:
 *
 *   pnpm run verify
 *
 * The `scripts/ts-register.mjs` loader lets Node 24 execute the TypeScript
 * sources directly, so the harness always tests the shipped code.
 */
import {
  computeSplits,
  isSplitBalanced,
  sumSplitAmounts,
  validateSplitInput,
} from '../src/utils/splitEngine';
import {
  calculateCategoryTotals,
  calculateExpenseImpact,
  calculateMemberBalances,
  calculateNetBalances,
  calculatePairwiseBalance,
  calculateSimplifiedDebts,
  calculateTotalSpend,
  calculateTransferImpact,
  computePersonalTotals,
  isLedgerBalanced,
} from '../src/utils/debtEngine';
import { fromMinorUnits, toMinorUnits } from '../src/utils/currency';
import { buildSeedDataset, SEED_GROUP_IDS, SEED_USER_IDS } from '../src/services/seedDataset';
import type { SeedDataset } from '../src/services/seedDataset';
import {
  CSV_COLUMNS,
  SNAPSHOT_VERSION,
  createSnapshot,
  escapeCsvValue,
  parseExpensesFromCsv,
  parseSnapshot,
  serializeExpensesToCsv,
  serializeSnapshot,
} from '../src/services/ledgerSnapshot';
import {
  DEFAULT_LEDGER_FILTERS,
  applyLedgerFilters,
  countActiveFilters,
  hasActiveFilters,
} from '../src/stores/useFilterStore';
import {
  estimateDataUrlBytes,
  fitWithin,
  validateReceiptFile,
} from '../src/services/receiptOcr';
import {
  isCompactBucket,
  layoutMetrics,
  mobileContentInset,
  resolveViewportBucket,
  responsiveSpans,
  touchTarget,
} from '../src/theme';
import type { ViewportBucket } from '../src/theme';
import { buildSettlementPlan, suggestSettlementAmount } from '../src/utils/settlementPlan';
import { validateDraft } from '../src/utils/expenseValidation';
import type { ExpenseDraft } from '../src/utils/expenseValidation';
import type {
  CurrencyCode,
  ExpenseCategory,
  ExpenseItem,
  ExpensePayer,
  SplitType,
  UUID,
} from '../src/types';

/* ------------------------------------------------------------------ harness */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assert,
  assertContains,
  assertEqual,
  assertThrows,
  exitWithReport,
  section,
  test,
} from './harness';

/* ----------------------------------------------------------------- fixtures */

interface FixtureInput {
  id: string;
  groupId?: UUID | null;
  description?: string;
  category?: ExpenseCategory;
  amount: number;
  currency?: CurrencyCode;
  paidBy: ExpensePayer[];
  splitType: SplitType;
  participantIds: UUID[];
  customValues?: Record<UUID, number>;
  daysAgo?: number;
  isSettlement?: boolean;
  createdBy?: UUID;
}

const DAY_MS = 86_400_000;

/** Resolved once so the stylesheet assertions do not depend on the cwd. */
const stylesPath = fileURLToPath(new URL('../src/assets/styles/main.css', import.meta.url));

function makeExpense(input: FixtureInput): ExpenseItem {
  const currency: CurrencyCode = input.currency ?? 'USD';
  const result = computeSplits({
    totalAmount: input.amount,
    splitType: input.splitType,
    participantIds: input.participantIds,
    customValues: input.customValues,
    currency,
  });

  if (!result.isValid) {
    throw new Error(`Fixture "${input.id}" is invalid: ${result.validationError ?? 'unknown error'}`);
  }

  const timestamp = new Date(Date.now() - (input.daysAgo ?? 0) * DAY_MS).toISOString();

  return {
    id: input.id,
    groupId: input.groupId ?? null,
    description: input.description ?? input.id,
    category: input.category ?? 'GENERAL',
    amount: input.amount,
    currency,
    paidBy: input.paidBy,
    splitType: input.splitType,
    splits: result.splits,
    date: timestamp,
    isSettlement: input.isSettlement ?? false,
    createdBy: input.createdBy ?? input.paidBy[0]?.userId ?? 'user-a',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Deterministic PRNG so a failure is always reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function minorSumOf(expense: ExpenseItem): { paid: number; owed: number } {
  return {
    paid: expense.paidBy.reduce(
      (total, payer) => total + toMinorUnits(payer.amountPaid, expense.currency),
      0
    ),
    owed: expense.splits.reduce(
      (total, split) => total + toMinorUnits(split.owedAmount, expense.currency),
      0
    ),
  };
}

/** Every expense in the dataset must reconcile to the penny, both ways. */
function assertDatasetReconciles(dataset: SeedDataset): void {
  for (const expense of dataset.expenses) {
    const { paid, owed } = minorSumOf(expense);
    assertEqual(
      paid,
      owed,
      `seed expense "${expense.description}" must have Σ paid === Σ owed`
    );
    assertEqual(
      owed,
      toMinorUnits(expense.amount, expense.currency),
      `seed expense "${expense.description}" splits must sum to its total`
    );
    assert(expense.paidBy.length > 0, 'every seed expense needs at least one payer');
    assert(expense.splits.length > 0, 'every seed expense needs at least one split');
  }
}

/* ------------------------------------------------------- split engine suite */

section('Split engine \u2014 penny rounding');

test('EQUAL split of $100 across 3 people sums to exactly $100.00', () => {
  const ids = ['u1', 'u2', 'u3'];
  const result = computeSplits({ totalAmount: 100, splitType: 'EQUAL', participantIds: ids });
  assert(result.isValid, 'split should be valid');
  assertEqual(result.splits.length, 3, 'split count');
  assertEqual(sumSplitAmounts(result.splits), 100, 'sum of splits');
  assert(isSplitBalanced(100, result.splits), 'split should reconcile to the total');
  const amounts = result.splits.map((split) => split.owedAmount);
  assertEqual(Math.max(...amounts), 33.34, 'largest share absorbs the residual penny');
  assertEqual(Math.min(...amounts), 33.33, 'smallest share');
});

test('EQUAL split reconciles across 3, 7 and 13 participants for awkward totals', () => {
  const totals = [0.01, 0.03, 10, 99.99, 100, 333.33, 1000.01, 12345.67];

  for (const count of [3, 7, 13]) {
    const ids = Array.from({ length: count }, (_, index) => `u${index}`);
    for (const total of totals) {
      const result = computeSplits({ totalAmount: total, splitType: 'EQUAL', participantIds: ids });
      assert(result.isValid, `${count} participants / ${total}: split invalid`);
      assertEqual(
        toMinorUnits(sumSplitAmounts(result.splits)),
        toMinorUnits(total),
        `${count} participants / ${total}: penny reconciliation`
      );
      const amounts = result.splits.map((split) => toMinorUnits(split.owedAmount));
      assert(
        Math.max(...amounts) - Math.min(...amounts) <= 1,
        `${count} participants / ${total}: shares must differ by at most one penny`
      );
    }
  }
});

test('EQUAL split respects zero-decimal currencies (JPY)', () => {
  const ids = ['u1', 'u2', 'u3'];
  const result = computeSplits({
    totalAmount: 100,
    splitType: 'EQUAL',
    participantIds: ids,
    currency: 'JPY',
  });
  assert(result.isValid, 'JPY split should be valid');
  const amounts = result.splits.map((split) => split.owedAmount);
  assert(amounts.every((amount) => Number.isInteger(amount)), 'JPY shares must be whole yen');
  assertEqual(
    amounts.reduce((total, amount) => total + amount, 0),
    100,
    'JPY shares must sum to the total'
  );
});

test('EXACT split accepts amounts that add up and reports the gap otherwise', () => {
  const ids = ['u1', 'u2', 'u3'];
  const valid = computeSplits({
    totalAmount: 90,
    splitType: 'EXACT',
    participantIds: ids,
    customValues: { u1: 30, u2: 25, u3: 35 },
  });
  assert(valid.isValid, 'matching exact amounts should be valid');
  assertEqual(sumSplitAmounts(valid.splits), 90, 'exact sum');

  const under = computeSplits({
    totalAmount: 90,
    splitType: 'EXACT',
    participantIds: ids,
    customValues: { u1: 30, u2: 25, u3: 30 },
  });
  assert(!under.isValid, 'mismatched exact amounts must be rejected');
  assert(
    (under.validationError ?? '').includes('5.00'),
    `validation error should quantify the gap, received: ${under.validationError}`
  );
});

test('EXACT split rejects negative amounts and duplicate participants', () => {
  assert(
    computeSplits({
      totalAmount: 10,
      splitType: 'EXACT',
      participantIds: ['u1', 'u2'],
      customValues: { u1: 15, u2: -5 },
    }).isValid === false,
    'negative exact values must be rejected'
  );
  assert(
    computeSplits({
      totalAmount: 10,
      splitType: 'EQUAL',
      participantIds: ['u1', 'u1'],
    }).isValid === false,
    'duplicate participants must be rejected'
  );
});

test('PERCENT split distributes residual pennies without leaking', () => {
  const ids = ['u1', 'u2', 'u3'];
  const result = computeSplits({
    totalAmount: 100,
    splitType: 'PERCENT',
    participantIds: ids,
    customValues: { u1: 33.33, u2: 33.33, u3: 33.34 },
  });
  assert(result.isValid, 'valid percentages should compute');
  assertEqual(sumSplitAmounts(result.splits), 100, 'percentage split sum');
  assertEqual(result.splits[2].owedAmount, 33.34, 'largest percentage gets the last penny');
  assertEqual(result.splits[0].percentage, 33.33, 'percentage metadata is retained');

  const rejected = computeSplits({
    totalAmount: 100,
    splitType: 'PERCENT',
    participantIds: ids,
    customValues: { u1: 33.33, u2: 33.33, u3: 33.33 },
  });
  assert(!rejected.isValid, 'percentages that do not total 100% must be rejected');
});

test('PERCENT split of a tiny amount still reconciles exactly', () => {
  const result = computeSplits({
    totalAmount: 0.05,
    splitType: 'PERCENT',
    participantIds: ['u1', 'u2', 'u3'],
    customValues: { u1: 50, u2: 25, u3: 25 },
  });
  assert(result.isValid, 'tiny percentage split should be valid');
  assertEqual(toMinorUnits(sumSplitAmounts(result.splits)), 5, 'tiny split reconciliation');
});

test('SHARES split weights by share count and resolves the remainder', () => {
  const weighted = computeSplits({
    totalAmount: 100,
    splitType: 'SHARES',
    participantIds: ['u1', 'u2', 'u3'],
    customValues: { u1: 2, u2: 1, u3: 1 },
  });
  assert(weighted.isValid, 'weighted shares should be valid');
  assertEqual(weighted.splits[0].owedAmount, 50, 'two shares pays half');
  assertEqual(weighted.splits[1].owedAmount, 25, 'one share pays a quarter');

  const awkward = computeSplits({
    totalAmount: 10,
    splitType: 'SHARES',
    participantIds: ['u1', 'u2', 'u3'],
    customValues: { u1: 1, u2: 1, u3: 1 },
  });
  assert(awkward.isValid, 'equal shares should be valid');
  assertEqual(sumSplitAmounts(awkward.splits), 10, 'share remainder reconciliation');
  assertEqual(awkward.splits[0].shares, 1, 'share metadata is retained');

  assert(
    computeSplits({
      totalAmount: 10,
      splitType: 'SHARES',
      participantIds: ['u1', 'u2'],
      customValues: { u1: 0, u2: 0 },
    }).isValid === false,
    'zero total shares must be rejected'
  );
});

test('split engine rejects degenerate input', () => {
  assertEqual(
    computeSplits({ totalAmount: 10, splitType: 'EQUAL', participantIds: [] }).isValid,
    false,
    'empty participant list'
  );
  assertEqual(
    computeSplits({ totalAmount: 0, splitType: 'EQUAL', participantIds: ['u1'] }).isValid,
    false,
    'zero total'
  );
  assertEqual(
    computeSplits({ totalAmount: -5, splitType: 'EQUAL', participantIds: ['u1'] }).isValid,
    false,
    'negative total'
  );
  assert(
    validateSplitInput({
      totalAmount: 10,
      splitType: 'PERCENT',
      participantIds: ['u1', 'u2'],
      customValues: { u1: 50, u2: 40 },
    }) !== null,
    'validateSplitInput should surface the percentage mismatch'
  );
});

test('10,000 randomised splits never leak a penny', () => {
  const random = createRandom(20260922);

  for (let iteration = 0; iteration < 10_000; iteration++) {
    const count = 2 + Math.floor(random() * 12);
    const ids = Array.from({ length: count }, (_, index) => `u${index}`);
    const total = Math.round(random() * 500_000) / 100 + 0.01;
    const splitType: SplitType = (['EQUAL', 'PERCENT', 'SHARES'] as SplitType[])[
      Math.floor(random() * 3)
    ];

    let customValues: Record<UUID, number> | undefined;
    if (splitType === 'PERCENT') {
      // Build whole-number percentages that are guaranteed to total exactly 100.
      const weights = ids.map(() => 1 + Math.floor(random() * 9));
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      const percentages: number[] = [];
      let assigned = 0;
      ids.forEach((_id, index) => {
        const percentage =
          index === ids.length - 1
            ? 100 - assigned
            : Math.floor((weights[index] / weightSum) * 100);
        percentages.push(percentage);
        assigned += percentage;
      });
      customValues = Object.fromEntries(ids.map((id, index) => [id, percentages[index]]));
    } else if (splitType === 'SHARES') {
      customValues = Object.fromEntries(
        ids.map((id) => [id, 1 + Math.floor(random() * 5)])
      );
    }

    const result = computeSplits({
      totalAmount: total,
      splitType,
      participantIds: ids,
      customValues,
    });

    if (!result.isValid) {
      throw new Error(
        `iteration ${iteration}: ${splitType} split of ${total} rejected (${result.validationError})`
      );
    }

    const splitTotal = toMinorUnits(sumSplitAmounts(result.splits));
    if (splitTotal !== toMinorUnits(total)) {
      throw new Error(
        `iteration ${iteration}: ${splitType} split of ${total} produced ${fromMinorUnits(splitTotal)}`
      );
    }
  }
});

/* ------------------------------------------------------- debt engine suite */

section('Debt engine \u2014 minimum cash flow');

test('a single shared expense produces one transfer', () => {
  const expense = makeExpense({
    id: 'e1',
    amount: 100,
    paidBy: [{ userId: 'a', amountPaid: 100 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
  });
  const transfers = calculateSimplifiedDebts(['a', 'b'], [expense], 'USD');
  assertEqual(transfers.length, 1, 'transfer count');
  assertEqual(transfers[0].fromUserId, 'b', 'debtor pays');
  assertEqual(transfers[0].toUserId, 'a', 'creditor receives');
  assertEqual(transfers[0].amount, 50, 'transfer amount');
});

test('cyclic reciprocal debts collapse to zero transfers', () => {
  const expenses = [
    makeExpense({
      id: 'e1',
      amount: 30,
      paidBy: [{ userId: 'a', amountPaid: 30 }],
      splitType: 'EXACT',
      participantIds: ['a', 'b'],
      customValues: { a: 20, b: 10 },
    }),
    makeExpense({
      id: 'e2',
      amount: 30,
      paidBy: [{ userId: 'b', amountPaid: 30 }],
      splitType: 'EXACT',
      participantIds: ['b', 'c'],
      customValues: { b: 20, c: 10 },
    }),
    makeExpense({
      id: 'e3',
      amount: 30,
      paidBy: [{ userId: 'c', amountPaid: 30 }],
      splitType: 'EXACT',
      participantIds: ['c', 'a'],
      customValues: { c: 20, a: 10 },
    }),
  ];

  const transfers = calculateSimplifiedDebts(['a', 'b', 'c'], expenses, 'USD');
  assertEqual(transfers.length, 0, 'circular debts must cancel out');
});

test('a chain of debts is reduced to a single transfer', () => {
  const expenses = [
    makeExpense({
      id: 'e1',
      amount: 20,
      paidBy: [{ userId: 'b', amountPaid: 20 }],
      splitType: 'EXACT',
      participantIds: ['a', 'b'],
      customValues: { a: 10, b: 10 },
    }),
    makeExpense({
      id: 'e2',
      amount: 20,
      paidBy: [{ userId: 'c', amountPaid: 20 }],
      splitType: 'EXACT',
      participantIds: ['b', 'c'],
      customValues: { b: 10, c: 10 },
    }),
  ];

  const transfers = calculateSimplifiedDebts(['a', 'b', 'c'], expenses, 'USD');
  assertEqual(transfers.length, 1, 'two hops collapse into one transfer');
  assertEqual(transfers[0].fromUserId, 'a', 'final debtor');
  assertEqual(transfers[0].toUserId, 'c', 'final creditor');
  assertEqual(transfers[0].amount, 10, 'collapsed amount');
});

test('recording a settlement zeroes the outstanding balance', () => {
  const expense = makeExpense({
    id: 'e1',
    amount: 100,
    paidBy: [{ userId: 'a', amountPaid: 100 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
  });
  const settlement = makeExpense({
    id: 's1',
    amount: 50,
    paidBy: [{ userId: 'b', amountPaid: 50 }],
    splitType: 'EXACT',
    participantIds: ['a'],
    customValues: { a: 50 },
    isSettlement: true,
  });

  const before = calculateSimplifiedDebts(['a', 'b'], [expense], 'USD');
  const after = calculateSimplifiedDebts(['a', 'b'], [expense, settlement], 'USD');

  assertEqual(before.length, 1, 'debt exists before settling');
  assertEqual(after.length, 0, 'debt cleared after settling');
  assert(isLedgerBalanced(['a', 'b'], [expense, settlement], 'USD'), 'ledger must reconcile');
});

test('multi-currency ledgers are partitioned by currency', () => {
  const usd = makeExpense({
    id: 'e1',
    amount: 60,
    currency: 'USD',
    paidBy: [{ userId: 'a', amountPaid: 60 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
  });
  const eur = makeExpense({
    id: 'e2',
    amount: 100,
    currency: 'EUR',
    paidBy: [{ userId: 'b', amountPaid: 100 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
  });

  const usdTransfers = calculateSimplifiedDebts(['a', 'b'], [usd, eur], 'USD');
  assertEqual(usdTransfers.length, 1, 'only the USD leg should settle');
  assertEqual(usdTransfers[0].amount, 30, 'USD transfer amount');
  assertEqual(usdTransfers[0].currency, 'USD', 'transfer currency');

  const eurTransfers = calculateSimplifiedDebts(['a', 'b'], [usd, eur], 'EUR');
  assertEqual(eurTransfers.length, 1, 'EUR leg settles independently');
  assertEqual(eurTransfers[0].fromUserId, 'a', 'EUR debtor');
  assertEqual(eurTransfers[0].amount, 50, 'EUR transfer amount');
});

test('13-person randomised ledger settles in at most N-1 transfers and reconciles exactly', () => {
  const random = createRandom(77123);
  const memberIds = Array.from({ length: 13 }, (_, index) => `user-${index}`);

  const expenses: ExpenseItem[] = [];
  for (let index = 0; index < 120; index++) {
    const participantCount = 2 + Math.floor(random() * 5);
    const shuffled = [...memberIds].sort(() => random() - 0.5);
    const participants = shuffled.slice(0, participantCount);
    const payer = participants[Math.floor(random() * participants.length)];
    const amount = Math.round(random() * 40_000) / 100 + 0.01;

    expenses.push(
      makeExpense({
        id: `rand-${index}`,
        amount,
        paidBy: [{ userId: payer, amountPaid: amount }],
        splitType: 'EQUAL',
        participantIds: participants,
        daysAgo: index % 30,
      })
    );
  }

  const transfers = calculateSimplifiedDebts(memberIds, expenses, 'USD');
  assert(
    transfers.length <= memberIds.length - 1,
    `expected at most ${memberIds.length - 1} transfers, received ${transfers.length}`
  );

  const netBalances = calculateNetBalances(memberIds, expenses, 'USD');
  for (const memberId of memberIds) {
    const impact = calculateTransferImpact(transfers, memberId);
    const expected = toMinorUnits(netBalances.get(memberId)!.toNumber(), 'USD');
    const actual = toMinorUnits(impact.isOwed, 'USD') - toMinorUnits(impact.owes, 'USD');
    assertEqual(actual, expected, `net impact for ${memberId}`);
  }

  for (const transfer of transfers) {
    assert(transfer.amount > 0, 'transfers must be positive');
    assert(
      toMinorUnits(transfer.amount, 'USD') > 0,
      'transfers must be at least one penny'
    );
  }

  assert(isLedgerBalanced(memberIds, expenses, 'USD'), 'random ledger must reconcile to zero');
});

test('balance summaries, pairwise balances and analytics agree with the ledger', () => {
  const expenses = [
    makeExpense({
      id: 'e1',
      amount: 90,
      category: 'FOOD_AND_DRINK',
      paidBy: [{ userId: 'a', amountPaid: 90 }],
      splitType: 'EQUAL',
      participantIds: ['a', 'b', 'c'],
      daysAgo: 3,
    }),
    makeExpense({
      id: 'e2',
      amount: 40,
      category: 'TRANSPORTATION',
      paidBy: [{ userId: 'b', amountPaid: 40 }],
      splitType: 'EQUAL',
      participantIds: ['a', 'b'],
      daysAgo: 1,
    }),
  ];

  const summaries = calculateMemberBalances(['a', 'b', 'c'], expenses, 'USD');
  const byId = new Map(summaries.map((summary) => [summary.userId, summary]));
  assertEqual(byId.get('a')!.netBalance, 40, 'a is owed 40');
  assertEqual(byId.get('b')!.netBalance, -10, 'b owes 10');
  assertEqual(byId.get('c')!.netBalance, -30, 'c owes 30');
  assertEqual(byId.get('a')!.totalPaid, 90, 'a paid 90');

  // e1: b owes a 30 of the 90 a fronted. e2: a owes b 20 of the 40 b fronted.
  const pairwise = calculatePairwiseBalance('a', 'b', expenses, 'USD');
  assertEqual(pairwise, 10, 'a is owed 10 by b across shared expenses');
  assertEqual(
    calculatePairwiseBalance('b', 'a', expenses, 'USD'),
    -10,
    'pairwise balance is antisymmetric'
  );

  const personal = computePersonalTotals('b', expenses, 'USD');
  assertEqual(personal.iOwe, 30, 'b owes 30 in total');
  assertEqual(personal.owedToMe, 20, 'b is owed 20');
  assertEqual(personal.netBalance, -10, 'b net balance');
  assertEqual(personal.totalPaid, 40, 'b paid 40');

  const categories = calculateCategoryTotals(expenses, 'USD');
  assertEqual(categories[0].category, 'FOOD_AND_DRINK', 'largest category first');
  assertEqual(categories[0].amount, 90, 'category total');
  assertEqual(categories.length, 2, 'category count');

  assertEqual(calculateTotalSpend(expenses, 'USD'), 130, 'total spend');
  assertEqual(calculateTransferImpact([], 'a').owes, 0, 'empty transfer impact');
});

test('debt engine ignores currency mismatches and handles empty ledgers', () => {
  assertEqual(calculateSimplifiedDebts(['a', 'b'], [], 'USD').length, 0, 'empty ledger');
  assertEqual(calculateTotalSpend([], 'USD'), 0, 'empty spend');
  assertEqual(calculateCategoryTotals([], 'USD').length, 0, 'empty categories');
  assertEqual(calculateMemberBalances(['a'], [], 'USD')[0].netBalance, 0, 'empty balances');
});

test('per-expense impact explains a ledger row without float drift', () => {
  const expense = makeExpense({
    id: 'e1',
    amount: 100,
    paidBy: [{ userId: 'a', amountPaid: 100 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b', 'c'],
  });

  const payerImpact = calculateExpenseImpact(expense, 'a');
  assertEqual(payerImpact.paid, 100, 'a fronted the whole bill');
  assertEqual(payerImpact.owed, 33.34, 'a carries the residual penny');
  assertEqual(payerImpact.net, 66.66, 'a is owed the rest');
  assert(payerImpact.isPayer, 'a is a payer');
  assert(payerImpact.isParticipant, 'a is a participant');
  assert(payerImpact.isInvolved, 'a is involved');

  const participantImpact = calculateExpenseImpact(expense, 'b');
  assertEqual(participantImpact.paid, 0, 'b paid nothing');
  assertEqual(participantImpact.net, -33.33, 'b owes their share');
  assert(!participantImpact.isPayer, 'b is not a payer');
  assert(participantImpact.isParticipant, 'b is a participant');

  const outsider = calculateExpenseImpact(expense, 'zzz');
  assertEqual(outsider.net, 0, 'an outsider has no impact');
  assert(!outsider.isInvolved, 'an outsider is not involved');
});

test('per-expense impact splits correctly across multiple payers', () => {
  const expense = makeExpense({
    id: 'e2',
    amount: 64,
    paidBy: [
      { userId: 'a', amountPaid: 32 },
      { userId: 'b', amountPaid: 32 },
    ],
    splitType: 'EQUAL',
    participantIds: ['a', 'b', 'c'],
  });

  // $64 / 3 = $21.333..., so the residual penny lands on the leading participant:
  // a owes 21.34, b and c owe 21.33. Both payers fronted 32.
  assertEqual(expense.splits[0].owedAmount, 21.34, 'the leading participant absorbs the penny');
  assertEqual(calculateExpenseImpact(expense, 'a').net, 10.66, 'a nets their share back');
  assertEqual(calculateExpenseImpact(expense, 'b').net, 10.67, 'b nets their share back');
  assertEqual(calculateExpenseImpact(expense, 'c').net, -21.33, 'c owes their share');
  assertEqual(
    calculateExpenseImpact(expense, 'a').net + calculateExpenseImpact(expense, 'b').net,
    21.33,
    'the two payers recover exactly what the non-payer owes'
  );
});

test('per-expense impact reports a settlement as a pure transfer', () => {
  const settlement = makeExpense({
    id: 's1',
    amount: 50,
    paidBy: [{ userId: 'b', amountPaid: 50 }],
    splitType: 'EXACT',
    participantIds: ['a'],
    customValues: { a: 50 },
    isSettlement: true,
  });

  const payerImpact = calculateExpenseImpact(settlement, 'b');
  assertEqual(payerImpact.paid, 50, 'the payer fronted the transfer');
  assertEqual(payerImpact.owed, 0, 'the payer carries no share');
  assertEqual(payerImpact.net, 50, 'the transfer credits the payer');

  const receiverImpact = calculateExpenseImpact(settlement, 'a');
  assertEqual(receiverImpact.paid, 0, 'the receiver fronted nothing');
  assertEqual(receiverImpact.net, -50, 'the transfer debits the receiver');
});

/* -------------------------------------------------------- seed dataset suite */

section('Seed dataset \u2014 storage-free ledger audit');

const FIXED_SEED_TIMESTAMP = Date.UTC(2026, 8, 22, 12, 0, 0);

test('the demo dataset is deterministic for a fixed timestamp', () => {
  const first = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  const second = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  assertEqual(
    JSON.stringify(first),
    JSON.stringify(second),
    'two builds from the same timestamp must be byte-identical'
  );
});

test('the demo dataset is referentially closed', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  const userIds = new Set(dataset.users.map((user) => user.id));
  const groupIds = new Set(dataset.groups.map((group) => group.id));

  assert(dataset.users.length >= 4, 'the demo needs enough people for multi-party splits');
  assert(dataset.groups.length >= 2, 'the demo needs several groups');
  assert(
    dataset.expenses.some((expense) => expense.groupId === null),
    'the demo must exercise direct peer-to-peer expenses'
  );
  assert(
    dataset.expenses.some((expense) => expense.isSettlement),
    'the demo must exercise a recorded settlement'
  );

  const splitTypes = new Set<SplitType>(dataset.expenses.map((expense) => expense.splitType));
  for (const splitType of ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'] as SplitType[]) {
    assert(splitTypes.has(splitType), `the demo must exercise the ${splitType} split type`);
  }

  for (const group of dataset.groups) {
    assert(group.members.length > 0, `group ${group.name} must have members`);
    for (const member of group.members) {
      assert(userIds.has(member.userId), `group ${group.name} references an unknown user`);
    }
  }

  for (const expense of dataset.expenses) {
    assert(userIds.has(expense.createdBy), `expense ${expense.id} has an unknown creator`);
    if (expense.groupId !== null) {
      assert(groupIds.has(expense.groupId), `expense ${expense.id} references an unknown group`);
    }
    for (const payer of expense.paidBy) {
      assert(userIds.has(payer.userId), `expense ${expense.id} has an unknown payer`);
    }
    for (const split of expense.splits) {
      assert(userIds.has(split.userId), `expense ${expense.id} has an unknown participant`);
    }
    assert(
      !Number.isNaN(new Date(expense.date).getTime()),
      `expense ${expense.id} must carry a parseable ISO date`
    );
  }

  for (const activity of dataset.activities) {
    assert(userIds.has(activity.actorUserId), `activity ${activity.id} has an unknown actor`);
    const parent = dataset.expenses.find((expense) => expense.id === activity.entityId);
    const group = dataset.groups.find((entry) => entry.id === activity.entityId);
    assert(
      parent !== undefined || group !== undefined,
      `activity ${activity.id} points at a missing entity`
    );
  }
});

test('every seeded expense reconciles in integer minor units', () => {
  assertDatasetReconciles(buildSeedDataset(FIXED_SEED_TIMESTAMP));
});

test('every group ledger balances to zero and simplifies to at most N-1 transfers', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);

  for (const group of dataset.groups) {
    const memberIds = group.members.map((member) => member.userId);
    const groupExpenses = dataset.expenses.filter((expense) => expense.groupId === group.id);

    assert(
      isLedgerBalanced(memberIds, groupExpenses, group.currency),
      `group ${group.name} must reconcile to zero`
    );

    const transfers = calculateSimplifiedDebts(memberIds, groupExpenses, group.currency);
    assert(
      transfers.length <= memberIds.length - 1,
      `group ${group.name} must simplify to at most ${memberIds.length - 1} transfers`
    );

    for (const memberId of memberIds) {
      const impact = calculateTransferImpact(transfers, memberId);
      const netBalance = calculateNetBalances(memberIds, groupExpenses, group.currency).get(
        memberId
      );
      assertEqual(
        toMinorUnits(impact.isOwed, group.currency) - toMinorUnits(impact.owes, group.currency),
        toMinorUnits(netBalance?.toNumber() ?? 0, group.currency),
        `group ${group.name}: transfer impact for ${memberId} must reproduce the net balance`
      );
    }
  }
});

test('direct peer-to-peer expenses resolve without a group', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  const directExpenses = dataset.expenses.filter((expense) => expense.groupId === null);
  const allUserIds = dataset.users.map((user) => user.id);

  assert(directExpenses.length > 0, 'the demo must contain direct expenses');
  assert(
    isLedgerBalanced(allUserIds, directExpenses, 'USD'),
    'the direct ledger must reconcile to zero'
  );

  const pairwise = calculatePairwiseBalance(
    SEED_USER_IDS.SELF,
    SEED_USER_IDS.SARAH,
    directExpenses,
    'USD'
  );
  assert(
    Number.isFinite(pairwise),
    'pairwise balance between two friends must be a finite number'
  );
});

test('the demo dataset exercises the CRUD-safe settlement path', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  const settlement = dataset.expenses.find((expense) => expense.isSettlement);

  assert(settlement !== undefined, 'the demo must include a settlement');
  assertEqual(settlement.paidBy.length, 1, 'a settlement has exactly one payer');
  assertEqual(settlement.splits.length, 1, 'a settlement credits exactly one recipient');
  assertEqual(settlement.splitType, 'EXACT', 'a settlement is an exact transfer');
  assertEqual(
    settlement.paidBy[0].amountPaid,
    settlement.splits[0].owedAmount,
    'settlement payer and recipient amounts must match'
  );
  assert(
    settlement.paidBy[0].userId !== settlement.splits[0].userId,
    'a settlement cannot transfer money to oneself'
  );
  assert(
    calculateTotalSpend(dataset.expenses, 'USD') > 0,
    'settlements must not reduce recorded spend to zero'
  );
});

test('the demo activities agree with the seeded ledger', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);

  assertEqual(
    dataset.activities.length,
    dataset.expenses.length + dataset.groups.length,
    'every expense and group contributes exactly one activity entry'
  );

  const sorted = [...dataset.activities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  assertEqual(
    dataset.activities.map((activity) => activity.id).join(','),
    sorted.map((activity) => activity.id).join(','),
    'activities must be ordered newest first'
  );

  for (const activity of dataset.activities) {
    const expectedAction = activity.entityId.startsWith('group-')
      ? 'GROUP_CREATED'
      : dataset.expenses.find((expense) => expense.id === activity.entityId)?.isSettlement
        ? 'SETTLEMENT_RECORDED'
        : 'EXPENSE_CREATED';
    assertEqual(activity.action, expectedAction, `activity ${activity.id} action`);
  }
});

test('seed group ids stay stable for the persistence layer', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  assertEqual(SEED_GROUP_IDS.KYOTO, 'group-kyoto', 'kyoto group id');
  assertEqual(SEED_USER_IDS.SELF, 'user-self', 'the primary user id');

  const kyoto = dataset.groups.find((group) => group.id === SEED_GROUP_IDS.KYOTO);
  assert(kyoto !== undefined, 'the kyoto group must exist');
  assert(
    kyoto.members.some((member) => member.role === 'ADMIN'),
    'every demo group needs an admin'
  );
  assertEqual(kyoto.currency, 'USD', 'the demo groups are USD ledgers');
});

/* ---------------------------------------------------- serialisation suite */

section('Snapshot serialisation \u2014 JSON and CSV round trips');

test('a CSV export round-trips every expense without loss', () => {
  const expenses = [
    makeExpense({
      id: 'e1',
      amount: 100,
      description: 'Team dinner',
      category: 'FOOD_AND_DRINK',
      paidBy: [{ userId: 'a', amountPaid: 100 }],
      splitType: 'EQUAL',
      participantIds: ['a', 'b', 'c'],
      daysAgo: 3,
    }),
    makeExpense({
      id: 'e2',
      amount: 64,
      description: 'Temple passes',
      category: 'ENTERTAINMENT',
      paidBy: [
        { userId: 'a', amountPaid: 32 },
        { userId: 'b', amountPaid: 32 },
      ],
      splitType: 'EQUAL',
      participantIds: ['a', 'b', 'c'],
      daysAgo: 2,
      currency: 'EUR',
    }),
  ];

  const csv = serializeExpensesToCsv(expenses);
  const { expenses: parsed, report } = parseExpensesFromCsv(csv);

  assertEqual(report.skipped.length, 0, 'nothing should be skipped');
  assertEqual(parsed.length, 2, 'both rows survive the round trip');

  for (const [index, original] of expenses.entries()) {
    const restored = parsed[index];
    assertEqual(restored.id, original.id, `row ${index} id`);
    assertEqual(restored.description, original.description, `row ${index} description`);
    assertEqual(restored.amount, original.amount, `row ${index} amount`);
    assertEqual(restored.currency, original.currency, `row ${index} currency`);
    assertEqual(restored.category, original.category, `row ${index} category`);
    assertEqual(restored.splitType, original.splitType, `row ${index} split type`);
    assertEqual(restored.paidBy.length, original.paidBy.length, `row ${index} payer count`);
    assertEqual(restored.splits.length, original.splits.length, `row ${index} split count`);
    assertEqual(
      JSON.stringify(restored.splits),
      JSON.stringify(original.splits),
      `row ${index} splits survive exactly`
    );
    assertEqual(
      JSON.stringify(restored.paidBy),
      JSON.stringify(original.paidBy),
      `row ${index} multi-payer distribution survives exactly`
    );
  }
});

test('CSV escaping survives commas, quotes and newlines', () => {
  const tricky = makeExpense({
    id: 'e-tricky',
    amount: 10,
    description: 'Lunch, "the good place"\nwith the team',
    paidBy: [{ userId: 'a', amountPaid: 10 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
  });

  const csv = serializeExpensesToCsv([tricky]);
  const { expenses: parsed } = parseExpensesFromCsv(csv);

  assertEqual(parsed.length, 1, 'a quoted description parses as one row');
  assertEqual(
    parsed[0].description,
    'Lunch, "the good place"\nwith the team',
    'quotes, commas and newlines are preserved exactly'
  );
  assertEqual(escapeCsvValue('plain'), 'plain', 'plain values are not quoted');
  assertEqual(escapeCsvValue('a,b'), '"a,b"', 'commas force quoting');
  assertEqual(escapeCsvValue('say "hi"'), '"say ""hi"""', 'inner quotes are doubled');
});

test('CSV parsing reports missing columns and bad rows instead of throwing', () => {
  assertThrows(
    () => parseExpensesFromCsv('description,amount\nDinner,10'),
    'a CSV without the required columns is rejected'
  );

  const partial = parseExpensesFromCsv(
    [
      CSV_COLUMNS.join(','),
      'good,2026-09-01T00:00:00.000Z,Dinner,FOOD_AND_DRINK,20,USD,,EQUAL,a:20,a:10|b:10,false,a,',
      ',,Broken,,,,,,,,,',
    ].join('\n')
  );
  assertEqual(partial.expenses.length, 1, 'only the complete row is imported');
  assertEqual(partial.report.skipped.length, 1, 'the broken row is reported');
  assert(
    (partial.report.skipped[0].reason ?? '').includes('missing'),
    'the reason explains what was wrong'
  );
});

test('a JSON snapshot round-trips users, groups, expenses and activities', () => {
  const dataset = buildSeedDataset(FIXED_SEED_TIMESTAMP);
  const snapshot = createSnapshot(dataset);
  const serialized = serializeSnapshot(snapshot);
  const { snapshot: restored, report } = parseSnapshot(serialized);

  assertEqual(report.valid, true, 'the snapshot parses');
  assertEqual(report.skipped.length, 0, 'a clean snapshot skips nothing');
  assertEqual(restored.users.length, dataset.users.length, 'users survive');
  assertEqual(restored.groups.length, dataset.groups.length, 'groups survive');
  assertEqual(restored.expenses.length, dataset.expenses.length, 'expenses survive');
  assertEqual(restored.activities.length, dataset.activities.length, 'activities survive');

  const originalExpense = dataset.expenses[0];
  const restoredExpense = restored.expenses.find((expense) => expense.id === originalExpense.id);
  assert(restoredExpense !== undefined, 'a specific expense is present');
  assertEqual(restoredExpense.amount, originalExpense.amount, 'amount survives');
  assertEqual(restoredExpense.splitType, originalExpense.splitType, 'split type survives');
  assertEqual(
    JSON.stringify(restoredExpense.splits),
    JSON.stringify(originalExpense.splits),
    'splits survive byte for byte'
  );

  // The restored ledger must still reconcile: a backup that parses but no longer
  // balances would be worse than a rejected one.
  assertDatasetReconciles(restored);
});

test('snapshot parsing rejects impossible input and reports repairs', () => {
  assertThrows(() => parseSnapshot('{not json'), 'malformed JSON is rejected');
  assertThrows(() => parseSnapshot('[]'), 'a JSON array is not a snapshot');
  assertThrows(
    () => parseSnapshot(JSON.stringify({ version: SNAPSHOT_VERSION + 5, users: [] })),
    'a future schema version is rejected rather than silently misread'
  );

  const withOrphan = JSON.stringify({
    version: SNAPSHOT_VERSION,
    users: [
      {
        id: 'known',
        name: 'Known Person',
        email: '',
        avatarUrl: '',
        defaultCurrency: 'USD',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    groups: [],
    expenses: [
      {
        id: 'orphan',
        description: 'Paid by a ghost',
        amount: 10,
        currency: 'USD',
        paidBy: [{ userId: 'ghost', amountPaid: 10 }],
        splits: [{ userId: 'known', owedAmount: 10 }],
        splitType: 'EQUAL',
        date: '2026-01-01T00:00:00.000Z',
      },
    ],
    activities: [],
  });

  const { snapshot, report } = parseSnapshot(withOrphan);
  assertEqual(snapshot.expenses.length, 0, 'an expense referencing an unknown user is dropped');
  assertEqual(report.skipped.length, 1, 'the drop is reported, not silent');
  assert(
    (report.skipped[0].reason ?? '').includes('user'),
    'the reason names the problem'
  );

  const minimal = JSON.stringify({ version: SNAPSHOT_VERSION });
  const { snapshot: empty } = parseSnapshot(minimal);
  assertEqual(empty.users.length, 0, 'a snapshot with no tables parses to empty');
  assertEqual(empty.counts.expenses, 0, 'counts are reported');
  assertEqual(empty.app, 'mintsplit-expense-splitter', 'the snapshot identifies the app');
});

/* --------------------------------------------------------- filter suite */

section('Ledger filtering \u2014 search, facets and sorting');

const FILTER_EXPENSES: ExpenseItem[] = [
  makeExpense({
    id: 'f1',
    description: 'Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 320,
    paidBy: [{ userId: 'a', amountPaid: 320 }],
    splitType: 'EQUAL',
    participantIds: ['a', 'b'],
    daysAgo: 1,
  }),
  makeExpense({
    id: 'f2',
    description: 'JR Rail Passes',
    category: 'TRANSPORTATION',
    amount: 480,
    paidBy: [{ userId: 'b', amountPaid: 480 }],
    splitType: 'EXACT',
    participantIds: ['a', 'b'],
    customValues: { a: 240, b: 240 },
    daysAgo: 10,
  }),
  makeExpense({
    id: 'f3',
    description: 'Sake Tasting',
    category: 'ENTERTAINMENT',
    amount: 118.2,
    paidBy: [{ userId: 'a', amountPaid: 118.2 }],
    splitType: 'SHARES',
    participantIds: ['a', 'c'],
    customValues: { a: 2, c: 1 },
    daysAgo: 40,
  }),
  makeExpense({
    id: 'f4',
    description: 'Settlement Payment',
    category: 'GENERAL',
    amount: 50,
    paidBy: [{ userId: 'b', amountPaid: 50 }],
    splitType: 'EXACT',
    participantIds: ['a'],
    customValues: { a: 50 },
    daysAgo: 2,
    isSettlement: true,
  }),
];

test('settlements are excluded from the ledger unless requested', () => {
  const withoutSettlements = applyLedgerFilters(FILTER_EXPENSES, DEFAULT_LEDGER_FILTERS);
  assertEqual(withoutSettlements.length, 3, 'settlements hidden by default');
  assert(
    withoutSettlements.every((expense) => !expense.isSettlement),
    'no settlement rows leak through'
  );

  const withSettlements = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    includeSettlements: true,
  });
  assertEqual(withSettlements.length, 4, 'settlements appear when requested');
});

test('search matches description, notes and category case-insensitively', () => {
  assertEqual(
    applyLedgerFilters(FILTER_EXPENSES, { ...DEFAULT_LEDGER_FILTERS, searchText: 'kaiseki' }).length,
    1,
    'lowercase search finds a capitalised description'
  );
  assertEqual(
    applyLedgerFilters(FILTER_EXPENSES, { ...DEFAULT_LEDGER_FILTERS, searchText: '  RAIL  ' }).length,
    1,
    'surrounding whitespace is ignored'
  );
  assertEqual(
    applyLedgerFilters(FILTER_EXPENSES, { ...DEFAULT_LEDGER_FILTERS, searchText: 'TRANSPORTATION' }).length,
    1,
    'the category name is searchable'
  );
  assertEqual(
    applyLedgerFilters(FILTER_EXPENSES, { ...DEFAULT_LEDGER_FILTERS, searchText: 'nothing here' }).length,
    0,
    'a miss returns nothing'
  );
});

test('category, split type, member and amount facets all narrow the ledger', () => {
  const byCategory = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    categories: ['FOOD_AND_DRINK', 'ENTERTAINMENT'],
  });
  assertEqual(byCategory.length, 2, 'two categories match');

  const bySplitType = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    splitTypes: ['SHARES'],
  });
  assertEqual(bySplitType.length, 1, 'one share-based expense');
  assertEqual(bySplitType[0].id, 'f3', 'the right row matched');

  const byMember = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    memberIds: ['c'],
  });
  assertEqual(byMember.length, 1, 'only expenses involving c');
  assertEqual(byMember[0].id, 'f3', 'c appears on the sake tasting');

  const byAmount = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    minAmount: 200,
    maxAmount: 400,
  });
  assertEqual(byAmount.length, 1, 'only expenses between 200 and 400');
  assertEqual(byAmount[0].id, 'f1', 'the dinner matched');
});

test('date range filtering is inclusive at both ends', () => {
  const now = Date.now();
  const range = {
    from: new Date(now - 11 * 86_400_000).toISOString(),
    to: new Date(now - 9 * 86_400_000).toISOString(),
  };

  const filtered = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    dateRange: range,
  });
  assertEqual(filtered.length, 1, 'only the row inside the window matches');
  assertEqual(filtered[0].id, 'f2', 'the rail passes fall in the window');
});

test('sorting orders the ledger deterministically', () => {
  const byDateDesc = applyLedgerFilters(FILTER_EXPENSES, DEFAULT_LEDGER_FILTERS);
  assertEqual(byDateDesc[0].id, 'f1', 'newest first by default');

  const byAmountDesc = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    sortKey: 'AMOUNT_DESC',
  });
  assertEqual(byAmountDesc[0].id, 'f2', 'largest amount first');

  const byAmountAsc = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    sortKey: 'AMOUNT_ASC',
  });
  assertEqual(byAmountAsc[0].id, 'f3', 'smallest amount first');

  const byDescription = applyLedgerFilters(FILTER_EXPENSES, {
    ...DEFAULT_LEDGER_FILTERS,
    sortKey: 'DESCRIPTION_ASC',
  });
  assertEqual(byDescription[0].description, 'JR Rail Passes', 'alphabetical order');

  const original = FILTER_EXPENSES.map((expense) => expense.id);
  applyLedgerFilters(FILTER_EXPENSES, { ...DEFAULT_LEDGER_FILTERS, sortKey: 'AMOUNT_DESC' });
  assertEqual(
    FILTER_EXPENSES.map((expense) => expense.id).join(','),
    original.join(','),
    'filtering never mutates the input array'
  );
});

test('active filter counting drives the toolbar badge', () => {
  assertEqual(countActiveFilters(DEFAULT_LEDGER_FILTERS), 0, 'no filters by default');
  assert(!hasActiveFilters(DEFAULT_LEDGER_FILTERS), 'nothing active by default');

  assertEqual(
    countActiveFilters({ ...DEFAULT_LEDGER_FILTERS, searchText: 'kaiseki' }),
    1,
    'search counts once'
  );
  assertEqual(
    countActiveFilters({ ...DEFAULT_LEDGER_FILTERS, searchText: '   ' }),
    0,
    'whitespace-only search does not count'
  );
  assertEqual(
    countActiveFilters({
      ...DEFAULT_LEDGER_FILTERS,
      categories: ['GENERAL', 'LODGING'],
      splitTypes: ['EQUAL'],
      memberIds: ['a'],
      minAmount: 10,
    }),
    5,
    'every facet contributes'
  );
  assert(
    hasActiveFilters({
      ...DEFAULT_LEDGER_FILTERS,
      dateRange: { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' },
    }),
    'a date range counts as active'
  );
});

/* ---------------------------------------------------- receipt pipeline suite */

section('Receipt pipeline \u2014 pure helpers');

test('image fitting bounds the longest edge without distorting the aspect ratio', () => {
  const landscape = fitWithin(4000, 3000, 800);
  assertEqual(landscape.width, 800, 'longest edge is clamped');
  assertEqual(landscape.height, 600, 'aspect ratio is preserved');

  const portrait = fitWithin(1200, 2400, 800);
  assertEqual(portrait.width, 400, 'portrait width scales');
  assertEqual(portrait.height, 800, 'portrait longest edge is clamped');

  const small = fitWithin(320, 240, 800);
  assertEqual(small.width, 320, 'a small image is never upscaled');
  assertEqual(small.height, 240, 'a small image keeps its height');
  assertEqual(small.scale, 1, 'a small image is unscaled');

  const degenerate = fitWithin(0, 0, 800);
  assertEqual(degenerate.width, 1, 'a zero-width image cannot produce a zero canvas');
  assertEqual(degenerate.height, 1, 'a zero-height image cannot produce a zero canvas');
});

test('data URL size estimation matches the base64 expansion', () => {
  const payload = 'A'.repeat(400);
  const dataUrl = `data:image/jpeg;base64,${payload}`;
  assertEqual(estimateDataUrlBytes(dataUrl), 300, '400 base64 chars decode to 300 bytes');
  assertEqual(estimateDataUrlBytes('data:image/jpeg;base64,'), 0, 'an empty payload is zero bytes');
});

test('receipt files are validated before any decoding happens', () => {
  const notAnImage = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  assertThrows(() => validateReceiptFile(notAnImage), 'a text file is rejected');

  const emptyImage = new File([], 'empty.jpg', { type: 'image/jpeg' });
  assertThrows(() => validateReceiptFile(emptyImage), 'an empty image is rejected');

  const goodImage = new File(['x'.repeat(1024)], 'receipt.jpg', { type: 'image/jpeg' });
  validateReceiptFile(goodImage);
  assert(true, 'a normal image passes validation');
});

/* ---------------------------------------------------- settlement plan suite */

section('Settlement planning \u2014 suggestions, guards and clearing');

const SETTLE_EXPENSE = makeExpense({
  id: 'sp-1',
  amount: 90,
  paidBy: [{ userId: 'a', amountPaid: 90 }],
  splitType: 'EQUAL',
  participantIds: ['a', 'b'],
  daysAgo: 5,
});

test('the suggested amount is exactly what is outstanding', () => {
  // a fronted 90 and carries a 45 share, so b owes a 45.
  assertEqual(
    suggestSettlementAmount('b', 'a', [SETTLE_EXPENSE], 'USD'),
    45,
    'the debtor is asked for the exact outstanding amount'
  );
  assertEqual(
    suggestSettlementAmount('a', 'b', [SETTLE_EXPENSE], 'USD'),
    0,
    'the creditor is never asked to pay'
  );
  assertEqual(
    suggestSettlementAmount('b', 'a', [], 'USD'),
    0,
    'an empty ledger suggests nothing'
  );
  assertEqual(
    suggestSettlementAmount('b', 'a', [SETTLE_EXPENSE], 'JPY'),
    0,
    'a currency mismatch suggests nothing'
  );
});

test('the plan states the outstanding position from the payer\'s perspective', () => {
  const debtor = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: 45,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(debtor.position, 'OWES', 'b owes a');
  assertEqual(debtor.outstanding, 45, 'the outstanding amount is a magnitude');
  assertEqual(debtor.canSubmit, true, 'a full payment may be submitted');
  assertEqual(debtor.clearsBalance, true, 'a full payment clears the debt');
  assertEqual(debtor.remainingAfter, 0, 'nothing remains');
  assertEqual(debtor.overpays, false, 'an exact payment is not an overpayment');

  const creditor = buildSettlementPlan({
    fromUserId: 'a',
    toUserId: 'b',
    amount: 10,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(creditor.position, 'OWED', 'a is owed by b');
  assertEqual(creditor.clearsBalance, false, 'paying the wrong way never "clears" anything');
  assertEqual(creditor.remainingAfter, 10, 'the payment would flip the debt');
});

test('partial payments report what would remain', () => {
  const partial = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: 20,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(partial.clearsBalance, false, '20 does not clear a 45 debt');
  assertEqual(partial.remainingAfter, 25, '25 would remain');
  assertEqual(partial.canSubmit, true, 'a partial payment is still valid');
});

test('overpayment is allowed but flagged', () => {
  const over = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: 60,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(over.clearsBalance, true, 'an overpayment clears the debt');
  assertEqual(over.overpays, true, 'the overpayment is flagged');
  assertEqual(over.remainingAfter, 0, 'remaining never goes negative');
});

test('the plan blocks invalid settlements before any write', () => {
  const samePerson = buildSettlementPlan({
    fromUserId: 'a',
    toUserId: 'a',
    amount: 10,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(samePerson.canSubmit, false, 'a self-payment is blocked');
  assert(
    (samePerson.validationError ?? '').includes('two different people'),
    'the reason is explained'
  );

  const noReceiver = buildSettlementPlan({
    fromUserId: 'a',
    toUserId: '',
    amount: 10,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(noReceiver.canSubmit, false, 'a missing receiver is blocked');

  const zero = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: 0,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(zero.canSubmit, false, 'a zero payment is blocked');
  assertEqual(zero.validationError, 'Enter a payment amount greater than zero.', 'message');

  const negative = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: -20,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(negative.canSubmit, false, 'a negative payment is blocked');
});

test('sub-penny amounts are treated as zero rather than rounding up', () => {
  const subPenny = buildSettlementPlan({
    fromUserId: 'b',
    toUserId: 'a',
    amount: 0.004,
    currency: 'USD',
    expenses: [SETTLE_EXPENSE],
  });
  assertEqual(subPenny.amountMinorUnits, 0, 'a sub-penny amount rounds to zero minor units');
  assertEqual(subPenny.canSubmit, false, 'and therefore cannot be submitted');
});

test('a settlement really does zero the outstanding balance', () => {
  const before = calculateSimplifiedDebts(['a', 'b'], [SETTLE_EXPENSE], 'USD');
  assertEqual(before.length, 1, 'there is a debt before settling');
  assertEqual(before[0].amount, 45, 'for the outstanding amount');

  const settlement = makeExpense({
    id: 'sp-settle',
    amount: suggestSettlementAmount('b', 'a', [SETTLE_EXPENSE], 'USD'),
    paidBy: [{ userId: 'b', amountPaid: 45 }],
    splitType: 'EXACT',
    participantIds: ['a'],
    customValues: { a: 45 },
    isSettlement: true,
  });

  const after = calculateSimplifiedDebts(['a', 'b'], [SETTLE_EXPENSE, settlement], 'USD');
  assertEqual(after.length, 0, 'the suggested amount clears the debt exactly');
  assert(
    isLedgerBalanced(['a', 'b'], [SETTLE_EXPENSE, settlement], 'USD'),
    'the ledger still reconciles after settling'
  );
});

/* --------------------------------------------------- draft validation suite */

section('Expense draft validation \u2014 the rules the form and writer share');

const validDraft = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  groupId: null,
  description: 'Dinner',
  category: 'FOOD_AND_DRINK',
  amount: 90,
  currency: 'USD',
  paidBy: [{ userId: 'a', amountPaid: 90 }],
  splitType: 'EQUAL',
  participantIds: ['a', 'b'],
  date: new Date().toISOString(),
  ...overrides,
});

test('a well-formed draft validates and returns the splits to store', () => {
  const result = validateDraft(validDraft());
  assertEqual(result.error, null, 'no error');
  assertEqual(result.problems.length, 0, 'no problems');
  assertEqual(result.splits.length, 2, 'two splits are produced');
  assertEqual(sumSplitAmounts(result.splits), 90, 'the splits reconcile to the total');
});

test('each missing field produces one clear problem', () => {
  assertEqual(validateDraft(validDraft({ description: '   ' })).error, 'Give this expense a description.', 'blank description');
  assertEqual(validateDraft(validDraft({ amount: 0 })).error, 'Enter an amount greater than zero.', 'zero amount');
  assertEqual(validateDraft(validDraft({ amount: -5 })).error, 'Enter an amount greater than zero.', 'negative amount');
  assertEqual(validateDraft(validDraft({ amount: Number.NaN })).error, 'Enter an amount greater than zero.', 'NaN amount');
  assertEqual(
    validateDraft(validDraft({ participantIds: [] })).error,
    'Select at least one person to split this expense with.',
    'no participants'
  );
  assertEqual(validateDraft(validDraft({ paidBy: [] })).error, 'Select who paid for this expense.', 'no payer');
});

test('duplicate participants and duplicate payers are rejected', () => {
  const duplicates = validateDraft(validDraft({ participantIds: ['a', 'a'] }));
  assert(
    (duplicates.problems.join(' ')).includes('only appear once'),
    'a duplicated participant is reported'
  );

  const duplicatePayers = validateDraft(
    validDraft({
      paidBy: [
        { userId: 'a', amountPaid: 45 },
        { userId: 'a', amountPaid: 45 },
      ],
    })
  );
  assert(
    (duplicatePayers.problems.join(' ')).includes('payer may only appear once'),
    'a duplicated payer is reported'
  );

  const negativePayer = validateDraft(validDraft({ paidBy: [{ userId: 'a', amountPaid: -90 }] }));
  assert(
    (negativePayer.problems.join(' ')).includes('cannot be negative'),
    'a negative payer amount is reported'
  );
});

test('a payer distribution that misses the total is rejected to the penny', () => {
  const short = validateDraft(
    validDraft({
      amount: 90,
      paidBy: [
        { userId: 'a', amountPaid: 30 },
        { userId: 'b', amountPaid: 30 },
      ],
    })
  );
  assertEqual(short.error, 'The amounts each payer fronted must add up to the expense total.', 'shortfall');

  const offByAPenny = validateDraft(
    validDraft({
      amount: 0.02,
      paidBy: [{ userId: 'a', amountPaid: 0.01 }],
      participantIds: ['a'],
    })
  );
  assert(offByAPenny.error !== null, 'a one-penny shortfall on a tiny total is still rejected');

  const exactSplit = validateDraft(
    validDraft({
      amount: 90,
      paidBy: [
        { userId: 'a', amountPaid: 45 },
        { userId: 'b', amountPaid: 45 },
      ],
    })
  );
  assertEqual(exactSplit.error, null, 'a multi-payer distribution that matches is accepted');
});

test('split-level errors surface through the draft validator', () => {
  const badPercent = validateDraft(
    validDraft({
      splitType: 'PERCENT',
      customValues: { a: 50, b: 40 },
    })
  );
  assert(badPercent.error !== null, 'percentages that miss 100% are rejected');
  assert((badPercent.error ?? '').includes('100'), 'the message states the requirement');

  const badShares = validateDraft(
    validDraft({
      splitType: 'SHARES',
      customValues: { a: 0, b: 0 },
    })
  );
  assert((badShares.error ?? '').includes('shares'), 'zero shares are rejected');

  const badExact = validateDraft(
    validDraft({
      splitType: 'EXACT',
      customValues: { a: 30, b: 30 },
    })
  );
  assert((badExact.error ?? '').includes('does not match'), 'exact amounts must reach the total');

  const validExact = validateDraft(
    validDraft({
      splitType: 'EXACT',
      customValues: { a: 45, b: 45 },
    })
  );
  assertEqual(validExact.error, null, 'a valid exact split passes');
});

test('JPY drafts are validated in whole yen', () => {
  const yen = validateDraft(
    validDraft({
      currency: 'JPY',
      amount: 1000,
      paidBy: [{ userId: 'a', amountPaid: 1000 }],
      participantIds: ['a', 'b', 'c'],
    })
  );
  assertEqual(yen.error, null, 'a JPY draft validates');
  assert(
    yen.splits.every((split) => Number.isInteger(split.owedAmount)),
    'JPY splits never produce fractional yen'
  );
  assertEqual(sumSplitAmounts(yen.splits), 1000, 'JPY splits sum exactly');
});

/* ------------------------------------------------- responsive contract suite */

section('Responsive contract \u2014 360px through 1440px');

test('every validated viewport resolves to the intended layout bucket', () => {
  const expectations: [number, ViewportBucket][] = [
    [320, 'MOBILE_SMALL'],
    [360, 'MOBILE_SMALL'],
    [361, 'MOBILE'],
    [390, 'MOBILE'],
    [430, 'MOBILE'],
    [600, 'MOBILE'],
    [767, 'MOBILE'],
    [768, 'TABLET'],
    [1023, 'TABLET'],
    [1024, 'DESKTOP'],
    [1280, 'DESKTOP'],
    [1439, 'DESKTOP'],
    [1440, 'DESKTOP_WIDE'],
    [1920, 'DESKTOP_WIDE'],
  ];

  for (const [width, expected] of expectations) {
    assertEqual(resolveViewportBucket(width), expected, `${width}px resolves to ${expected}`);
  }
});

test('degenerate widths degrade to the smallest layout rather than crashing', () => {
  assertEqual(resolveViewportBucket(0), 'MOBILE_SMALL', 'zero width');
  assertEqual(resolveViewportBucket(-100), 'MOBILE_SMALL', 'negative width');
  assertEqual(resolveViewportBucket(Number.NaN), 'MOBILE_SMALL', 'NaN width');
  // Unusable input falls back to the *most constrained* layout: a narrow single
  // column is always readable, whereas optimistically rendering the wide desktop
  // layout could overflow an unknown device.
  assertEqual(resolveViewportBucket(Number.POSITIVE_INFINITY), 'MOBILE_SMALL', 'non-finite width');
});

test('compact layouts identify the viewports that need stacked controls', () => {
  assert(isCompactBucket('MOBILE_SMALL'), '360px is compact');
  assert(isCompactBucket('MOBILE'), '390-767px is compact');
  assert(!isCompactBucket('TABLET'), '768px is not compact');
  assert(!isCompactBucket('DESKTOP'), '1024px is not compact');
  assert(!isCompactBucket('DESKTOP_WIDE'), '1440px is not compact');
});

test('every grid span collapses to a full-width column on phones', () => {
  for (const [name, span] of Object.entries(responsiveSpans)) {
    assertEqual(
      (span as { xs: number }).xs === 12 || (span as { xs: number }).xs === 24,
      true,
      `${name} must start at 12 or 24 units on the smallest viewport`
    );
  }
  assertEqual(responsiveSpans.full.xs, 24, 'ledgers and forms are full width on phones');
  assertEqual(responsiveSpans.half.xs, 24, 'halves stack on phones');
  assertEqual(responsiveSpans.half.sm, 12, 'halves sit side by side from 576px');
  assertEqual(responsiveSpans.primary.xs, 24, 'the ledger column is full width on phones');
  assertEqual(responsiveSpans.primary.lg, 15, 'the ledger column shares a 24-unit row from 1024px');
  assertEqual(
    responsiveSpans.primary.lg + responsiveSpans.secondary.lg,
    24,
    'the ledger and its rail always fill exactly one row'
  );
});

test('the fixed mobile navigation is accounted for in content insets', () => {
  assertEqual(mobileContentInset(false), 0, 'desktop content needs no reserved gutter');
  assert(mobileContentInset(true) > layoutMetrics.mobileNavHeight, 'mobile content clears the nav bar');
});

test('touch targets meet the 44px minimum everywhere', () => {
  assert(touchTarget.min >= 44, 'the design token floor is at least 44px');
  assert(touchTarget.comfortable >= touchTarget.min, 'the comfortable target is larger');
  assert(
    layoutMetrics.mobileNavHeight >= touchTarget.min,
    'the bottom nav bar is at least one touch target tall'
  );
});

test('the stylesheet implements the responsive and accessibility rules', () => {
  const css = readFileSync(stylesPath, 'utf8');

  assertContains(css, 'min-width: 768px', 'the bottom navigation is hidden from 768px up');
  assertContains(css, '.mobile-bottom-nav', 'the bottom navigation has a class hook');
  assertContains(css, 'prefers-reduced-motion', 'reduced-motion preferences are honoured');
  assertContains(css, 'safe-area-inset-bottom', 'iOS safe-area insets are honoured');
  assertContains(css, 'overflow-x: hidden', 'the page cannot scroll sideways at 360px');
  assertContains(css, ':focus-visible', 'keyboard focus is visible');
  assertContains(css, '--touch-target: 44px', 'the touch-target token is defined in CSS too');
  assertContains(css, 'tabular-nums', 'money numerals are tabular globally');
  assertContains(css, 'box-sizing: border-box', 'layout box model is normalised');
});

/* ---------------------------------------------------------------- reporting */

exitWithReport();

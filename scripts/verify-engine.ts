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
import type {
  CurrencyCode,
  ExpenseCategory,
  ExpenseItem,
  ExpensePayer,
  SplitType,
  UUID,
} from '../src/types';

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n${title}`);
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name} -> ${message}`);
    console.error(`  \u2717 ${name}\n      ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, received ${String(actual)})`);
  }
}

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

/* ---------------------------------------------------------------- reporting */

section('Summary');
console.log(`  ${passed} checks passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nAll engine verification checks passed.');
}

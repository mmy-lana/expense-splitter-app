import { computeSplits } from '../utils/splitEngine';
import { toMinorUnits } from '../utils/currency';
import type {
  ActivityLog,
  CurrencyCode,
  ExpenseCategory,
  ExpenseItem,
  ExpensePayer,
  Group,
  SplitType,
  UUID,
  UserProfile,
} from '../types';

/**
 * Deterministic demo dataset builder (pure, storage-free).
 *
 * Keeping the dataset free of Dexie lets the verification harness audit the
 * shipped sample ledger directly: every expense is materialised through the real
 * split engine and then re-checked in integer minor units, so Σ paid === Σ owed
 * for every row, to the penny.
 *
 * (Avatar URLs point at a public CDN; when the app runs fully offline the Avatar
 * atom falls back to initials, so nothing breaks without a network.)
 */

export const SEED_USER_IDS = {
  SELF: 'user-self',
  SARAH: 'user-sarah',
  MARCUS: 'user-marcus',
  ELENA: 'user-elena',
  PRIYA: 'user-priya',
} as const;

export const SEED_GROUP_IDS = {
  KYOTO: 'group-kyoto',
  APARTMENT: 'group-apartment',
  CABIN: 'group-cabin',
} as const;

export interface SeedDataset {
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  activities: ActivityLog[];
}

export interface SeedSpec {
  id: string;
  groupId: UUID | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  paidBy: ExpensePayer[];
  splitType: SplitType;
  participantIds: UUID[];
  customValues?: Record<UUID, number>;
  /** Whole days before the seed timestamp; spreads the ledger over time. */
  daysAgo: number;
  createdBy: UUID;
  notes?: string;
  isSettlement?: boolean;
  currency?: CurrencyCode;
}

const DAY_MS = 86_400_000;

export const SEED_EXPENSE_SPECS: SeedSpec[] = [
  {
    id: 'exp-101',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Traditional Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 320,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 320 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.MARCUS,
      SEED_USER_IDS.ELENA,
    ],
    daysAgo: 12,
    createdBy: SEED_USER_IDS.SELF,
    notes: 'Paid via Amex Platinum. Gratuity already included.',
  },
  {
    id: 'exp-102',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'JR Rail Passes',
    category: 'TRANSPORTATION',
    amount: 480,
    paidBy: [{ userId: SEED_USER_IDS.SARAH, amountPaid: 480 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.MARCUS,
      SEED_USER_IDS.ELENA,
    ],
    daysAgo: 11,
    createdBy: SEED_USER_IDS.SARAH,
  },
  {
    id: 'exp-103',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Ryokan Night with Onsen',
    category: 'LODGING',
    amount: 1240,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 1240 }],
    splitType: 'PERCENT',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.MARCUS,
      SEED_USER_IDS.ELENA,
    ],
    customValues: {
      [SEED_USER_IDS.SELF]: 30,
      [SEED_USER_IDS.SARAH]: 20,
      [SEED_USER_IDS.MARCUS]: 20,
      [SEED_USER_IDS.ELENA]: 30,
    },
    daysAgo: 10,
    createdBy: SEED_USER_IDS.SELF,
    notes: 'Corner suite upgrade was on me.',
  },
  {
    id: 'exp-104',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Nishiki Market Groceries',
    category: 'GROCERIES',
    amount: 86.4,
    paidBy: [{ userId: SEED_USER_IDS.MARCUS, amountPaid: 86.4 }],
    splitType: 'SHARES',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.MARCUS,
      SEED_USER_IDS.ELENA,
    ],
    customValues: {
      [SEED_USER_IDS.SELF]: 2,
      [SEED_USER_IDS.SARAH]: 1,
      [SEED_USER_IDS.MARCUS]: 1,
      [SEED_USER_IDS.ELENA]: 1,
    },
    daysAgo: 9,
    createdBy: SEED_USER_IDS.MARCUS,
  },
  {
    id: 'exp-105',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Fushimi Inari Taxi',
    category: 'TRANSPORTATION',
    amount: 42.75,
    paidBy: [{ userId: SEED_USER_IDS.ELENA, amountPaid: 42.75 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.MARCUS,
      SEED_USER_IDS.ELENA,
    ],
    daysAgo: 9,
    createdBy: SEED_USER_IDS.ELENA,
  },
  {
    id: 'exp-106',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Sake Tasting Flight',
    category: 'ENTERTAINMENT',
    amount: 118.2,
    paidBy: [{ userId: SEED_USER_IDS.SARAH, amountPaid: 118.2 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.SARAH, SEED_USER_IDS.ELENA],
    daysAgo: 8,
    createdBy: SEED_USER_IDS.SARAH,
    notes: 'Marcus skipped this one.',
  },
  {
    id: 'exp-107',
    groupId: SEED_GROUP_IDS.KYOTO,
    description: 'Temple Entry Passes',
    category: 'ENTERTAINMENT',
    amount: 64,
    paidBy: [
      { userId: SEED_USER_IDS.SELF, amountPaid: 32 },
      { userId: SEED_USER_IDS.MARCUS, amountPaid: 32 },
    ],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.MARCUS, SEED_USER_IDS.ELENA],
    daysAgo: 8,
    createdBy: SEED_USER_IDS.SELF,
    notes: 'Ticket booth payment was split across two cards.',
  },
  {
    id: 'exp-201',
    groupId: SEED_GROUP_IDS.APARTMENT,
    description: 'Fiber Gigabit Internet',
    category: 'HOME_UTILITIES',
    amount: 85,
    paidBy: [{ userId: SEED_USER_IDS.MARCUS, amountPaid: 85 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.MARCUS],
    daysAgo: 6,
    createdBy: SEED_USER_IDS.MARCUS,
  },
  {
    id: 'exp-202',
    groupId: SEED_GROUP_IDS.APARTMENT,
    description: 'Electricity & Water',
    category: 'HOME_UTILITIES',
    amount: 132.48,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 132.48 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.MARCUS],
    daysAgo: 4,
    createdBy: SEED_USER_IDS.SELF,
  },
  {
    id: 'exp-203',
    groupId: SEED_GROUP_IDS.APARTMENT,
    description: 'Household Groceries',
    category: 'GROCERIES',
    amount: 214.35,
    paidBy: [{ userId: SEED_USER_IDS.MARCUS, amountPaid: 214.35 }],
    splitType: 'SHARES',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.MARCUS],
    customValues: { [SEED_USER_IDS.SELF]: 3, [SEED_USER_IDS.MARCUS]: 2 },
    daysAgo: 3,
    createdBy: SEED_USER_IDS.MARCUS,
  },
  {
    id: 'exp-204',
    groupId: SEED_GROUP_IDS.APARTMENT,
    description: 'Deep Cleaning Service',
    category: 'SERVICES',
    amount: 90,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 90 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.MARCUS],
    daysAgo: 2,
    createdBy: SEED_USER_IDS.SELF,
  },
  {
    id: 'exp-301',
    groupId: SEED_GROUP_IDS.CABIN,
    description: 'Cabin Rental (3 nights)',
    category: 'LODGING',
    amount: 640,
    paidBy: [{ userId: SEED_USER_IDS.PRIYA, amountPaid: 640 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.ELENA,
      SEED_USER_IDS.PRIYA,
    ],
    daysAgo: 20,
    createdBy: SEED_USER_IDS.PRIYA,
  },
  {
    id: 'exp-302',
    groupId: SEED_GROUP_IDS.CABIN,
    description: 'Firewood & Cabin Supplies',
    category: 'GENERAL',
    amount: 78.25,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 78.25 }],
    splitType: 'EXACT',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.ELENA,
      SEED_USER_IDS.PRIYA,
    ],
    customValues: {
      [SEED_USER_IDS.SELF]: 20.25,
      [SEED_USER_IDS.SARAH]: 19,
      [SEED_USER_IDS.ELENA]: 19,
      [SEED_USER_IDS.PRIYA]: 20,
    },
    daysAgo: 20,
    createdBy: SEED_USER_IDS.SELF,
    notes: 'Priya covered the parking fee, hence the uneven split.',
  },
  {
    id: 'exp-303',
    groupId: SEED_GROUP_IDS.CABIN,
    description: 'Ski Lift Passes',
    category: 'ENTERTAINMENT',
    amount: 396,
    paidBy: [{ userId: SEED_USER_IDS.ELENA, amountPaid: 396 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.ELENA,
      SEED_USER_IDS.PRIYA,
    ],
    daysAgo: 19,
    createdBy: SEED_USER_IDS.ELENA,
  },
  {
    id: 'exp-304',
    groupId: SEED_GROUP_IDS.CABIN,
    description: 'Road Trip Fuel',
    category: 'TRANSPORTATION',
    amount: 145.8,
    paidBy: [{ userId: SEED_USER_IDS.SARAH, amountPaid: 145.8 }],
    splitType: 'EQUAL',
    participantIds: [
      SEED_USER_IDS.SELF,
      SEED_USER_IDS.SARAH,
      SEED_USER_IDS.ELENA,
      SEED_USER_IDS.PRIYA,
    ],
    daysAgo: 19,
    createdBy: SEED_USER_IDS.SARAH,
  },
  {
    id: 'exp-401',
    groupId: null,
    description: 'Concert Tickets',
    category: 'ENTERTAINMENT',
    amount: 160,
    paidBy: [{ userId: SEED_USER_IDS.SELF, amountPaid: 160 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.SARAH],
    daysAgo: 5,
    createdBy: SEED_USER_IDS.SELF,
  },
  {
    id: 'exp-402',
    groupId: null,
    description: 'Birthday Gift for Marcus',
    category: 'GENERAL',
    amount: 75,
    paidBy: [{ userId: SEED_USER_IDS.ELENA, amountPaid: 75 }],
    splitType: 'EXACT',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.ELENA],
    customValues: { [SEED_USER_IDS.SELF]: 40, [SEED_USER_IDS.ELENA]: 35 },
    daysAgo: 7,
    createdBy: SEED_USER_IDS.ELENA,
  },
  {
    id: 'exp-403',
    groupId: null,
    description: 'Coffee & Pastries',
    category: 'FOOD_AND_DRINK',
    amount: 23.4,
    paidBy: [{ userId: SEED_USER_IDS.PRIYA, amountPaid: 23.4 }],
    splitType: 'EQUAL',
    participantIds: [SEED_USER_IDS.SELF, SEED_USER_IDS.PRIYA],
    daysAgo: 1,
    createdBy: SEED_USER_IDS.PRIYA,
  },
  {
    id: 'settle-501',
    groupId: SEED_GROUP_IDS.APARTMENT,
    description: 'Settlement Payment',
    category: 'GENERAL',
    amount: 50,
    paidBy: [{ userId: SEED_USER_IDS.MARCUS, amountPaid: 50 }],
    splitType: 'EXACT',
    participantIds: [SEED_USER_IDS.SELF],
    customValues: { [SEED_USER_IDS.SELF]: 50 },
    daysAgo: 1,
    createdBy: SEED_USER_IDS.MARCUS,
    notes: 'Bank transfer to square up the internet bill.',
    isSettlement: true,
  },
];

function buildUsers(now: string): UserProfile[] {
  const base = { defaultCurrency: 'USD' as CurrencyCode, createdAt: now, updatedAt: now };
  return [
    {
      id: SEED_USER_IDS.SELF,
      name: 'Alex Rivera',
      email: 'alex.rivera@mintsplit.app',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      ...base,
    },
    {
      id: SEED_USER_IDS.SARAH,
      name: 'Sarah Chen',
      email: 'sarah.chen@mintsplit.app',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      ...base,
    },
    {
      id: SEED_USER_IDS.MARCUS,
      name: 'Marcus Vance',
      email: 'marcus.vance@mintsplit.app',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      ...base,
    },
    {
      id: SEED_USER_IDS.ELENA,
      name: 'Elena Rostova',
      email: 'elena.rostova@mintsplit.app',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
      ...base,
    },
    {
      id: SEED_USER_IDS.PRIYA,
      name: 'Priya Nair',
      email: 'priya.nair@mintsplit.app',
      avatarUrl: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=150',
      ...base,
    },
  ];
}

function buildGroups(now: string): Group[] {
  const member = (userId: UUID, role: 'ADMIN' | 'MEMBER'): Group['members'][number] => ({
    userId,
    joinedAt: now,
    role,
  });

  return [
    {
      id: SEED_GROUP_IDS.KYOTO,
      name: 'Kyoto Autumn Retreat',
      category: 'TRIP',
      description: 'Ryokan nights, rail passes, and a lot of kaiseki dinners.',
      currency: 'USD',
      avatarIcon: 'CompassOutlined',
      simplifyDebts: true,
      members: [
        member(SEED_USER_IDS.SELF, 'ADMIN'),
        member(SEED_USER_IDS.SARAH, 'MEMBER'),
        member(SEED_USER_IDS.MARCUS, 'MEMBER'),
        member(SEED_USER_IDS.ELENA, 'MEMBER'),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: SEED_GROUP_IDS.APARTMENT,
      name: 'Apt 4B Living',
      category: 'HOME',
      description: 'Rent, utilities, and the shared grocery run.',
      currency: 'USD',
      avatarIcon: 'HomeOutlined',
      simplifyDebts: true,
      members: [member(SEED_USER_IDS.SELF, 'ADMIN'), member(SEED_USER_IDS.MARCUS, 'MEMBER')],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: SEED_GROUP_IDS.CABIN,
      name: 'Sierra Cabin Weekend',
      category: 'OTHER',
      description: 'Snow, ski passes, and one very expensive firewood delivery.',
      currency: 'USD',
      avatarIcon: 'FireOutlined',
      simplifyDebts: false,
      members: [
        member(SEED_USER_IDS.SELF, 'ADMIN'),
        member(SEED_USER_IDS.SARAH, 'MEMBER'),
        member(SEED_USER_IDS.ELENA, 'MEMBER'),
        member(SEED_USER_IDS.PRIYA, 'MEMBER'),
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** Materialises a spec through the split engine and audits it in minor units. */
export function buildExpenseFromSpec(spec: SeedSpec, seedTimestamp: number): ExpenseItem | null {
  const currency: CurrencyCode = spec.currency ?? 'USD';
  const splitResult = computeSplits({
    totalAmount: spec.amount,
    splitType: spec.splitType,
    participantIds: spec.participantIds,
    customValues: spec.customValues,
    currency,
  });

  if (!splitResult.isValid) {
    console.error(
      `[MintSplit] Seed expense "${spec.description}" (${spec.id}) is invalid: ${splitResult.validationError}`
    );
    return null;
  }

  const paidMinorUnits = spec.paidBy.reduce(
    (total, payer) => total + toMinorUnits(payer.amountPaid, currency),
    0
  );
  const owedMinorUnits = splitResult.splits.reduce(
    (total, split) => total + toMinorUnits(split.owedAmount, currency),
    0
  );

  if (paidMinorUnits !== owedMinorUnits) {
    console.error(
      `[MintSplit] Seed expense "${spec.description}" (${spec.id}) does not balance: paid ${paidMinorUnits} vs owed ${owedMinorUnits} minor units.`
    );
    return null;
  }

  const date = new Date(seedTimestamp - spec.daysAgo * DAY_MS).toISOString();

  return {
    id: spec.id,
    groupId: spec.groupId,
    description: spec.description,
    category: spec.category,
    amount: spec.amount,
    currency,
    paidBy: spec.paidBy,
    splitType: spec.splitType,
    splits: splitResult.splits,
    date,
    notes: spec.notes,
    isSettlement: spec.isSettlement ?? false,
    createdBy: spec.createdBy,
    createdAt: date,
    updatedAt: date,
  };
}

function buildActivities(groups: Group[], expenses: ExpenseItem[]): ActivityLog[] {
  const groupActivities: ActivityLog[] = groups.map((group) => ({
    id: `act-group-${group.id}`,
    groupId: group.id,
    actorUserId: group.members[0]?.userId ?? SEED_USER_IDS.SELF,
    action: 'GROUP_CREATED',
    entityId: group.id,
    metadata: { description: group.name },
    timestamp: group.createdAt,
  }));

  const expenseActivities: ActivityLog[] = expenses.map((expense) => ({
    id: `act-${expense.id}`,
    groupId: expense.groupId ?? undefined,
    actorUserId: expense.createdBy,
    action: expense.isSettlement ? 'SETTLEMENT_RECORDED' : 'EXPENSE_CREATED',
    entityId: expense.id,
    metadata: {
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
    },
    timestamp: expense.date,
  }));

  return [...groupActivities, ...expenseActivities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/** Builds the complete demo dataset. Pure: no storage access, no side effects. */
export function buildSeedDataset(seedTimestamp: number = Date.now()): SeedDataset {
  const now = new Date(seedTimestamp).toISOString();
  const users = buildUsers(now);
  const groups = buildGroups(now);
  const expenses = SEED_EXPENSE_SPECS.map((spec) => buildExpenseFromSpec(spec, seedTimestamp)).filter(
    (expense): expense is ExpenseItem => expense !== null
  );
  const activities = buildActivities(groups, expenses);

  return { users, groups, expenses, activities };
}

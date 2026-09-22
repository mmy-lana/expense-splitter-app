import type {
  ActivityLog,
  CurrencyCode,
  ExpenseCategory,
  ExpenseItem,
  ExpensePayer,
  ExpenseSplitParticipant,
  Group,
  GroupCategory,
  ISODateString,
  SplitType,
  UserProfile,
} from '../types';
import { CURRENCY_CODES } from '../utils/currency';

/**
 * Ledger snapshot serialisation: JSON and CSV, pure and storage-free.
 *
 * Kept free of Dexie and DOM access on purpose. The download/upload plumbing
 * lives in `exportImport.ts`; everything that decides *what* a backup contains
 * lives here, so the round-trip contract (export -> parse -> restore) can be
 * verified directly in the test harness without a browser.
 *
 * Both formats are self-describing: a JSON snapshot carries a schema version, a
 * timestamp and row counts, and the CSV column contract is documented below.
 */

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_APP_ID = 'mintsplit-expense-splitter';

export interface LedgerSnapshot {
  app: typeof SNAPSHOT_APP_ID;
  version: number;
  timestamp: ISODateString;
  counts: {
    users: number;
    groups: number;
    expenses: number;
    activities: number;
  };
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  activities: ActivityLog[];
}

export interface ImportReport {
  /** Rows that were accepted and written. */
  imported: LedgerSnapshot['counts'];
  /** Rows that were rejected, with a reason each. */
  skipped: { entity: string; id: string; reason: string }[];
  /** True when the input parsed as a snapshot at all. */
  valid: boolean;
  error?: string;
}

export class LedgerImportError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'LedgerImportError';
    this.details = details;
  }
}

/* --------------------------------------------------------------- validation */

const CURRENCY_SET = new Set<string>(CURRENCY_CODES);

const SPLIT_TYPES: SplitType[] = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

const CATEGORIES: ExpenseCategory[] = [
  'FOOD_AND_DRINK',
  'TRANSPORTATION',
  'ENTERTAINMENT',
  'HOME_UTILITIES',
  'LODGING',
  'SERVICES',
  'GROCERIES',
  'GENERAL',
];

const GROUP_CATEGORIES: GroupCategory[] = ['TRIP', 'HOME', 'COUPLE', 'PROJECT', 'OTHER'];

const ACTIVITY_ACTIONS = [
  'EXPENSE_CREATED',
  'EXPENSE_UPDATED',
  'EXPENSE_DELETED',
  'SETTLEMENT_RECORDED',
  'GROUP_CREATED',
  'GROUP_UPDATED',
  'GROUP_DELETED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function asCurrency(value: unknown): CurrencyCode {
  return typeof value === 'string' && CURRENCY_SET.has(value) ? (value as CurrencyCode) : 'USD';
}

function asSplitType(value: unknown): SplitType {
  return typeof value === 'string' && (SPLIT_TYPES as string[]).includes(value)
    ? (value as SplitType)
    : 'EQUAL';
}

function asCategory(value: unknown): ExpenseCategory {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value)
    ? (value as ExpenseCategory)
    : 'GENERAL';
}

function asGroupCategory(value: unknown): GroupCategory {
  return typeof value === 'string' && (GROUP_CATEGORIES as string[]).includes(value)
    ? (value as GroupCategory)
    : 'OTHER';
}

function asActivityAction(value: unknown): ActivityLog['action'] {
  return typeof value === 'string' && (ACTIVITY_ACTIONS as readonly string[]).includes(value)
    ? (value as ActivityLog['action'])
    : 'EXPENSE_CREATED';
}

function parsePayers(value: unknown): ExpensePayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      userId: isNonEmptyString(entry.userId) ? entry.userId : '',
      amountPaid: isFiniteNumber(entry.amountPaid) ? entry.amountPaid : 0,
    }))
    .filter((payer) => payer.userId.length > 0 && payer.amountPaid >= 0);
}

function parseSplits(value: unknown): ExpenseSplitParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => {
      const split: ExpenseSplitParticipant = {
        userId: isNonEmptyString(entry.userId) ? entry.userId : '',
        owedAmount: isFiniteNumber(entry.owedAmount) ? entry.owedAmount : 0,
      };
      if (isFiniteNumber(entry.rawInput)) split.rawInput = entry.rawInput;
      if (isFiniteNumber(entry.percentage)) split.percentage = entry.percentage;
      if (isFiniteNumber(entry.shares)) split.shares = entry.shares;
      return split;
    })
    .filter((split) => split.userId.length > 0 && split.owedAmount >= 0);
}

function parseUsers(value: unknown): UserProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.name)) return [];
    const timestamp = isIsoDate(entry.createdAt) ? entry.createdAt : new Date().toISOString();
    return [
      {
        id: entry.id,
        name: entry.name,
        email: isNonEmptyString(entry.email) ? entry.email : '',
        avatarUrl: typeof entry.avatarUrl === 'string' ? entry.avatarUrl : '',
        defaultCurrency: asCurrency(entry.defaultCurrency),
        createdAt: timestamp,
        updatedAt: isIsoDate(entry.updatedAt) ? entry.updatedAt : timestamp,
      },
    ];
  });
}

function parseGroups(value: unknown): Group[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.name)) return [];
    const timestamp = isIsoDate(entry.createdAt) ? entry.createdAt : new Date().toISOString();
    const members = Array.isArray(entry.members)
      ? entry.members.filter(isRecord).flatMap((member) => {
          if (!isNonEmptyString(member.userId)) return [];
          return [
            {
              userId: member.userId,
              joinedAt: isIsoDate(member.joinedAt) ? member.joinedAt : timestamp,
              role: member.role === 'ADMIN' ? ('ADMIN' as const) : ('MEMBER' as const),
            },
          ];
        })
      : [];

    return [
      {
        id: entry.id,
        name: entry.name,
        category: asGroupCategory(entry.category),
        description: typeof entry.description === 'string' ? entry.description : '',
        currency: asCurrency(entry.currency),
        avatarIcon: isNonEmptyString(entry.avatarIcon) ? entry.avatarIcon : 'TeamOutlined',
        members,
        simplifyDebts: entry.simplifyDebts !== false,
        createdAt: timestamp,
        updatedAt: isIsoDate(entry.updatedAt) ? entry.updatedAt : timestamp,
      },
    ];
  });
}

function parseExpenses(value: unknown): ExpenseItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.description)) return [];

    const paidBy = parsePayers(entry.paidBy);
    const splits = parseSplits(entry.splits);
    if (paidBy.length === 0 || splits.length === 0) return [];

    const timestamp = isIsoDate(entry.date) ? entry.date : new Date().toISOString();
    const createdAt = isIsoDate(entry.createdAt) ? entry.createdAt : timestamp;

    return [
      {
        id: entry.id,
        groupId: isNonEmptyString(entry.groupId) ? entry.groupId : null,
        description: entry.description,
        category: asCategory(entry.category),
        amount: isFiniteNumber(entry.amount) ? Math.abs(entry.amount) : 0,
        currency: asCurrency(entry.currency),
        paidBy,
        splitType: asSplitType(entry.splitType),
        splits,
        date: timestamp,
        notes: typeof entry.notes === 'string' && entry.notes.length > 0 ? entry.notes : undefined,
        receiptDataUrl:
          typeof entry.receiptDataUrl === 'string' && entry.receiptDataUrl.length > 0
            ? entry.receiptDataUrl
            : undefined,
        isSettlement: entry.isSettlement === true,
        createdBy: isNonEmptyString(entry.createdBy) ? entry.createdBy : paidBy[0].userId,
        createdAt,
        updatedAt: isIsoDate(entry.updatedAt) ? entry.updatedAt : createdAt,
      },
    ];
  });
}

function parseActivities(value: unknown): ActivityLog[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.actorUserId)) return [];
    const metadata = isRecord(entry.metadata) ? entry.metadata : {};
    const parsed: ActivityLog['metadata'] = {};
    if (typeof metadata.description === 'string') parsed.description = metadata.description;
    if (isFiniteNumber(metadata.amount)) parsed.amount = metadata.amount;
    if (typeof metadata.currency === 'string' && CURRENCY_SET.has(metadata.currency)) {
      parsed.currency = metadata.currency as CurrencyCode;
    }
    if (typeof metadata.previousState === 'string') parsed.previousState = metadata.previousState;

    return [
      {
        id: entry.id,
        groupId: isNonEmptyString(entry.groupId) ? entry.groupId : undefined,
        actorUserId: entry.actorUserId,
        action: asActivityAction(entry.action),
        entityId: isNonEmptyString(entry.entityId) ? entry.entityId : entry.id,
        metadata: parsed,
        timestamp: isIsoDate(entry.timestamp) ? entry.timestamp : new Date().toISOString(),
      },
    ];
  });
}

/** Builds a snapshot from already-loaded rows. Pure: no storage access. */
export function createSnapshot(source: {
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  activities: ActivityLog[];
  timestamp?: ISODateString;
}): LedgerSnapshot {
  return {
    app: SNAPSHOT_APP_ID,
    version: SNAPSHOT_VERSION,
    timestamp: source.timestamp ?? new Date().toISOString(),
    counts: {
      users: source.users.length,
      groups: source.groups.length,
      expenses: source.expenses.length,
      activities: source.activities.length,
    },
    users: source.users,
    groups: source.groups,
    expenses: source.expenses,
    activities: source.activities,
  };
}

export function serializeSnapshot(snapshot: LedgerSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Parses and normalises a JSON backup.
 *
 * Tolerant by design: unknown fields are dropped, missing optional fields are
 * defaulted, and rows that cannot be repaired are skipped with a reason instead
 * of failing the whole restore. Only structurally impossible input throws.
 */
export function parseSnapshot(json: string): { snapshot: LedgerSnapshot; report: ImportReport } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new LedgerImportError('The file is not valid JSON.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  if (!isRecord(raw)) {
    throw new LedgerImportError('A backup must be a JSON object.');
  }

  const version = isFiniteNumber(raw.version) ? raw.version : SNAPSHOT_VERSION;
  if (version > SNAPSHOT_VERSION) {
    throw new LedgerImportError(
      `This backup was written by a newer version of MintSplit (v${version}); this build understands v${SNAPSHOT_VERSION}.`
    );
  }

  const users = parseUsers(raw.users);
  const groups = parseGroups(raw.groups);
  const expenses = parseExpenses(raw.expenses);
  const activities = parseActivities(raw.activities);

  const skipped: ImportReport['skipped'] = [];

  const rawExpenseCount = Array.isArray(raw.expenses) ? raw.expenses.length : 0;
  if (rawExpenseCount > expenses.length) {
    skipped.push({
      entity: 'expense',
      id: '*',
      reason: `${rawExpenseCount - expenses.length} expense row(s) were missing an id, description, payer or split.`,
    });
  }

  const knownUserIds = new Set(users.map((user) => user.id));
  const orphanExpenses = expenses.filter(
    (expense) =>
      !knownUserIds.has(expense.createdBy) ||
      expense.paidBy.some((payer) => !knownUserIds.has(payer.userId)) ||
      expense.splits.some((split) => !knownUserIds.has(split.userId))
  );
  for (const expense of orphanExpenses) {
    skipped.push({
      entity: 'expense',
      id: expense.id,
      reason: 'references a user that is not present in this backup.',
    });
  }

  const acceptedExpenseIds = new Set(
    expenses.filter((expense) => !orphanExpenses.includes(expense)).map((expense) => expense.id)
  );
  const acceptedExpenses = expenses.filter((expense) => acceptedExpenseIds.has(expense.id));

  return {
    snapshot: createSnapshot({
      users,
      groups,
      expenses: acceptedExpenses,
      activities,
      timestamp: isIsoDate(raw.timestamp) ? raw.timestamp : new Date().toISOString(),
    }),
    report: {
      valid: true,
      imported: {
        users: users.length,
        groups: groups.length,
        expenses: acceptedExpenses.length,
        activities: activities.length,
      },
      skipped,
    },
  };
}

/* ---------------------------------------------------------------------- csv */

/**
 * CSV column contract.
 *
 * `paidBy` and `splits` are encoded as `userId:amount` pairs joined by `|`,
 * which keeps real multi-payer expenses lossless through a spreadsheet round
 * trip. `receiptDataUrl` is intentionally excluded: base64 image payloads would
 * bloat a CSV beyond spreadsheet limits. Use the JSON backup for a full-fidelity
 * copy, and CSV for analysis.
 */
export const CSV_COLUMNS = [
  'id',
  'date',
  'description',
  'category',
  'amount',
  'currency',
  'groupId',
  'splitType',
  'paidBy',
  'splits',
  'isSettlement',
  'createdBy',
  'notes',
] as const;

const PAIR_SEPARATOR = '|';
const PAIR_DELIMITER = ':';

/** RFC 4180 quoting: wrap when the value contains a comma, quote or newline. */
export function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function encodePairs(entries: { userId: string; amount: number }[]): string {
  return entries
    .map((entry) => `${entry.userId}${PAIR_DELIMITER}${entry.amount}`)
    .join(PAIR_SEPARATOR);
}

function decodePairs(value: string): { userId: string; amount: number }[] {
  if (value.trim().length === 0) return [];
  return value
    .split(PAIR_SEPARATOR)
    .map((pair) => {
      const separatorIndex = pair.lastIndexOf(PAIR_DELIMITER);
      if (separatorIndex <= 0) return null;
      const userId = pair.slice(0, separatorIndex).trim();
      const amount = Number.parseFloat(pair.slice(separatorIndex + 1));
      if (userId.length === 0 || !Number.isFinite(amount)) return null;
      return { userId, amount };
    })
    .filter((entry): entry is { userId: string; amount: number } => entry !== null);
}

export function serializeExpensesToCsv(expenses: ExpenseItem[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = expenses.map((expense) =>
    [
      expense.id,
      expense.date,
      expense.description,
      expense.category,
      String(expense.amount),
      expense.currency,
      expense.groupId ?? '',
      expense.splitType,
      encodePairs(expense.paidBy.map((p) => ({ userId: p.userId, amount: p.amountPaid }))),
      encodePairs(expense.splits.map((s) => ({ userId: s.userId, amount: s.owedAmount }))),
      String(expense.isSettlement),
      expense.createdBy,
      (expense.notes ?? '').replace(/\r?\n/g, ' '),
    ]
      .map((value) => escapeCsvValue(value))
      .join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Parses RFC 4180 CSV into rows of cells.
 *
 * Handles quoted fields containing commas, escaped double quotes and embedded
 * newlines — the cases a naive `split(',')` gets wrong and which a spreadsheet
 * will absolutely produce.
 */
export function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];

    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

export function parseExpensesFromCsv(csv: string): { expenses: ExpenseItem[]; report: ImportReport } {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) {
    throw new LedgerImportError('The CSV file is empty.');
  }

  const header = rows[0].map((cell) => cell.trim());
  const missing = ['id', 'date', 'description', 'amount', 'paidBy', 'splits'].filter(
    (column) => !header.includes(column)
  );
  if (missing.length > 0) {
    throw new LedgerImportError(
      `The CSV is missing required column(s): ${missing.join(', ')}.`,
      [`Found columns: ${header.join(', ')}`]
    );
  }

  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const cell = (row: string[], name: string): string => {
    const index = columnIndex.get(name);
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  const skipped: ImportReport['skipped'] = [];
  const expenses: ExpenseItem[] = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const id = cell(row, 'id');
    const description = cell(row, 'description');
    const amount = Number.parseFloat(cell(row, 'amount'));
    const paidBy = decodePairs(cell(row, 'paidBy'));
    const splitPairs = decodePairs(cell(row, 'splits'));

    if (id.length === 0 || description.length === 0 || !Number.isFinite(amount)) {
      skipped.push({ entity: 'expense', id: id || `row ${index + 1}`, reason: 'missing id, description or amount.' });
      continue;
    }
    if (paidBy.length === 0 || splitPairs.length === 0) {
      skipped.push({ entity: 'expense', id, reason: 'missing payer or split information.' });
      continue;
    }

    const dateValue = cell(row, 'date');
    const date = Number.isNaN(new Date(dateValue).getTime())
      ? new Date().toISOString()
      : new Date(dateValue).toISOString();

    expenses.push({
      id,
      groupId: cell(row, 'groupId') || null,
      description,
      category: asCategory(cell(row, 'category')),
      amount: Math.abs(amount),
      currency: asCurrency(cell(row, 'currency')),
      paidBy: paidBy.map((entry) => ({ userId: entry.userId, amountPaid: entry.amount })),
      splitType: asSplitType(cell(row, 'splitType')),
      splits: splitPairs.map((entry) => ({ userId: entry.userId, owedAmount: entry.amount })),
      date,
      notes: cell(row, 'notes') || undefined,
      isSettlement: cell(row, 'isSettlement').toLowerCase() === 'true',
      createdBy: cell(row, 'createdBy') || paidBy[0].userId,
      createdAt: date,
      updatedAt: date,
    });
  }

  return {
    expenses,
    report: {
      valid: true,
      imported: { users: 0, groups: 0, expenses: expenses.length, activities: 0 },
      skipped,
    },
  };
}

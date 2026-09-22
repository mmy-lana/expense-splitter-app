/**
 * Canonical domain schema for the MintSplit expense splitter.
 *
 * Every monetary value stored in the database is expressed in *major* units
 * (e.g. `25.5` for $25.50) and is always produced by the BigNumber powered
 * engines in `src/utils` so that no binary floating point drift can leak into
 * the ledger. Minor-unit (penny) conversion happens exclusively through the
 * helpers exported by `src/utils/currency.ts`.
 */

export type UUID = string;

/** ISO-8601 timestamp, e.g. `2026-09-22T07:38:35.000Z`. */
export type ISODateString = string;

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'INR' | 'SGD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  /** Number of minor-unit digits (2 for USD, 0 for JPY). */
  decimals: number;
  /** Static offline exchange rate relative to the USD base currency. */
  exchangeRateToBase: number;
}

export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';

export type ExpenseCategory =
  | 'FOOD_AND_DRINK'
  | 'TRANSPORTATION'
  | 'ENTERTAINMENT'
  | 'HOME_UTILITIES'
  | 'LODGING'
  | 'SERVICES'
  | 'GROCERIES'
  | 'GENERAL';

export type GroupCategory = 'TRIP' | 'HOME' | 'COUPLE' | 'PROJECT' | 'OTHER';

export type MemberRole = 'ADMIN' | 'MEMBER';

export type ActivityAction =
  | 'EXPENSE_CREATED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_DELETED'
  | 'SETTLEMENT_RECORDED'
  | 'GROUP_CREATED'
  | 'GROUP_UPDATED'
  | 'GROUP_DELETED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED';

export interface UserProfile {
  id: UUID;
  name: string;
  email: string;
  avatarUrl: string;
  defaultCurrency: CurrencyCode;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface GroupMember {
  userId: UUID;
  joinedAt: ISODateString;
  role: MemberRole;
}

export interface Group {
  id: UUID;
  name: string;
  category: GroupCategory;
  description: string;
  currency: CurrencyCode;
  avatarIcon: string;
  members: GroupMember[];
  simplifyDebts: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ExpensePayer {
  userId: UUID;
  /** Amount this user actually fronted, in major units. */
  amountPaid: number;
}

export interface ExpenseSplitParticipant {
  userId: UUID;
  /** Absolute calculated monetary debt for this participant, in major units. */
  owedAmount: number;
  /** Raw user input (exact amount, percentage, or share count). */
  rawInput?: number;
  percentage?: number;
  shares?: number;
}

export interface ExpenseItem {
  id: UUID;
  /** `null` represents a direct peer-to-peer friend expense. */
  groupId: UUID | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  /** Supports multiple fractional payers. */
  paidBy: ExpensePayer[];
  splitType: SplitType;
  splits: ExpenseSplitParticipant[];
  date: ISODateString;
  notes?: string;
  /** Optional downsampled image data URL for receipt capture. */
  receiptDataUrl?: string;
  /** `true` when this row is an explicit debt payoff transaction. */
  isSettlement: boolean;
  createdBy: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DebtTransfer {
  fromUserId: UUID;
  toUserId: UUID;
  amount: number;
  currency: CurrencyCode;
}

export interface MemberBalanceSummary {
  userId: UUID;
  /** Positive = the user is owed money, negative = the user owes money. */
  netBalance: number;
  totalPaid: number;
  totalOwed: number;
}

export interface ActivityLog {
  id: UUID;
  groupId?: UUID;
  actorUserId: UUID;
  action: ActivityAction;
  entityId: UUID;
  metadata: {
    description?: string;
    amount?: number;
    currency?: CurrencyCode;
    /** Serialized snapshot for the audit trail. */
    previousState?: string;
  };
  timestamp: ISODateString;
}

/** A user profile indexed by id, as consumed by the presentational layers. */
export type UserProfileMap = Map<UUID, UserProfile>;

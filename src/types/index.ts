export type UUID = string;
export type ISODateString = string;
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'INR' | 'SGD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  decimals: number;
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
  role: 'ADMIN' | 'MEMBER';
}

export interface Group {
  id: UUID;
  name: string;
  category: 'TRIP' | 'HOME' | 'COUPLE' | 'PROJECT' | 'OTHER';
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
  amountPaid: number;
}

export interface ExpenseSplitParticipant {
  userId: UUID;
  owedAmount: number;
  rawInput?: number;
  percentage?: number;
  shares?: number;
}

export interface ExpenseItem {
  id: UUID;
  groupId: UUID | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  paidBy: ExpensePayer[];
  splitType: SplitType;
  splits: ExpenseSplitParticipant[];
  date: ISODateString;
  notes?: string;
  receiptDataUrl?: string;
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

export interface ActivityLog {
  id: UUID;
  groupId?: UUID;
  actorUserId: UUID;
  action:
    | 'EXPENSE_CREATED'
    | 'EXPENSE_UPDATED'
    | 'EXPENSE_DELETED'
    | 'SETTLEMENT_RECORDED'
    | 'GROUP_CREATED'
    | 'MEMBER_ADDED'
    | 'MEMBER_REMOVED'
    | 'GROUP_DELETED';
  entityId: UUID;
  metadata: {
    description?: string;
    amount?: number;
    currency?: CurrencyCode;
    previousState?: string;
  };
  timestamp: ISODateString;
}

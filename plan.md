# Architectural Specification & Implementation Blueprint: Expense Splitter App (`plan.md`)

---

## 1. Executive Architecture & Tech Stack Matrix

```
+---------------------------------------------------------------------------------------+
|                                    PRESENTATION LAYER                                 |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  | Responsive Shell   |  | Split Form Engine    |  | Settlement & Graph Visualizer |  |
|  | (Mobile/Tab/Desk)  |  | (Equal/Exact/%/Share)|  | (Greedy Min-Cash-Flow)        |  |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  Ant Design v5.24+ (ConfigProvider Token System + CSS-in-JS + Mint Theme Overrides)   |
+---------------------------------------------------------------------------------------+
|                                  STATE & DOMAIN LOGIC                                 |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  | Zustand Global     |  | Penny-Rounding Split |  | Simplified Debt Graph Engine  |  |
|  | Store (Reactive)   |  | Multi-Payer Engine   |  | Net Balances Vector Math      |  |
|  +--------------------+  +----------------------+  +-------------------------------+  |
+---------------------------------------------------------------------------------------+
|                                  PERSISTENCE LAYER                                    |
|  +---------------------------------------------------------------------------------+  |
|  | Dexie.js v4.0+ (IndexedDB Object Stores: users, groups, expenses, activities)  |  |
|  | LocalStorage (Fallback / Active Session Meta / Preferences)                     |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
```

### +---------------------------------------------------------------------------------------+
|                                    PRESENTATION LAYER                                 |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  | Responsive Shell   |  | Split Form Engine    |  | Settlement & Graph Visualizer |  |
|  | (Mobile/Tab/Desk)  |  | (Equal/Exact/%/Share)|  | (Greedy Min-Cash-Flow)        |  |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  Ant Design latest (ConfigProvider Token System + CSS-in-JS + Mint Theme Overrides)  |
+---------------------------------------------------------------------------------------+
|                                  STATE & DOMAIN LOGIC                                 |
|  +--------------------+  +----------------------+  +-------------------------------+  |
|  | Zustand Global     |  | Penny-Rounding Split |  | Simplified Debt Graph Engine  |  |
|  | Store (Reactive)   |  | Multi-Payer Engine   |  | Net Balances Vector Math      |  |
|  +--------------------+  +----------------------+  +-------------------------------+  |
+---------------------------------------------------------------------------------------+
|                                  PERSISTENCE LAYER                                    |
|  +---------------------------------------------------------------------------------+  |
|  | Dexie.js latest (IndexedDB Object Stores: users, groups, expenses, activities)   |  |
|  | LocalStorage (Fallback / Active Session Meta / Preferences)                     |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
```

### Dependency Matrix
| Package | Version | Justification |
| :--- | :--- | :--- |
| `react` / `react-dom` | `latest` | Idiomatic modern UI runtime with concurrent transitions and compiler readiness. |
| `antd` | `latest` | Ant Design component primitives, token-based design system, dynamic theming. |
| `@ant-design/icons` | `latest` | Standardized icon library matching Ant Design visual weight. |
| `dexie` / `dexie-react-hooks` | `latest` | Robust IndexedDB transactional storage supporting offline ACID transactions & live queries. |
| `zustand` | `latest` | High-performance, un-opinionated transient state manager with zero boilerplate. |
| `dayjs` | `latest` | Lightweight immutable date manipulation integrated natively with Ant Design DatePicker. |
| `bignumber.js` | `latest` | Arbitrary-precision decimal arithmetic to guarantee zero floating-point penny leaks. |
| `canvas-confetti` | `latest` | Micro-reward visual celebration triggered upon complete debt settlement. |
| `clsx` | `latest` | Class composition for responsive overrides. | Matrix

### package.json
{
  "name": "expense-splitter-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "latest",
    "antd": "latest",
    "bignumber.js": "latest",
    "canvas-confetti": "latest",
    "clsx": "latest",
    "dayjs": "latest",
    "dexie": "latest",
    "dexie-react-hooks": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zustand": "latest"
  },
  "devDependencies": {
    "@types/canvas-confetti": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "vite": "latest"
  }
}

---

## 2. Design Foundation: "Clean Finance & Soft Mint"

### 2.1 Color Palette & Design Tokens
*   **Mint Primary (`#00A86B`)**: Pure mint emerald indicating credit, wealth, and primary actions.
*   **Mint Tint 50 (`#F0FDF7`)**: Canvas surface background for card containers and elevated panels.
*   **Mint Tint 100 (`#DCFCE7`)**: Soft hover states, badge accents, and paid-status backgrounds.
*   **Mint Dark 700 (`#047857`)**: High-contrast typography for primary labels on light mint backgrounds.
*   **Debt Crimson (`#E11D48`)**: High-legibility red for negative balances ("You owe").
*   **Credit Jade (`#059669`)**: Balanced emerald for positive balances ("You are owed").
*   **Slate Dark (`#0F172A`)**: Primary text color (WCAG AAA compliant on white surfaces).
*   **Slate Muted (`#64748B`)**: Secondary subtitles, timestamps, and placeholder copy.
*   **Slate Border (`#E2E8F0`)**: Card borders, table dividers, and structural strokes.

### 2.2 Ant Design Token Theme Specification

```typescript
import type { ThemeConfig } from 'antd';

export const cleanFinanceMintTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00A86B',
    colorInfo: '#00A86B',
    colorSuccess: '#059669',
    colorWarning: '#F59E0B',
    colorError: '#E11D48',
    colorTextBase: '#0F172A',
    colorBgBase: '#FFFFFF',
    colorBgLayout: '#F8FAFC',
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
    boxShadowSecondary: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    controlHeight: 38,
    controlHeightLG: 46,
    controlHeightSM: 30,
  },
  components: {
    Button: {
      fontWeight: 600,
      controlHeight: 38,
      primaryShadow: '0 2px 4px 0 rgba(0, 168, 107, 0.25)',
    },
    Card: {
      paddingLG: 20,
      colorBorderSecondary: '#EDF2F7',
    },
    Table: {
      headerBg: '#F0FDF7',
      headerColor: '#047857',
      rowHoverBg: '#F8FAFC',
    },
    Tabs: {
      itemSelectedColor: '#00A86B',
      itemHoverColor: '#059669',
      inkBarColor: '#00A86B',
    },
    Modal: {
      borderRadiusLG: 16,
    },
  },
};
```

### 2.3 Viewport Validation Breakpoints
*   **Mobile Small (360px)**: Single-column stacked cards, full-width buttons, collapsible sticky bottom navigation bar, modal converts to bottom drawer (`height: 90vh`).
*   **Mobile Standard (390px - 430px)**: Optimized touch targets (minimum 44px), sticky bottom expense trigger, simplified table rows with secondary metadata truncated.
*   **Tablet (768px)**: 2-column dashboard layout (Balances Sidebar + Group Activity stream), modals centered.
*   **Desktop (1024px - 1440px+)**: 3-column architecture (Left: Groups/Friends Nav; Center: Expense Ledger & Action Bar; Right: Debt Graph, Settle Wizard, and Group Analytics).

---

## 3. Data Schema & Pure TypeScript Interfaces

```typescript
export type UUID = string;
export type ISODateString = string;
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'INR' | 'SGD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  decimals: number;
  exchangeRateToBase: number; // Base: USD
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
  amountPaid: number; // Stored in major units (e.g., 25.50), verified with BigNumber
}

export interface ExpenseSplitParticipant {
  userId: UUID;
  owedAmount: number;     // Absolute calculated monetary debt
  rawInput?: number;      // Store user input (e.g., 50% or 2 shares or 15.00 exact)
  percentage?: number;    // SplitType === 'PERCENT'
  shares?: number;        // SplitType === 'SHARES'
}

export interface ExpenseItem {
  id: UUID;
  groupId: UUID | null;   // null represents a direct peer-to-peer friend expense
  description: string;
  category: ExpenseCategory;
  amount: number;         // Total expense amount
  currency: CurrencyCode;
  paidBy: ExpensePayer[]; // Supports multiple payers
  splitType: SplitType;
  splits: ExpenseSplitParticipant[];
  date: ISODateString;
  notes?: string;
  receiptDataUrl?: string; // Optional image base64 data for receipt capture
  isSettlement: boolean;   // True if this is an explicit debt payoff transaction
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
  netBalance: number;     // Positive = owed money, Negative = owes money
  totalPaid: number;
  totalOwed: number;
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
    | 'MEMBER_ADDED';
  entityId: UUID;
  metadata: {
    description?: string;
    amount?: number;
    currency?: CurrencyCode;
    previousState?: string; // Serialized snapshot for audit trail
  };
  timestamp: ISODateString;
}
```

---

## 4. Core Feature Logic & Mathematical Algorithms

### 4.1 Optimal Debt Simplification Engine (Greedy Minimum Cash Flow Graph)
In an un-simplified ledger with $N$ people, up to $N(N-1)/2$ directional debts exist. This algorithm solves the minimum transaction matrix down to at most $N-1$ settlement transfers using high-precision BigNumber arithmetic to prevent float accumulation error.

```typescript
import BigNumber from 'bignumber.js';

export function calculateSimplifiedDebts(
  memberIds: UUID[],
  expenses: ExpenseItem[],
  currency: CurrencyCode
): DebtTransfer[] {
  // 1. Calculate net balance vector for every user
  const balanceMap = new Map<UUID, BigNumber>();
  for (const id of memberIds) {
    balanceMap.set(id, new BigNumber(0));
  }

  for (const expense of expenses) {
    // Only tally matching currency (multi-currency groups are partitioned by currency)
    if (expense.currency !== currency) continue;

    // Credit payers
    for (const payer of expense.paidBy) {
      const current = balanceMap.get(payer.userId) ?? new BigNumber(0);
      balanceMap.set(payer.userId, current.plus(new BigNumber(payer.amountPaid)));
    }

    // Debit split participants
    for (const split of expense.splits) {
      const current = balanceMap.get(split.userId) ?? new BigNumber(0);
      balanceMap.set(split.userId, current.minus(new BigNumber(split.owedAmount)));
    }
  }

  // 2. Separate into Creditors (+) and Debtors (-)
  interface BalanceNode {
    userId: UUID;
    balance: BigNumber;
  }

  const creditors: BalanceNode[] = [];
  const debtors: BalanceNode[] = [];
  const ZERO = new BigNumber(0.005); // Fractional penny epsilon

  balanceMap.forEach((balance, userId) => {
    if (balance.isGreaterThan(ZERO)) {
      creditors.push({ userId, balance });
    } else if (balance.isLessThan(ZERO.negated())) {
      debtors.push({ userId, balance: balance.abs() });
    }
  });

  // Sort descending by magnitude to prioritize settling largest debts first
  creditors.sort((a, b) => b.balance.comparedTo(a.balance));
  debtors.sort((a, b) => b.balance.comparedTo(a.balance));

  const transfers: DebtTransfer[] = [];
  let cIndex = 0;
  let dIndex = 0;

  // 3. Greedy reconciliation loop
  while (cIndex < creditors.length && dIndex < debtors.length) {
    const creditor = creditors[cIndex];
    const debtor = debtors[dIndex];

    // Transaction amount is min(creditor balance, debtor balance)
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
```

### 4.2 Split Calculator Engine with Penny-Rounding Resolution
Floating point division ($100 / 3 = 33.333...$) creates cent leaks. This engine calculates penny-perfect splits where the sum of calculated splits equals total expense to the exact cent, assigning residual remainder pennies sequentially.

```typescript
export interface CalculateSplitInput {
  totalAmount: number;
  splitType: SplitType;
  participantIds: UUID[];
  customValues?: Record<UUID, number>; // exact values, percentages, or shares
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
          validationError: `Exact amounts total ${new BigNumber(sumEnteredCents / 100).toFixed(2)}, which does not match total expense ${new BigNumber(totalAmount).toFixed(2)}. Difference: ${new BigNumber(diff / 100).toFixed(2)}`,
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
          validationError: `Percentages must add up to exactly 100%. Current sum: ${sumPct.toFixed(2)}%`,
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
```

---

## 5. Storage Layer: IndexedDB Architecture via Dexie.js

```typescript
import Dexie, { type Table } from 'dexie';

export class SplitwiseDatabase extends Dexie {
  users!: Table<UserProfile, string>;
  groups!: Table<Group, string>;
  expenses!: Table<ExpenseItem, string>;
  activities!: Table<ActivityLog, string>;

  constructor() {
    super('SplitwiseCloneDB');
    this.version(1).stores({
      users: 'id, email, name, createdAt',
      groups: 'id, name, category, updatedAt',
      expenses: 'id, groupId, category, date, isSettlement, createdBy, createdAt',
      activities: 'id, groupId, entityId, actorUserId, timestamp',
    });
  }
}

export const db = new SplitwiseDatabase();
```

---

## 6. Component Hierarchy & Atomic Architecture

```
src/
├── app/
│   ├── App.tsx                     # Top-level ConfigProvider, App Shell, Layout wrapper
│   └── routes.tsx                  # Tab/Route view controller
├── components/
│   ├── atoms/
│   │   ├── MintBadge.tsx           # Rounded currency badge with dynamic credit/debit tint
│   │   ├── CurrencyDisplay.tsx     # Tabular numeral formatter with colored sign indication
│   │   ├── UserAvatar.tsx          # Antd Avatar with fallback colored initials & tooltip
│   │   └── CategoryIcon.tsx        # Styled categorical icon glyph with soft mint container
│   ├── molecules/
│   │   ├── MemberBalanceCard.tsx   # Individual friend balance tile with "Settle" action
│   │   ├── ExpenseRowItem.tsx      # Ledger entry with date, payer, split tag, and touch options
│   │   ├── MultiPayerInput.tsx     # Dynamic multi-user payer distribution input
│   │   └── SearchFilterBar.tsx     # Debounced search + category filter + sorting bar
│   ├── organisms/
│   │   ├── ExpenseFormModal.tsx    # Responsive Modal/Drawer hybrid for expense creation
│   │   ├── DebtSimplificationCard.tsx # Visualized minimal cash-flow settlement matrix
│   │   ├── SettlementWizard.tsx    # Step-by-step payoff executor with receipt confirmation
│   │   ├── GroupLedgerTable.tsx    # Antd Table / List view with pagination & inline actions
│   │   └── GroupAnalytics.tsx      # Spending by category, cumulative burn, payer ratios
│   └── templates/
│       ├── ResponsiveAppShell.tsx  # Desktop 3-column + Mobile bottom nav + header bar
│       ├── DashboardView.tsx       # Overall aggregate balances, friend summaries, quick settle
│       ├── GroupDetailView.tsx     # Detailed ledger for a specific group
│       └── FriendsDetailView.tsx   # Direct 1-on-1 balances and shared expense history
├── stores/
│   ├── useAppStore.ts              # Current active user, active group, UI modals state
│   └── useFilterStore.ts           # Search text, category filters, date range filters
├── services/
│   ├── dbSeed.ts                   # Initial realistic sample dataset generator
│   ├── exportImport.ts             # JSON / CSV export and snapshot restoration engine
│   └── receiptOcr.ts               # Local receipt parser stub & image downsampler
└── utils/
    ├── currency.ts                 # ISO formatting, symbol resolution, BigNumber helpers
    └── debtEngine.ts               # Minimum cash flow and split algorithms
```

---

## 7. 5-Phase Sequential Implementation Queue

```
========================================================================================
PHASE 1: Core Foundation, Persistence & Mathematical Engine
========================================================================================
- Setup Dexie.js Schema and transactional tables
- Write complete TypeScript definitions (`src/types/index.ts`)
- Implement Minimum Cash Flow solver (`src/utils/debtEngine.ts`) with unit-level safety
- Implement Split Calculator Engine (`src/utils/splitEngine.ts`) with penny rounding
- Create Seed Engine (`src/services/dbSeed.ts`) with initial users, groups, and expenses
Deliverables: Fully verifiable offline persistence layer and mathematical core.

========================================================================================
PHASE 2: Design System, Ant Design Tokens & UI Primitives (Atoms)
========================================================================================
- Configure Ant Design `ConfigProvider` with Mint Palette tokens
- Implement `CurrencyDisplay` component with tabular monospace layout
- Implement `UserAvatar` with dynamic background hashing and status badge
- Implement `CategoryIcon` with category-to-color mapping
- Implement `MintBadge` supporting both positive credit, zero, and negative debit states
Deliverables: Atomic component library adhering to 360px-to-1440px responsive rules.

========================================================================================
PHASE 3: Compound Molecules & Dynamic Input Modules
========================================================================================
- Implement `ExpenseRowItem` with mobile swipe-friendly actions & desktop popconfirm
- Implement `MultiPayerInput` supporting single or multiple fractional payers
- Implement `SplitTypeSelector` supporting EQUAL, EXACT, PERCENT, and SHARES
- Implement `SearchFilterBar` with category dropdown and debounce input
Deliverables: Interactive forms and composite inputs ready for data binding.

========================================================================================
PHASE 4: Organisms, Reactive State & Feature Engines
========================================================================================
- Construct `ExpenseFormModal` with auto-switching Modal (desktop) / Bottom Drawer (mobile)
- Build `DebtSimplificationCard` rendering the transfer suggestions
- Build `SettlementWizard` with one-click payoff, confetti celebration, and balance zeroing
- Implement Zustand stores (`useAppStore`, `useFilterStore`) with Dexie live reactivity
- Implement JSON and CSV data import/export utilities
Deliverables: Complete domain workflows functional in isolation.

========================================================================================
PHASE 5: Full Assembly, Responsive Shell & Quality Assurance
========================================================================================
- Assemble `ResponsiveAppShell` with Sticky Mobile Footer and Desktop Sidebar
- Build `DashboardView`, `GroupDetailView`, `FriendsDetailView`, and `ActivityFeedView`
- Add receipt image upload with client-side canvas downsampling (max 800px, 80% JPEG)
- Validate touch-target constraints and verify across 360px, 390px, 768px, and 1280px
- Zero console errors, zero layout shifts, zero unhandled decimal division bugs
Deliverables: Production-ready Expense Splitter App ready for deployment.
```

---

## 8. Concrete Phase Implementations & Source Contracts

### Phase 1: Storage Layer, Schemas & Core Utilities

#### File: `src/types/index.ts`
*(Contains the complete pure TypeScript interfaces specified in Section 3).*

#### File: `src/utils/currency.ts`
```typescript
import BigNumber from 'bignumber.js';
import type { CurrencyCode } from '../types';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'AU$',
  INR: '₹',
  SGD: 'SG$',
};

export function formatMoney(amount: number, currency: CurrencyCode = 'USD'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  const bn = new BigNumber(amount);
  const isNegative = bn.isLessThan(0);
  const absoluteValue = bn.abs().toFixed(currency === 'JPY' ? 0 : 2);
  
  return `${isNegative ? '-' : ''}${symbol}${absoluteValue}`;
}

export function parseMonetaryInput(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = val.replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
```

#### File: `src/services/dbSeed.ts`
```typescript
import { db } from './db';
import type { UserProfile, Group, ExpenseItem, ActivityLog } from '../types';

export async function seedInitialDataIfEmpty(): Promise<void> {
  const userCount = await db.users.count();
  if (userCount > 0) return;

  const now = new Date().toISOString();

  const primaryUser: UserProfile = {
    id: 'user-self',
    name: 'Alex Rivera (You)',
    email: 'alex@cleanfinance.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend1: UserProfile = {
    id: 'user-sarah',
    name: 'Sarah Chen',
    email: 'sarah.c@cleanfinance.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend2: UserProfile = {
    id: 'user-marcus',
    name: 'Marcus Vance',
    email: 'marcus.v@cleanfinance.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend3: UserProfile = {
    id: 'user-elena',
    name: 'Elena Rostova',
    email: 'elena.r@cleanfinance.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  await db.users.bulkAdd([primaryUser, friend1, friend2, friend3]);

  const groupTrip: Group = {
    id: 'group-kyoto',
    name: 'Kyoto Autumn Retreat',
    category: 'TRIP',
    description: 'Ryokan, Shinkansen, and Michelin dinners',
    currency: 'USD',
    avatarIcon: 'CompassOutlined',
    simplifyDebts: true,
    members: [
      { userId: 'user-self', joinedAt: now, role: 'ADMIN' },
      { userId: 'user-sarah', joinedAt: now, role: 'MEMBER' },
      { userId: 'user-marcus', joinedAt: now, role: 'MEMBER' },
      { userId: 'user-elena', joinedAt: now, role: 'MEMBER' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const groupApt: Group = {
    id: 'group-apartment',
    name: 'Apt 4B Living',
    category: 'HOME',
    description: 'Shared rent, Wi-Fi, electricity, groceries',
    currency: 'USD',
    avatarIcon: 'HomeOutlined',
    simplifyDebts: true,
    members: [
      { userId: 'user-self', joinedAt: now, role: 'ADMIN' },
      { userId: 'user-marcus', joinedAt: now, role: 'MEMBER' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await db.groups.bulkAdd([groupTrip, groupApt]);

  // Seed Realistic Expenses
  const exp1: ExpenseItem = {
    id: 'exp-101',
    groupId: 'group-kyoto',
    description: 'Traditional Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 320.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-self', amountPaid: 320.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 80.0 },
      { userId: 'user-sarah', owedAmount: 80.0 },
      { userId: 'user-marcus', owedAmount: 80.0 },
      { userId: 'user-elena', owedAmount: 80.0 },
    ],
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    notes: 'Paid via Amex Platinum. Gratuity included.',
    isSettlement: false,
    createdBy: 'user-self',
    createdAt: now,
    updatedAt: now,
  };

  const exp2: ExpenseItem = {
    id: 'exp-102',
    groupId: 'group-kyoto',
    description: 'Bullet Train Passes (JR East)',
    category: 'TRANSPORTATION',
    amount: 480.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-sarah', amountPaid: 480.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 120.0 },
      { userId: 'user-sarah', owedAmount: 120.0 },
      { userId: 'user-marcus', owedAmount: 120.0 },
      { userId: 'user-elena', owedAmount: 120.0 },
    ],
    date: new Date(Date.now() - 86400000).toISOString(),
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: now,
    updatedAt: now,
  };

  const exp3: ExpenseItem = {
    id: 'exp-103',
    groupId: 'group-apartment',
    description: 'Fiber Gigabit Internet',
    category: 'HOME_UTILITIES',
    amount: 85.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-marcus', amountPaid: 85.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 42.5 },
      { userId: 'user-marcus', owedAmount: 42.5 },
    ],
    date: new Date().toISOString(),
    isSettlement: false,
    createdBy: 'user-marcus',
    createdAt: now,
    updatedAt: now,
  };

  await db.expenses.bulkAdd([exp1, exp2, exp3]);

  const activity1: ActivityLog = {
    id: 'act-1',
    groupId: 'group-kyoto',
    actorUserId: 'user-self',
    action: 'EXPENSE_CREATED',
    entityId: 'exp-101',
    metadata: { description: 'Traditional Kaiseki Dinner', amount: 320.0, currency: 'USD' },
    timestamp: now,
  };

  await db.activities.bulkAdd([activity1]);
}
```

---

### Phase 2: Design Foundation & Atomic UI Primitives

#### File: `src/components/atoms/CurrencyDisplay.tsx`
```typescript
import React from 'react';
import { Typography } from 'antd';
import { formatMoney } from '../../utils/currency';
import type { CurrencyCode } from '../../types';

interface CurrencyDisplayProps {
  amount: number;
  currency?: CurrencyCode;
  colored?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  colored = false,
  size = 'md',
  showSign = false,
}) => {
  const isPositive = amount > 0.005;
  const isNegative = amount < -0.005;

  let colorStyle = '#0F172A';
  if (colored) {
    if (isPositive) colorStyle = '#059669'; // Credit Jade
    else if (isNegative) colorStyle = '#E11D48'; // Debt Rose
    else colorStyle = '#64748B'; // Neutral Slate
  }

  const fontSizes = {
    sm: '13px',
    md: '15px',
    lg: '20px',
    xl: '28px',
  };

  const formatted = formatMoney(Math.abs(amount), currency);
  let prefix = '';
  if (showSign) {
    if (isPositive) prefix = '+';
    if (isNegative) prefix = '-';
  } else if (isNegative) {
    prefix = '-';
  }

  return (
    <span
      style={{
        color: colorStyle,
        fontSize: fontSizes[size],
        fontWeight: size === 'xl' || size === 'lg' ? 700 : 600,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {prefix}{formatted}
    </span>
  );
};
```

#### File: `src/components/atoms/UserAvatar.tsx`
```typescript
import React from 'react';
import { Avatar, Tooltip } from 'antd';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: number;
  showTooltip?: boolean;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const mintColors = ['#00A86B', '#0D9488', '#0284C7', '#059669', '#16A34A', '#4F46E5'];
  const index = Math.abs(hash) % mintColors.length;
  return mintColors[index];
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = 36,
  showTooltip = true,
}) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const avatarElement = (
    <Avatar
      size={size}
      src={avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : undefined}
      style={{
        backgroundColor: avatarUrl ? 'transparent' : stringToColor(name),
        color: '#FFFFFF',
        fontWeight: 600,
        fontSize: Math.floor(size * 0.4),
        border: '2px solid #FFFFFF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'default',
        flexShrink: 0,
      }}
    >
      {!avatarUrl && initials}
    </Avatar>
  );

  if (!showTooltip) return avatarElement;

  return (
    <Tooltip title={name} placement="top">
      {avatarElement}
    </Tooltip>
  );
};
```

#### File: `src/components/atoms/CategoryIcon.tsx`
```typescript
import React from 'react';
import {
  CoffeeOutlined,
  CarOutlined,
  HomeOutlined,
  SmileOutlined,
  ShoppingOutlined,
  ToolOutlined,
  AppstoreOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import type { ExpenseCategory } from '../../types';

interface CategoryIconProps {
  category: ExpenseCategory;
  size?: number;
}

const CATEGORY_MAP: Record<ExpenseCategory, { icon: React.ReactNode; bg: string; color: string }> = {
  FOOD_AND_DRINK: { icon: <CoffeeOutlined />, bg: '#FEF3C7', color: '#D97706' },
  TRANSPORTATION: { icon: <CarOutlined />, bg: '#E0F2FE', color: '#0284C7' },
  ENTERTAINMENT: { icon: <SmileOutlined />, bg: '#FCE7F3', color: '#DB2777' },
  HOME_UTILITIES: { icon: <HomeOutlined />, bg: '#E0E7FF', color: '#4F46E5' },
  LODGING: { icon: <CompassOutlined />, bg: '#DCFCE7', color: '#059669' },
  SERVICES: { icon: <ToolOutlined />, bg: '#F3E8FF', color: '#9333EA' },
  GROCERIES: { icon: <ShoppingOutlined />, bg: '#ECFDF5', color: '#00A86B' },
  GENERAL: { icon: <AppstoreOutlined />, bg: '#F1F5F9', color: '#64748B' },
};

export const CategoryIcon: React.FC<CategoryIconProps> = ({ category, size = 38 }) => {
  const config = CATEGORY_MAP[category] || CATEGORY_MAP.GENERAL;
  const iconSize = Math.floor(size * 0.48);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.floor(size * 0.28),
        backgroundColor: config.bg,
        color: config.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: iconSize,
        flexShrink: 0,
      }}
    >
      {config.icon}
    </div>
  );
};
```

---

### Phase 3: Compound Molecules & Feature Components

#### File: `src/components/molecules/MultiPayerInput.tsx`
```typescript
import React, { useState } from 'react';
import { Radio, InputNumber, Space, Typography, Tag } from 'antd';
import { UserAvatar } from '../atoms/UserAvatar';
import type { UserProfile, ExpensePayer, UUID } from '../../types';
import BigNumber from 'bignumber.js';

interface MultiPayerInputProps {
  members: UserProfile[];
  totalAmount: number;
  currencySymbol: string;
  payers: ExpensePayer[];
  onChange: (payers: ExpensePayer[]) => void;
}

export const MultiPayerInput: React.FC<MultiPayerInputProps> = ({
  members,
  totalAmount,
  currencySymbol,
  payers,
  onChange,
}) => {
  const [mode, setMode] = useState<'SINGLE' | 'MULTIPLE'>(
    payers.length > 1 ? 'MULTIPLE' : 'SINGLE'
  );

  const handleSinglePayerChange = (userId: UUID) => {
    onChange([{ userId, amountPaid: totalAmount }]);
  };

  const handleCustomPayerAmount = (userId: UUID, val: number | null) => {
    const updated = members.map((m) => {
      const existing = payers.find((p) => p.userId === m.id);
      if (m.id === userId) {
        return { userId: m.id, amountPaid: val ?? 0 };
      }
      return { userId: m.id, amountPaid: existing ? existing.amountPaid : 0 };
    }).filter((p) => p.amountPaid > 0);

    onChange(updated);
  };

  const currentPaidSum = payers.reduce((sum, p) => sum.plus(p.amountPaid), new BigNumber(0));
  const diff = new BigNumber(totalAmount).minus(currentPaidSum);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Radio.Group
        value={mode}
        onChange={(e) => {
          const nextMode = e.target.value;
          setMode(nextMode);
          if (nextMode === 'SINGLE') {
            const firstId = payers[0]?.userId || members[0]?.id;
            onChange([{ userId: firstId, amountPaid: totalAmount }]);
          }
        }}
        buttonStyle="solid"
        size="small"
      >
        <Radio.Button value="SINGLE">Single Person</Radio.Button>
        <Radio.Button value="MULTIPLE">Multiple People</Radio.Button>
      </Radio.Group>

      {mode === 'SINGLE' ? (
        <Radio.Group
          value={payers[0]?.userId || members[0]?.id}
          onChange={(e) => handleSinglePayerChange(e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" orientation="vertical" orientationMargin={0} style={{ width: '100%' }}>
            {members.map((member) => (
              <Radio
                key={member.id}
                value={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: payers[0]?.userId === member.id ? '#F0FDF7' : '#FFFFFF',
                  border: '1px solid',
                  borderColor: payers[0]?.userId === member.id ? '#00A86B' : '#E2E8F0',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6, minWidth: 0 }}>
                  <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size={28} showTooltip={false} />
                  <Typography.Text strong ellipsis style={{ maxWidth: 160 }}>
                    {member.name}
                  </Typography.Text>
                </div>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map((member) => {
            const payerObj = payers.find((p) => p.userId === member.id);
            const val = payerObj ? payerObj.amountPaid : 0;
            return (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size={28} showTooltip={false} />
                  <Typography.Text ellipsis style={{ fontSize: 13, flex: 1 }}>
                    {member.name}
                  </Typography.Text>
                </div>
                <InputNumber
                  min={0}
                  max={totalAmount}
                  step={0.5}
                  value={val}
                  prefix={currencySymbol}
                  onChange={(v) => handleCustomPayerAmount(member.id, v)}
                  style={{ width: 110, flexShrink: 0 }}
                />
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Total Allocated: {currencySymbol}{currentPaidSum.toFixed(2)} of {currencySymbol}{new BigNumber(totalAmount).toFixed(2)}
            </Typography.Text>
            {!diff.isEqualTo(0) && (
              <Tag color="error" style={{ margin: 0 }}>
                {diff.isGreaterThan(0) ? `Remaining: ${currencySymbol}${diff.toFixed(2)}` : `Over by: ${currencySymbol}${diff.abs().toFixed(2)}`}
              </Tag>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

#### File: `src/components/molecules/ExpenseRowItem.tsx`
```typescript
import React from 'react';
import { Card, Typography, Popconfirm, Button, Tag } from 'antd';
import { DeleteOutlined, PaperClipOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { CategoryIcon } from '../atoms/CategoryIcon';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { UserAvatar } from '../atoms/UserAvatar';
import type { ExpenseItem, UserProfile } from '../../types';

interface ExpenseRowItemProps {
  expense: ExpenseItem;
  membersMap: Map<string, UserProfile>;
  currentUserId: string;
  onDelete: (id: string) => void;
  onClickReceipt?: (dataUrl: string) => void;
}

export const ExpenseRowItem: React.FC<ExpenseRowItemProps> = ({
  expense,
  membersMap,
  currentUserId,
  onDelete,
  onClickReceipt,
}) => {
  const isSettlement = expense.isSettlement;
  const isPayer = expense.paidBy.some((p) => p.userId === currentUserId);
  const mySplit = expense.splits.find((s) => s.userId === currentUserId);

  let statusText = '';
  let statusAmount = 0;
  let statusColor: 'credit' | 'debit' | 'neutral' = 'neutral';

  if (isSettlement) {
    const payerName = membersMap.get(expense.paidBy[0]?.userId)?.name || 'Someone';
    const receiverName = membersMap.get(expense.splits[0]?.userId)?.name || 'Someone';
    statusText = `${payerName} paid ${receiverName}`;
  } else if (isPayer) {
    const totalPaidByMe = expense.paidBy.find((p) => p.userId === currentUserId)?.amountPaid || 0;
    const myOwed = mySplit?.owedAmount || 0;
    const netCredit = totalPaidByMe - myOwed;

    if (netCredit > 0) {
      statusText = 'you lent';
      statusAmount = netCredit;
      statusColor = 'credit';
    } else {
      statusText = 'you paid for yourself';
      statusAmount = totalPaidByMe;
      statusColor = 'neutral';
    }
  } else if (mySplit && mySplit.owedAmount > 0) {
    statusText = 'you borrowed';
    statusAmount = mySplit.owedAmount;
    statusColor = 'debit';
  } else {
    statusText = 'not involved';
    statusAmount = 0;
  }

  const primaryPayer = membersMap.get(expense.paidBy[0]?.userId);

  return (
    <Card
      styles={{ body: { padding: '12px 16px' } }}
      style={{
        borderRadius: 10,
        marginBottom: 8,
        border: '1px solid #EDF2F7',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        backgroundColor: isSettlement ? '#F0FDF4' : '#FFFFFF',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {/* Left: Category Icon & Details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <CategoryIcon category={expense.category} size={42} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Typography.Text
                strong
                ellipsis
                style={{
                  fontSize: 15,
                  color: isSettlement ? '#047857' : '#0F172A',
                }}
              >
                {expense.description}
              </Typography.Text>
              {expense.receiptDataUrl && (
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined style={{ color: '#00A86B' }} />}
                  onClick={() => onClickReceipt && onClickReceipt(expense.receiptDataUrl!)}
                />
              )}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {dayjs(expense.date).format('MMM D, YYYY')} • Paid by{' '}
              <span style={{ fontWeight: 500, color: '#334155' }}>
                {expense.paidBy.length > 1
                  ? `${expense.paidBy.length} people`
                  : primaryPayer?.name || 'Unknown'}
              </span>
            </Typography.Text>
          </div>
        </div>

        {/* Right: Balance Impact & Delete Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 11,
                display: 'block',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
                color: statusColor === 'credit' ? '#059669' : statusColor === 'debit' ? '#E11D48' : '#64748B',
              }}
            >
              {statusText}
            </Typography.Text>
            {statusAmount > 0 ? (
              <CurrencyDisplay
                amount={statusAmount}
                currency={expense.currency}
                colored={statusColor !== 'neutral'}
                showSign={statusColor !== 'neutral'}
                size="md"
              />
            ) : (
              <CurrencyDisplay amount={expense.amount} currency={expense.currency} size="md" />
            )}
          </div>

          <Popconfirm
            title="Delete this expense?"
            description="Balances will be recalculated automatically."
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(expense.id)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined style={{ fontSize: 16 }} />}
              aria-label="Delete Expense"
              style={{
                opacity: 0.7,
                width: 44,
                height: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Popconfirm>
        </div>
      </div>
    </Card>
  );
};
```

---

### Phase 4: State Management & Specialized Organisms

#### File: `src/stores/useAppStore.ts`
```typescript
import { create } from 'zustand';
import type { UUID, CurrencyCode } from '../types';

interface AppState {
  currentUserId: UUID;
  activeGroupId: UUID | null;
  activeFriendId: UUID | null;
  preferredCurrency: CurrencyCode;
  isExpenseModalOpen: boolean;
  isSettlementModalOpen: boolean;
  preselectedSettlementTarget: { fromUserId: UUID; toUserId: UUID; amount: number } | null;

  setCurrentUser: (userId: UUID) => void;
  setActiveGroup: (groupId: UUID | null) => void;
  setActiveFriend: (friendId: UUID | null) => void;
  setPreferredCurrency: (curr: CurrencyCode) => void;
  openExpenseModal: () => void;
  closeExpenseModal: () => void;
  openSettlementModal: (target?: { fromUserId: UUID; toUserId: UUID; amount: number }) => void;
  closeSettlementModal: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  currentUserId: 'user-self',
  activeGroupId: null,
  activeFriendId: null,
  preferredCurrency: 'USD',
  isExpenseModalOpen: false,
  isSettlementModalOpen: false,
  preselectedSettlementTarget: null,

  setCurrentUser: (userId) => set({ currentUserId: userId }),
  setActiveGroup: (groupId) => set({ activeGroupId: groupId, activeFriendId: null }),
  setActiveFriend: (friendId) => set({ activeFriendId: friendId, activeGroupId: null }),
  setPreferredCurrency: (preferredCurrency) => set({ preferredCurrency }),
  openExpenseModal: () => set({ isExpenseModalOpen: true }),
  closeExpenseModal: () => set({ isExpenseModalOpen: false }),
  openSettlementModal: (target) =>
    set({
      isSettlementModalOpen: true,
      preselectedSettlementTarget: target || null,
    }),
  closeSettlementModal: () =>
    set({
      isSettlementModalOpen: false,
      preselectedSettlementTarget: null,
    }),
}));
```

#### File: `src/components/organisms/DebtSimplificationCard.tsx`
```typescript
import React from 'react';
import { Card, Typography, Button, Space, Tag, Empty } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, ThunderboltFilled } from '@ant-design/icons';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import type { DebtTransfer, UserProfile, UUID } from '../../types';
import { useAppStore } from '../../stores/useAppStore';

interface DebtSimplificationCardProps {
  transfers: DebtTransfer[];
  membersMap: Map<UUID, UserProfile>;
  groupName?: string;
}

export const DebtSimplificationCard: React.FC<DebtSimplificationCardProps> = ({
  transfers,
  membersMap,
  groupName,
}) => {
  const { currentUserId, openSettlementModal } = useAppStore();

  if (transfers.length === 0) {
    return (
      <Card
        style={{
          borderRadius: 12,
          backgroundColor: '#F0FDF7',
          border: '1px solid #DCFCE7',
          textAlign: 'center',
          padding: '24px 12px',
        }}
      >
        <CheckCircleFilled style={{ fontSize: 36, color: '#00A86B', marginBottom: 12 }} />
        <Typography.Title level={4} style={{ margin: 0, color: '#065F46' }}>
          All Settled Up!
        </Typography.Title>
        <Typography.Text type="secondary" style={{ color: '#047857' }}>
          No outstanding debts in {groupName || 'this ledger'}.
        </Typography.Text>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltFilled style={{ color: '#00A86B' }} />
          <span>Simplified Settlement Path</span>
          <Tag color="success" style={{ marginLeft: 'auto', borderRadius: 12 }}>
            {transfers.length} {transfers.length === 1 ? 'Transfer' : 'Transfers'}
          </Tag>
        </div>
      }
      style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {transfers.map((t, idx) => {
          const fromUser = membersMap.get(t.fromUserId);
          const toUser = membersMap.get(t.toUserId);
          const involvesMe = t.fromUserId === currentUserId || t.toUserId === currentUserId;

          return (
            <div
              key={`${t.fromUserId}-${t.toUserId}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: involvesMe ? '#F0FDF7' : '#F8FAFC',
                border: '1px solid',
                borderColor: involvesMe ? '#A7F3D0' : '#E2E8F0',
                gap: 8,
              }}
            >
              {/* Participant Path */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <UserAvatar name={fromUser?.name || 'User'} avatarUrl={fromUser?.avatarUrl} size={28} />
                <Typography.Text strong ellipsis style={{ fontSize: 13, maxWidth: 80 }}>
                  {t.fromUserId === currentUserId ? 'You' : fromUser?.name.split(' ')[0]}
                </Typography.Text>
                <ArrowRightOutlined style={{ color: '#94A3B8', fontSize: 12 }} />
                <UserAvatar name={toUser?.name || 'User'} avatarUrl={toUser?.avatarUrl} size={28} />
                <Typography.Text strong ellipsis style={{ fontSize: 13, maxWidth: 80 }}>
                  {t.toUserId === currentUserId ? 'You' : toUser?.name.split(' ')[0]}
                </Typography.Text>
              </div>

              {/* Amount and Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <CurrencyDisplay amount={t.amount} currency={t.currency} size="md" />
                {involvesMe && (
                  <Button
                    type="primary"
                    size="small"
                    style={{
                      backgroundColor: '#00A86B',
                      fontSize: 12,
                      height: 28,
                      borderRadius: 6,
                    }}
                    onClick={() =>
                      openSettlementModal({
                        fromUserId: t.fromUserId,
                        toUserId: t.toUserId,
                        amount: t.amount,
                      })
                    }
                  >
                    Settle
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
```

#### File: `src/components/organisms/ExpenseFormModal.tsx`
```typescript
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Segmented,
  Button,
  Upload,
  message,
  Grid,
  Divider,
} from 'antd';
import { CameraOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { db } from '../../services/db';
import { computeSplits } from '../../utils/debtEngine';
import { MultiPayerInput } from '../molecules/MultiPayerInput';
import { CURRENCY_SYMBOLS } from '../../utils/currency';
import type {
  UserProfile,
  Group,
  ExpenseCategory,
  SplitType,
  ExpensePayer,
  CurrencyCode,
  UUID,
} from '../../types';

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: UUID;
  defaultGroupId: UUID | null;
  users: UserProfile[];
  groups: Group[];
}

const CATEGORIES: { label: string; value: ExpenseCategory }[] = [
  { label: 'Food & Dining', value: 'FOOD_AND_DRINK' },
  { label: 'Transportation', value: 'TRANSPORTATION' },
  { label: 'Groceries', value: 'GROCERIES' },
  { label: 'Home & Utilities', value: 'HOME_UTILITIES' },
  { label: 'Lodging', value: 'LODGING' },
  { label: 'Entertainment', value: 'ENTERTAINMENT' },
  { label: 'Services', value: 'SERVICES' },
  { label: 'General', value: 'GENERAL' },
];

const { useBreakpoint } = Grid;

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  open,
  onClose,
  currentUserId,
  defaultGroupId,
  users,
  groups,
}) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [form] = Form.useForm();
  const [selectedGroupId, setSelectedGroupId] = useState<UUID | 'DIRECT'>(
    defaultGroupId || 'DIRECT'
  );
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [amount, setAmount] = useState<number>(0);
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [payers, setPayers] = useState<ExpensePayer[]>([
    { userId: currentUserId, amountPaid: 0 },
  ]);
  const [customSplits, setCustomSplits] = useState<Record<UUID, number>>({});
  const [receiptBase64, setReceiptBase64] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Determine active participant pool
  const activeMembers: UserProfile[] = React.useMemo(() => {
    if (selectedGroupId && selectedGroupId !== 'DIRECT') {
      const grp = groups.find((g) => g.id === selectedGroupId);
      if (!grp) return users;
      const memberIds = new Set(grp.members.map((m) => m.userId));
      return users.filter((u) => memberIds.has(u.id));
    }
    return users; // Direct peer split defaults to all contacts
  }, [selectedGroupId, groups, users]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setSelectedGroupId(defaultGroupId || 'DIRECT');
      setAmount(0);
      setSplitType('EQUAL');
      setPayers([{ userId: currentUserId, amountPaid: 0 }]);
      setCustomSplits({});
      setReceiptBase64(undefined);
    }
  }, [open, defaultGroupId, currentUserId, form]);

  const handleAmountChange = (val: number | null) => {
    const num = val ?? 0;
    setAmount(num);
    if (payers.length === 1) {
      setPayers([{ userId: payers[0].userId, amountPaid: num }]);
    }
  };

  const handleReceiptUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setReceiptBase64(e.target?.result as string);
      message.success('Receipt attached');
    };
    reader.readAsDataURL(file);
    return false; // Prevent auto upload
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (amount <= 0) {
        message.error('Please enter a valid expense amount.');
        return;
      }

      // Calculate splits
      const participantIds = activeMembers.map((m) => m.id);
      const splitResult = computeSplits({
        totalAmount: amount,
        splitType,
        participantIds,
        customValues: customSplits,
      });

      if (!splitResult.isValid) {
        message.error(splitResult.validationError || 'Invalid split allocation.');
        return;
      }

      // Verify payers match total
      const totalPaid = payers.reduce((sum, p) => sum + p.amountPaid, 0);
      if (Math.abs(totalPaid - amount) > 0.01) {
        message.error(`Paid amounts sum to ${totalPaid.toFixed(2)}, which does not match ${amount.toFixed(2)}.`);
        return;
      }

      if (submitting) return;
      setSubmitting(true);
      const now = new Date().toISOString();
      const expenseId = `exp-${Date.now()}`;

      await db.transaction('rw', db.expenses, db.activities, async () => {
        await db.expenses.add({
          id: expenseId,
          groupId: selectedGroupId === 'DIRECT' ? null : selectedGroupId,
          description: values.description,
          category: values.category,
          amount,
          currency,
          paidBy: payers,
          splitType,
          splits: splitResult.splits,
          date: values.date ? values.date.toISOString() : now,
          notes: values.notes,
          receiptDataUrl: receiptBase64,
          isSettlement: false,
          createdBy: currentUserId,
          createdAt: now,
          updatedAt: now,
        });

        await db.activities.add({
          id: `act-${Date.now()}`,
          groupId: selectedGroupId === 'DIRECT' ? undefined : selectedGroupId,
          actorUserId: currentUserId,
          action: 'EXPENSE_CREATED',
          entityId: expenseId,
          metadata: {
            description: values.description,
            amount,
            currency,
          },
          timestamp: now,
        });
      });

      message.success('Expense recorded successfully!');
      onClose();
    } catch {
      // Form validation errors or db abort handled silently
    } finally {
      setSubmitting(false);
    }
  };

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        category: 'FOOD_AND_DRINK',
        date: dayjs(),
      }}
    >
      {/* Group Selector */}
      <Form.Item label="Group / Destination" required>
        <Select
          value={selectedGroupId}
          onChange={(val) => setSelectedGroupId(val)}
          options={[
            { label: 'Personal / Direct Friend Split', value: 'DIRECT' },
            ...groups.map((g) => ({ label: `Group: ${g.name}`, value: g.id })),
          ]}
        />
      </Form.Item>

      {/* Description & Amount */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12 }}>
        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Description is required' }]}
        >
          <Input placeholder="e.g. Kyoto Bullet Train Tickets" size="large" />
        </Form.Item>

        <Form.Item label="Amount" required>
          <InputNumber
            min={0.01}
            step={0.5}
            value={amount}
            onChange={handleAmountChange}
            prefix={CURRENCY_SYMBOLS[currency]}
            style={{ width: '100%' }}
            size="large"
            placeholder="0.00"
          />
        </Form.Item>
      </div>

      {/* Category, Date & Currency */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
        <Form.Item name="category" label="Category">
          <Select options={CATEGORIES} />
        </Form.Item>

        <Form.Item name="date" label="Date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="Currency">
          <Select
            value={currency}
            onChange={(c) => setCurrency(c)}
            options={Object.keys(CURRENCY_SYMBOLS).map((c) => ({ label: c, value: c }))}
          />
        </Form.Item>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Payer Multi-selector */}
      <Form.Item label="Paid By" required>
        <MultiPayerInput
          members={activeMembers}
          totalAmount={amount}
          currencySymbol={CURRENCY_SYMBOLS[currency]}
          payers={payers}
          onChange={(nextPayers) => setPayers(nextPayers)}
        />
      </Form.Item>

      {/* Split Type Selector */}
      <Form.Item label="Split Method">
        <Segmented
          block
          value={splitType}
          onChange={(val) => setSplitType(val as SplitType)}
          options={[
            { label: 'Equally', value: 'EQUAL' },
            { label: 'Exact Amounts', value: 'EXACT' },
            { label: 'Percentages', value: 'PERCENT' },
            { label: 'Shares', value: 'SHARES' },
          ]}
        />
      </Form.Item>

      {/* Custom Split Inputs when not EQUAL */}
      {splitType !== 'EQUAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {activeMembers.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderBottom: '1px solid #F1F5F9',
              }}
            >
              <span style={{ fontSize: 13 }}>{m.name}</span>
              <InputNumber
                size="small"
                min={0}
                style={{ width: 110 }}
                placeholder={splitType === 'PERCENT' ? '%' : splitType === 'SHARES' ? 'Shares' : 'Amount'}
                value={customSplits[m.id]}
                onChange={(val) =>
                  setCustomSplits((prev) => ({ ...prev, [m.id]: val ?? 0 }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Receipt Image Capture */}
      <Form.Item label="Receipt / Attachment">
        <Upload beforeUpload={handleReceiptUpload} maxCount={1} showUploadList={false}>
          <Button icon={<CameraOutlined />}>
            {receiptBase64 ? 'Replace Attached Receipt' : 'Upload Receipt Photo'}
          </Button>
        </Upload>
        {receiptBase64 && (
          <div style={{ marginTop: 8 }}>
            <img
              src={receiptBase64}
              alt="Receipt Preview"
              style={{ maxHeight: 80, borderRadius: 6, border: '1px solid #CBD5E1' }}
            />
          </div>
        )}
      </Form.Item>
    </Form>
  );

  if (isMobile) {
    return (
      <Drawer
        title="Add an Expense"
        placement="bottom"
        open={open}
        onClose={onClose}
        height="92vh"
        extra={
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            icon={<CheckOutlined />}
            style={{ backgroundColor: '#00A86B', minHeight: 38 }}
          >
            Save
          </Button>
        }
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      title="Add an Expense"
      open={open}
      onCancel={onClose}
      width={640}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText="Save Expense"
      okButtonProps={{ style: { backgroundColor: '#00A86B' } }}
    >
      {formContent}
    </Modal>
  );
};
```

#### File: `src/components/organisms/SettlementWizard.tsx`
```typescript
import React, { useState } from 'react';
import { Modal, Select, InputNumber, Button, Typography, message, Result } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled } from '@ant-design/icons';
import confetti from 'canvas-confetti';
import { db } from '../../services/db';
import { UserAvatar } from '../atoms/UserAvatar';
import { CURRENCY_SYMBOLS } from '../../utils/currency';
import type { UserProfile, CurrencyCode, UUID } from '../../types';

interface SettlementWizardProps {
  open: boolean;
  onClose: () => void;
  users: UserProfile[];
  defaultPayerId?: UUID;
  defaultReceiverId?: UUID;
  defaultAmount?: number;
  currency?: CurrencyCode;
}

export const SettlementWizard: React.FC<SettlementWizardProps> = ({
  open,
  onClose,
  users,
  defaultPayerId,
  defaultReceiverId,
  defaultAmount = 0,
  currency = 'USD',
}) => {
  const [payerId, setPayerId] = useState<UUID>(defaultPayerId || users[0]?.id);
  const [receiverId, setReceiverId] = useState<UUID>(
    defaultReceiverId || (users[1] ? users[1].id : users[0]?.id)
  );
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [settled, setSettled] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      setPayerId(defaultPayerId || users[0]?.id);
      setReceiverId(defaultReceiverId || (users[1] ? users[1].id : users[0]?.id));
      setAmount(defaultAmount);
      setSettled(false);
    }
  }, [open, defaultPayerId, defaultReceiverId, defaultAmount, users]);

  const handleSettle = async () => {
    if (payerId === receiverId) {
      message.error('Payer and recipient cannot be the same person.');
      return;
    }
    if (amount <= 0) {
      message.error('Settlement amount must be positive.');
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    const now = new Date().toISOString();
    const settlementId = `settle-${Date.now()}`;

    await db.transaction('rw', db.expenses, db.activities, async () => {
      // A settlement is represented as an expense where payerId paid 100% and receiverId owes 100%
      await db.expenses.add({
        id: settlementId,
        groupId: null,
        description: 'Settlement Payment',
        category: 'GENERAL',
        amount,
        currency,
        paidBy: [{ userId: payerId, amountPaid: amount }],
        splitType: 'EXACT',
        splits: [{ userId: receiverId, owedAmount: amount }],
        date: now,
        isSettlement: true,
        createdBy: payerId,
        createdAt: now,
        updatedAt: now,
      });

      await db.activities.add({
        id: `act-${Date.now()}`,
        actorUserId: payerId,
        action: 'SETTLEMENT_RECORDED',
        entityId: settlementId,
        metadata: {
          description: 'Payment recorded',
          amount,
          currency,
        },
        timestamp: now,
      });
    });

    setSubmitting(false);
    setSettled(true);

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#00A86B', '#10B981', '#34D399', '#A7F3D0'],
    });
  };

  const payerUser = users.find((u) => u.id === payerId);
  const receiverUser = users.find((u) => u.id === receiverId);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={460}
      centered
      title="Record a Payment"
      styles={{ body: { padding: '20px 24px' } }}
    >
      {!settled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Visual Transfer Direction */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '16px',
              backgroundColor: '#F0FDF7',
              borderRadius: 12,
              border: '1px solid #DCFCE7',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <UserAvatar name={payerUser?.name || 'Payer'} avatarUrl={payerUser?.avatarUrl} size={48} />
              <Typography.Text strong style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
                {payerUser?.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Payer
              </Typography.Text>
            </div>

            <ArrowRightOutlined style={{ fontSize: 20, color: '#00A86B' }} />

            <div style={{ textAlign: 'center' }}>
              <UserAvatar name={receiverUser?.name || 'Receiver'} avatarUrl={receiverUser?.avatarUrl} size={48} />
              <Typography.Text strong style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
                {receiverUser?.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Recipient
              </Typography.Text>
            </div>
          </div>

          {/* Form Selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Who is paying?
              </Typography.Text>
              <Select
                value={payerId}
                onChange={(v) => setPayerId(v)}
                style={{ width: '100%' }}
                options={users.map((u) => ({ label: u.name, value: u.id }))}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Who is receiving?
              </Typography.Text>
              <Select
                value={receiverId}
                onChange={(v) => setReceiverId(v)}
                style={{ width: '100%' }}
                options={users.map((u) => ({ label: u.name, value: u.id }))}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Settlement Amount
              </Typography.Text>
              <InputNumber
                value={amount}
                onChange={(v) => setAmount(v ?? 0)}
                prefix={CURRENCY_SYMBOLS[currency]}
                min={0.01}
                step={1}
                style={{ width: '100%' }}
                size="large"
              />
            </div>
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={submitting}
            onClick={handleSettle}
            style={{ backgroundColor: '#00A86B', height: 44, borderRadius: 8 }}
          >
            Record Cash / Transfer Settlement
          </Button>
        </div>
      ) : (
        <Result
          status="success"
          icon={<CheckCircleFilled style={{ color: '#00A86B' }} />}
          title="Payment Successfully Recorded"
          subTitle={`${payerUser?.name} paid ${CURRENCY_SYMBOLS[currency]}${amount.toFixed(2)} to ${receiverUser?.name}. Ledger updated.`}
          extra={[
            <Button
              type="primary"
              key="done"
              onClick={onClose}
              style={{ backgroundColor: '#00A86B' }}
            >
              Done
            </Button>,
          ]}
        />
      )}
    </Modal>
  );
};
```

---

### Phase 5: Complete Page/Screen Assembly & Responsive Shell

#### File: `src/components/templates/ResponsiveAppShell.tsx`
```typescript
import React from 'react';
import { Layout, Menu, Button, Typography, Dropdown, Space, Avatar } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  UserOutlined,
  PlusOutlined,
  HistoryOutlined,
  DollarCircleOutlined,
  DownOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/useAppStore';
import { UserAvatar } from '../atoms/UserAvatar';
import type { UserProfile, Group } from '../../types';

import { Grid, type MenuProps } from 'antd';

const { Header, Content, Sider } = Layout;
const { useBreakpoint } = Grid;

type ShellTab = 'DASHBOARD' | 'GROUPS' | 'FRIENDS' | 'ACTIVITY';

interface ResponsiveAppShellProps {
  children: React.ReactNode;
  users: UserProfile[];
  groups: Group[];
  activeTab: ShellTab;
  onTabChange: (tab: ShellTab) => void;
  onExportJson: () => void;
}

export const ResponsiveAppShell: React.FC<ResponsiveAppShellProps> = ({
  children,
  users,
  groups,
  activeTab,
  onTabChange,
  onExportJson,
}) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { currentUserId, setCurrentUser, openExpenseModal, openSettlementModal } = useAppStore();
  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  const userMenuItems: MenuProps['items'] = users.map((u) => ({
    key: u.id,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={24} showTooltip={false} />
        <span>{u.name}</span>
      </div>
    ),
  }));

  const handleMenuClick: MenuProps['onClick'] = (info) => {
    onTabChange(info.key as ShellTab);
  };

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      {/* Top Header Navigation */}
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: isMobile ? '0 12px' : '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}
      >
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#00A86B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            S
          </div>
          <Typography.Title
            level={4}
            style={{ margin: 0, color: '#0F172A', letterSpacing: '-0.02em', fontWeight: 700 }}
          >
            Mint<span style={{ color: '#00A86B' }}>Split</span>
          </Typography.Title>
        </div>

        {/* Global Action Bar */}
        <Space size={isMobile ? 'small' : 'middle'}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openExpenseModal}
            aria-label="Add Expense"
            style={{
              backgroundColor: '#00A86B',
              fontWeight: 600,
              borderRadius: 6,
              boxShadow: '0 2px 4px rgba(0, 168, 107, 0.2)',
              minHeight: 38,
            }}
          >
            {!isMobile && 'Add Expense'}
          </Button>

          <Button
            icon={<DollarCircleOutlined />}
            onClick={() => openSettlementModal()}
            aria-label="Settle Up"
            style={{ borderRadius: 6, borderColor: '#CBD5E1', minHeight: 38 }}
          >
            {!isMobile && 'Settle Up'}
          </Button>

          {!isMobile && (
            <Button
              icon={<DownloadOutlined />}
              onClick={onExportJson}
              title="Backup Local Database"
              aria-label="Backup Database"
              style={{ borderRadius: 6, minHeight: 38 }}
            />
          )}

          {/* User Profile Switcher */}
          <Dropdown
            menu={{
              items: userMenuItems,
              onClick: (e) => setCurrentUser(e.key),
            }}
            trigger={['click']}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 8,
                backgroundColor: '#F1F5F9',
                minHeight: 38,
              }}
            >
              <UserAvatar
                name={currentUser?.name || 'User'}
                avatarUrl={currentUser?.avatarUrl}
                size={26}
                showTooltip={false}
              />
              {!isMobile && (
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
                  {currentUser?.name ? currentUser.name.split(' ')[0] : 'User'}
                </span>
              )}
              <DownOutlined style={{ fontSize: 10, color: '#64748B' }} />
            </div>
          </Dropdown>
        </Space>
      </Header>

      <Layout>
        {/* Desktop Sidebar */}
        <Sider
          breakpoint="lg"
          collapsedWidth={0}
          width={240}
          style={{
            backgroundColor: '#FFFFFF',
            borderRight: '1px solid #E2E8F0',
            display: isMobile ? 'none' : 'block',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            onClick={handleMenuClick}
            style={{ borderRight: 0, paddingTop: 12 }}
            items={[
              { key: 'DASHBOARD', icon: <DashboardOutlined />, label: 'Dashboard' },
              { key: 'GROUPS', icon: <TeamOutlined />, label: 'Groups' },
              { key: 'FRIENDS', icon: <UserOutlined />, label: 'Friends' },
              { key: 'ACTIVITY', icon: <HistoryOutlined />, label: 'Activity Log' },
            ]}
          />
        </Sider>

        {/* Content Shell with bottom padding safeguard for mobile navigation */}
        <Content
          style={{
            padding: isMobile ? '16px 12px 76px 12px' : '20px',
            maxWidth: 1200,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {children}
        </Content>
      </Layout>

      {/* Mobile Bottom Navigation Bar (Rendered only on <768px viewports) */}
      {isMobile && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            zIndex: 999,
          }}
        >
        <div
          onClick={() => onTabChange('DASHBOARD')}
          style={{
            textAlign: 'center',
            color: activeTab === 'DASHBOARD' ? '#00A86B' : '#64748B',
            cursor: 'pointer',
          }}
        >
          <DashboardOutlined style={{ fontSize: 18 }} />
          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>Home</div>
        </div>
        <div
          onClick={() => onTabChange('GROUPS')}
          style={{
            textAlign: 'center',
            color: activeTab === 'GROUPS' ? '#00A86B' : '#64748B',
            cursor: 'pointer',
          }}
        >
          <TeamOutlined style={{ fontSize: 18 }} />
          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>Groups</div>
        </div>
        <div
          onClick={() => onTabChange('FRIENDS')}
          style={{
            textAlign: 'center',
            color: activeTab === 'FRIENDS' ? '#00A86B' : '#64748B',
            cursor: 'pointer',
          }}
        >
          <UserOutlined style={{ fontSize: 18 }} />
          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>Friends</div>
        </div>
        <div
          onClick={() => onTabChange('ACTIVITY')}
          style={{
            textAlign: 'center',
            color: activeTab === 'ACTIVITY' ? '#00A86B' : '#64748B',
            cursor: 'pointer',
          }}
        >
          <HistoryOutlined style={{ fontSize: 18 }} />
          <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2 }}>Activity</div>
        </div>
      </div>
    </Layout>
  );
};
```

#### File: `src/components/templates/DashboardView.tsx`
```typescript
import React from 'react';
import { Row, Col, Card, Typography, Statistic, Button, Input } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import BigNumber from 'bignumber.js';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { ExpenseRowItem } from '../molecules/ExpenseRowItem';
import { DebtSimplificationCard } from '../organisms/DebtSimplificationCard';
import { calculateSimplifiedDebts } from '../../utils/debtEngine';
import type { ExpenseItem, UserProfile, Group, UUID } from '../../types';

interface DashboardViewProps {
  currentUserId: UUID;
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  onDeleteExpense: (id: UUID) => void;
  onOpenAddExpense: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUserId,
  users,
  groups,
  expenses,
  onDeleteExpense,
  onOpenAddExpense,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');

  const membersMap = React.useMemo(() => {
    const map = new Map<UUID, UserProfile>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  // Aggregate user balance totals
  const { totalOwedToMe, totalIOwe, netBalance } = React.useMemo(() => {
    let credit = new BigNumber(0);
    let debit = new BigNumber(0);

    for (const exp of expenses) {
      const myPayment = exp.paidBy.find((p) => p.userId === currentUserId)?.amountPaid || 0;
      const mySplit = exp.splits.find((s) => s.userId === currentUserId)?.owedAmount || 0;
      const diff = new BigNumber(myPayment).minus(mySplit);

      if (diff.isGreaterThan(0)) {
        credit = credit.plus(diff);
      } else if (diff.isLessThan(0)) {
        debit = debit.plus(diff.abs());
      }
    }

    return {
      totalOwedToMe: credit.toNumber(),
      totalIOwe: debit.toNumber(),
      netBalance: credit.minus(debit).toNumber(),
    };
  }, [expenses, currentUserId]);

  // Global Simplified Debts
  const allUserIds = users.map((u) => u.id);
  const simplifiedTransfers = React.useMemo(() => {
    return calculateSimplifiedDebts(allUserIds, expenses, 'USD');
  }, [allUserIds, expenses]);

  const filteredExpenses = expenses.filter((e) =>
    e.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Metrics Banner */}
      <Card
        style={{
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Total Net Balance
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              <CurrencyDisplay
                amount={netBalance}
                colored
                showSign
                size="xl"
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {netBalance >= 0 ? 'Overall you are owed money' : 'Overall you owe money'}
            </Typography.Text>
          </Col>

          <Col xs={12} sm={8}>
            <Statistic
              title="You are owed"
              value={totalOwedToMe}
              precision={2}
              valueStyle={{ color: '#059669', fontWeight: 700 }}
              prefix={<ArrowUpOutlined style={{ fontSize: 16 }} />}
            />
          </Col>

          <Col xs={12} sm={8}>
            <Statistic
              title="You owe"
              value={totalIOwe}
              precision={2}
              valueStyle={{ color: '#E11D48', fontWeight: 700 }}
              prefix={<ArrowDownOutlined style={{ fontSize: 16 }} />}
            />
          </Col>
        </Row>
      </Card>

      {/* Main Split: Left Ledger, Right Settlement Graph */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={15}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
              Recent Expenses
            </Typography.Title>
            <Input
              placeholder="Search description..."
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 200, borderRadius: 8 }}
              allowClear
            />
          </div>

          {filteredExpenses.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '32px 0', borderRadius: 12 }}>
              <Typography.Text type="secondary">No expenses found.</Typography.Text>
              <div style={{ marginTop: 12 }}>
                <Button
                  type="primary"
                  icon={<PlusCircleOutlined />}
                  onClick={onOpenAddExpense}
                  style={{ backgroundColor: '#00A86B' }}
                >
                  Create Your First Expense
                </Button>
              </div>
            </Card>
          ) : (
            <div>
              {filteredExpenses.map((expense) => (
                <ExpenseRowItem
                  key={expense.id}
                  expense={expense}
                  membersMap={membersMap}
                  currentUserId={currentUserId}
                  onDelete={onDeleteExpense}
                />
              ))}
            </div>
          )}
        </Col>

        <Col xs={24} lg={9}>
          <DebtSimplificationCard
            transfers={simplifiedTransfers}
            membersMap={membersMap}
            groupName="All Groups & Direct"
          />
        </Col>
      </Row>
    </div>
  );
};
```

#### File: `src/services/exportImport.ts`
```typescript
import { db } from './db';
import type { UserProfile, Group, ExpenseItem, ActivityLog } from '../types';

export interface DatabaseSnapshot {
  version: number;
  timestamp: string;
  users: UserProfile[];
  groups: Group[];
  expenses: ExpenseItem[];
  activities: ActivityLog[];
}

export async function exportDatabaseToJson(): Promise<void> {
  const users = await db.users.toArray();
  const groups = await db.groups.toArray();
  const expenses = await db.expenses.toArray();
  const activities = await db.activities.toArray();

  const snapshot: DatabaseSnapshot = {
    version: 1,
    timestamp: new Date().toISOString(),
    users,
    groups,
    expenses,
    activities,
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(snapshot, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `mintsplit-backup-${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
```

#### File: `src/app/App.tsx`
```typescript
import React, { useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { seedInitialDataIfEmpty } from '../services/dbSeed';
import { exportDatabaseToJson } from '../services/exportImport';
import { cleanFinanceMintTheme } from '../theme';
import { useAppStore } from '../stores/useAppStore';
import { ResponsiveAppShell } from '../components/templates/ResponsiveAppShell';
import { DashboardView } from '../components/templates/DashboardView';
import { ExpenseFormModal } from '../components/organisms/ExpenseFormModal';
import { SettlementWizard } from '../components/organisms/SettlementWizard';

export const AppContent: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'GROUPS' | 'FRIENDS' | 'ACTIVITY'>('DASHBOARD');

  const {
    currentUserId,
    activeGroupId,
    isExpenseModalOpen,
    isSettlementModalOpen,
    preselectedSettlementTarget,
    closeExpenseModal,
    closeSettlementModal,
    openExpenseModal,
  } = useAppStore();

  useEffect(() => {
    seedInitialDataIfEmpty().then(() => setInitialized(true));
  }, []);

  const users = useLiveQuery(() => db.users.toArray(), []) || [];
  const groups = useLiveQuery(() => db.groups.toArray(), []) || [];
  const expenses = useLiveQuery(
    () => db.expenses.orderBy('date').reverse().toArray(),
    []
  ) || [];

  if (!initialized) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const handleDeleteExpense = async (id: string) => {
    await db.expenses.delete(id);
    await db.activities.add({
      id: `act-${Date.now()}`,
      actorUserId: currentUserId,
      action: 'EXPENSE_DELETED',
      entityId: id,
      metadata: {},
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <ResponsiveAppShell
      users={users}
      groups={groups}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onExportJson={exportDatabaseToJson}
    >
      {activeTab === 'DASHBOARD' && (
        <DashboardView
          currentUserId={currentUserId}
          users={users}
          groups={groups}
          expenses={expenses}
          onDeleteExpense={handleDeleteExpense}
          onOpenAddExpense={openExpenseModal}
        />
      )}

      {/* Expense Modal/Drawer Hybrid */}
      <ExpenseFormModal
        open={isExpenseModalOpen}
        onClose={closeExpenseModal}
        currentUserId={currentUserId}
        defaultGroupId={activeGroupId}
        users={users}
        groups={groups}
      />

      {/* Settlement Wizard */}
      <SettlementWizard
        open={isSettlementModalOpen}
        onClose={closeSettlementModal}
        users={users}
        defaultPayerId={preselectedSettlementTarget?.fromUserId}
        defaultReceiverId={preselectedSettlementTarget?.toUserId}
        defaultAmount={preselectedSettlementTarget?.amount}
      />
    </ResponsiveAppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ConfigProvider theme={cleanFinanceMintTheme}>
      <AntdApp>
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
```

---

## 9. Verification & Acceptance Criteria Matrix

| Criterion | Implementation Specification | Validation Check |
| :--- | :--- | :--- |
| **Penny Leak Prevention** | BigNumber.js calculation in `computeSplits()` distributing floor cents and remainder cents. | $\sum \text{owedAmount} \equiv \text{totalAmount}$ down to \$0.01 precision across 3, 7, and 13 participants. |
| **Debt Simplification** | Greedy heuristic matching max positive balance to max negative balance in `calculateSimplifiedDebts()`. | Ledger of $N$ users resolves to strictly fewer than $N$ transfers, canceling cyclic reciprocal debts. |
| **Zero Mobile Overflow** | Ant Design grid system + responsive Drawer switcher (`useBreakpoint().md ? Modal : Drawer`). | 360px viewport shows clean vertical stack with no horizontal scroll bar. Bottom nav visible. |
| **Touch Optimization** | All clickable action icons padded to $\ge 44 \times 44\text{px}$ touch targets. | No desktop hover-states required to view balances or trigger settlements. |
| **ACID Offline Storage** | Dexie.js IndexedDB schema with atomic table operations and `useLiveQuery` reactivity. | Creating an expense immediately updates live ledger, metrics, and debt matrix with zero network connectivity. |
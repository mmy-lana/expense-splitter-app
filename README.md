# MintSplit — Clean Finance Expense Splitter

Live Deployment: https://expense-splitter-app-eight.vercel.app

MintSplit is an offline-first expense splitter and ledger engine built with React, Ant Design, and Dexie.js (IndexedDB). It solves multi-party shared liabilities down to the minimum possible transactions using a greedy cash-flow solver with zero penny-rounding leakage.

---

## 30-Second Interactive Tour

Experience the core ledger mechanics immediately on the live deployment:

1. Switch Persona: Click the identity switcher in the top-right header to toggle between Alex, Sarah, Marcus, Elena, and Priya. Every balance, debt transfer, and ledger row recalculates from that person's vantage point.
2. Inspect Debt Simplification: Open the Kyoto Autumn Retreat ledger or check the dashboard rail to see multi-party reciprocal debts consolidated into minimal settlement transfers.
3. Record a Settlement: Click "Settle" on any suggested transfer to trigger the settlement wizard, execute an atomic transaction, and watch the debt disappear from the ledger.
4. Export and Backup: Open "Backup & restore" to download a full-fidelity JSON snapshot or inspect the RFC 4180 CSV export with formula injection sanitization.

---

## Architectural Highlights

* Greedy Minimum Cash-Flow Solver: Simplifies an N-participant graph with up to N(N-1)/2 directional debts down to at most N-1 settlement payments.
* Zero Penny Leaks: Monetary calculations are conducted in integer minor units (pennies) using BigNumber.js. Remaining cents are distributed sequentially to ensure the sum of splits matches the total to the exact cent.
* Offline ACID Persistence: All ledgers, expenses, members, and audit logs persist in IndexedDB via Dexie.js transactions. The app requires zero network calls and works completely offline.
* Defense-in-Depth Security:
  * Strict URI and base64 image validation to prevent stored cross-site scripting (XSS) on receipts and avatars.
  * Formula injection neutralization on CSV exports (escaping dangerous leading characters: `=`, `+`, `-`, `@`, `\t`, `\r`).
  * Administrative authorization guards on group mutations and sole-administrator removal prevention.
  * Synchronous submission latches preventing double-click transaction race conditions.
* Mobile-First Responsive Shell: Validated across 360px, 390px, 430px, 768px, and 1024px+ viewports with minimum 44x44px touch targets.

---

## Tech Stack

* Framework: React 19 (TypeScript)
* Build Tool: Vite
* UI Component Library: Ant Design 5 (CSS-in-JS design tokens)
* Storage Layer: Dexie.js (IndexedDB) + dexie-react-hooks
* State Management: Zustand
* Financial Math: BigNumber.js
* Date Manipulation: dayjs
* Animation & Effects: canvas-confetti

---

## Getting Started

### Prerequisites

* Node.js 20+
* pnpm (strictly enforced)

### Installation

1. Clone the repository:
   git clone https://github.com/your-username/expense-splitter-app.git
   cd expense-splitter-app

2. Install dependencies:
   pnpm install

3. Run the development server:
   pnpm run dev

4. Open http://localhost:3000 in your browser.

---

## Verification & Testing

The repository includes a dependency-free test harness that validates engine math and rendered UI contracts against production acceptance criteria:

* Run mathematical engine and snapshot verification:
  pnpm run verify:engine

* Run SSR UI rendering and accessibility verification:
  pnpm run verify:ui

* Run the full verification suite:
  pnpm run verify

* Run TypeScript type checking:
  pnpm run typecheck

---

## Data Schema & Storage Architecture

Data persists locally across four IndexedDB object stores:

* users: Local profile records with avatar references and default currency.
* groups: Ledgers with member rosters, roles (ADMIN/MEMBER), and debt simplification toggles.
* expenses: Individual financial transactions supporting multiple fractional payers, categorical tagging, receipt data URLs, and four split types (EQUAL, EXACT, PERCENT, SHARES).
* activities: Transactional audit log tracking entity mutations for historical accountability.
```

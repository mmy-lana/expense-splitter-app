/**
 * MintSplit UI verification harness.
 *
 * Renders the *real* shipped components to static markup through React's server
 * renderer and asserts on what a user (or a screen reader) would actually get:
 * formatted amounts, tone colours, fallback initials, aria labels, empty states.
 * No mocks, no snapshots — every assertion is a behavioural contract from
 * `plan.md` §2, §6 and §9.
 *
 * Run with: pnpm run verify:ui
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AvatarStack,
  BalanceBadge,
  CATEGORY_META,
  CATEGORY_OPTIONS,
  CategoryIcon,
  CategoryTag,
  CurrencyDisplay,
  EXPENSE_CATEGORIES,
  MintBadge,
  StatusPill,
  UserAvatar,
  getCategoryLabel,
  getInitials,
  hashStringToColor,
  renderMoney,
} from '../src/components/atoms';
import {
  BALANCE_TONES,
  mintPalette,
  resolveBalanceTone,
  toneLabel,
  touchTarget,
  viewportTargets,
} from '../src/theme';
import {
  ExpenseRowCompact,
  ExpenseRowItem,
  MemberBalanceCard,
  MultiPayerInput,
  SearchFilterBar,
  SplitTypeSelector,
  defaultCustomValues,
  distributeEvenly,
  isPayerDistributionBalanced,
  sumPayerAmounts,
} from '../src/components/molecules';
import {
  BalanceCallout,
  DebtSimplificationCard,
  DebtSummaryBar,
  GroupAnalytics,
  GroupLedgerTable,
  LedgerTotalsBar,
} from '../src/components/organisms';
import {
  ActivityFeedView,
  DashboardView,
  FriendsDetailView,
  FriendsListView,
  GroupDetailView,
  GroupsListView,
  ResponsiveAppShell,
  SHELL_TABS,
} from '../src/components/templates';
import { guardRoute, resolveRoute, routeForTab, selectVisibleGroups } from '../src/app/routes';
import { DEFAULT_LEDGER_FILTERS } from '../src/stores/useFilterStore';
import type {
  ActivityLog,
  DebtTransfer,
  ExpenseItem,
  Group,
  UserProfile,
  UserProfileMap,
} from '../src/types';
import {
  assert,
  assertAbsent,
  assertContains,
  assertDiffers,
  assertEqual,
  exitWithReport,
  section,
  test,
} from './harness';

/* --------------------------------------------------------------- utilities */

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(element);

const SEED_USERS = [
  { id: 'u1', name: 'Alex Rivera', avatarUrl: 'https://example.test/alex.jpg' },
  { id: 'u2', name: 'Sarah Chen', avatarUrl: '' },
  { id: 'u3', name: 'Marcus Vance', avatarUrl: '' },
  { id: 'u4', name: 'Elena Rostova', avatarUrl: '' },
  { id: 'u5', name: 'Priya Nair', avatarUrl: '' },
];

/* ------------------------------------------------------- theme token suite */

section('Design tokens \u2014 Mint palette and balance tones');

test('balance tones resolve on the half-penny boundary', () => {
  assertEqual(resolveBalanceTone(0), 'settled', 'zero is settled');
  assertEqual(resolveBalanceTone(0.004), 'settled', 'sub-penny credit is settled');
  assertEqual(resolveBalanceTone(-0.004), 'settled', 'sub-penny debt is settled');
  assertEqual(resolveBalanceTone(0.005), 'settled', 'exactly half a penny is settled');
  assertEqual(resolveBalanceTone(0.01), 'credit', 'one penny is credit');
  assertEqual(resolveBalanceTone(-0.01), 'debit', 'one penny owed is debit');
  assertEqual(resolveBalanceTone(Number.NaN), 'settled', 'NaN degrades to settled');
  assertEqual(resolveBalanceTone(Number.POSITIVE_INFINITY), 'settled', 'Infinity degrades to settled');
});

test('every tone has a distinct colour and a human label', () => {
  const colors = [BALANCE_TONES.credit.text, BALANCE_TONES.debit.text, BALANCE_TONES.settled.text];
  assertEqual(new Set(colors).size, 3, 'the three tones must not share a colour');
  assertEqual(BALANCE_TONES.credit.text, mintPalette.creditJade, 'credit uses jade');
  assertEqual(BALANCE_TONES.debit.text, mintPalette.debtCrimson, 'debit uses crimson');
  assertEqual(toneLabel('credit'), 'You are owed', 'credit label');
  assertEqual(toneLabel('debit'), 'You owe', 'debit label');
  assertEqual(toneLabel('settled'), 'Settled up', 'settled label');
});

test('the responsive contract covers the validated viewports', () => {
  assertEqual(viewportTargets.mobileSmall, 360, '360px floor');
  assertEqual(viewportTargets.mobile, 390, '390px target');
  assertEqual(viewportTargets.tablet, 768, '768px tablet');
  assertEqual(viewportTargets.desktop, 1024, '1024px desktop');
  assertEqual(viewportTargets.desktopUltra, 1440, '1440px wide desktop');
  assert(touchTarget.min >= 44, 'touch targets must be at least 44px');
});

/* ------------------------------------------------------- CurrencyDisplay */

section('CurrencyDisplay \u2014 tabular money rendering');

test('renders tabular numerals with currency-correct precision', () => {
  const usd = render(createElement(CurrencyDisplay, { amount: 1234.5, currency: 'USD' }));
  assertContains(usd, '$1234.50', 'USD keeps two decimals');
  assertContains(usd, 'font-variant-numeric:tabular-nums', 'money must be tabular');

  const jpy = render(createElement(CurrencyDisplay, { amount: 1234.5, currency: 'JPY' }));
  assertContains(jpy, '¥1235', 'JPY rounds to whole yen');
  assertContains(jpy, 'aria-label="¥1235"', 'JPY aria label');
});

test('colours by balance tone and never leaves the sign ambiguous', () => {
  const credit = render(
    createElement(CurrencyDisplay, { amount: 42, colored: true, showSign: true })
  );
  assertContains(credit, '+$42.00', 'credit carries an explicit plus');
  assertContains(credit, BALANCE_TONES.credit.text, 'credit uses the jade tone');

  const debit = render(
    createElement(CurrencyDisplay, { amount: -42, colored: true, showSign: true })
  );
  assertContains(debit, '-$42.00', 'debit carries a minus');
  assertContains(debit, BALANCE_TONES.debit.text, 'debit uses the crimson tone');

  assertDiffers(credit, debit, 'credit and debit must render differently');
});

test('renders the settled state for zero without a sign', () => {
  const zero = render(
    createElement(CurrencyDisplay, { amount: 0, colored: true, showSign: true })
  );
  assertContains(zero, '$0.00', 'zero renders as a plain amount');
  assertContains(zero, BALANCE_TONES.settled.text, 'zero uses the muted tone');
});

test('survives non-finite input instead of rendering NaN', () => {
  const nan = render(createElement(CurrencyDisplay, { amount: Number.NaN, colored: true }));
  assertContains(nan, '$0.00', 'NaN must degrade to a zero amount');
  assert(!nan.includes('NaN'), 'NaN must never reach the DOM');

  const infinite = render(createElement(CurrencyDisplay, { amount: Number.POSITIVE_INFINITY }));
  assert(!infinite.includes('Infinity'), 'Infinity must never reach the DOM');
});

test('supports compact notation, prefixes, suffixes and precision overrides', () => {
  const compact = render(
    createElement(CurrencyDisplay, { amount: 1_250_000, compact: true, tooltip: true })
  );
  assertContains(compact, '$1.3M', 'compact notation abbreviates millions');
  assertContains(compact, 'aria-label="$1250000.00"', 'compact keeps the exact value accessible');

  const prefixed = render(
    createElement(CurrencyDisplay, { amount: 12.5, prefix: 'you lent', suffix: 'each' })
  );
  // Uppercasing is a visual transform only: the DOM keeps the readable casing so
  // screen readers announce "you lent" rather than spelling out "YOU LENT".
  assertContains(prefixed, 'you lent', 'prefix text is rendered');
  assertContains(prefixed, 'text-transform:uppercase', 'prefix is uppercased visually');
  assertContains(prefixed, 'each', 'suffix is rendered');

  const precise = render(createElement(CurrencyDisplay, { amount: 10, precision: 0 }));
  assertContains(precise, '$10', 'precision override drops the decimals');
});

test('renderMoney is the single formatting contract', () => {
  assertEqual(renderMoney(33.333, 'USD'), '$33.33', 'rounds half-up to cents');
  assertEqual(renderMoney(-5, 'EUR'), '-€5.00', 'negative EUR');
  assertEqual(renderMoney(5, 'GBP', { showSign: true }), '+£5.00', 'explicit plus');
  assertEqual(renderMoney(0, 'USD', { showSign: true }), '$0.00', 'zero is never signed');
  assertEqual(renderMoney(100, 'JPY', { precision: 2 }), '¥100.00', 'precision override');
});

/* ----------------------------------------------------------- UserAvatar */

section('UserAvatar \u2014 deterministic fallback and status badge');

test('derives stable initials from awkward names', () => {
  assertEqual(getInitials('Alex Rivera'), 'AR', 'two-part name');
  assertEqual(getInitials('   Sarah   Chen  '), 'SC', 'collapses extra whitespace');
  assertEqual(getInitials('Prince'), 'PR', 'single name uses two letters');
  assertEqual(getInitials(''), '?', 'empty name falls back to a placeholder');
  assertEqual(getInitials('   '), '?', 'whitespace-only name falls back');
  assertEqual(getInitials('mary jane watson'), 'MW', 'first and last initials only');
});

test('hashes names onto the mint fallback palette deterministically', () => {
  assertEqual(
    hashStringToColor('Alex Rivera'),
    hashStringToColor('Alex Rivera'),
    'the same name always gets the same colour'
  );
  const distinct = new Set(SEED_USERS.map((user) => hashStringToColor(user.name)));
  assert(distinct.size >= 3, 'a realistic roster must not collapse onto one colour');
});

test('falls back to initials when no avatar image is configured', () => {
  const markup = render(
    createElement(UserAvatar, { name: 'Sarah Chen', avatarUrl: '', showTooltip: false })
  );
  assertContains(markup, 'SC', 'initials are rendered');
  assert(!markup.includes('<img'), 'no image element without a URL');
});

test('renders an image when a URL is configured, with an alt label', () => {
  const markup = render(
    createElement(UserAvatar, { name: 'Alex Rivera', avatarUrl: 'https://x.test/a.jpg', showTooltip: false })
  );
  assertContains(markup, '<img', 'image element is rendered');
  assertContains(markup, 'alt="Alex Rivera"', 'image carries an accessible name');
  assertContains(markup, 'loading="lazy"', 'remote avatars load lazily');
});

test('renders a tone-coloured status badge only when a status is supplied', () => {
  const withStatus = render(
    createElement(UserAvatar, { name: 'Alex Rivera', status: 'debit', statusLabel: 'Owes you $20.00', showTooltip: false })
  );
  assertContains(withStatus, BALANCE_TONES.debit.solid, 'badge uses the debit tone');
  assertContains(withStatus, 'aria-label="Owes you $20.00"', 'badge is announced');

  const withoutStatus = render(
    createElement(UserAvatar, { name: 'Alex Rivera', showTooltip: false })
  );
  assert(!withoutStatus.includes('role="img"'), 'no badge without a status');
});

test('AvatarStack collapses overflow into a +N chip', () => {
  const markup = render(createElement(AvatarStack, { users: SEED_USERS, max: 3 }));
  assertContains(markup, '+2', 'two of five avatars collapse into a counter');
  assertContains(markup, 'aria-label="5 people"', 'the stack announces its size');
});

test('AvatarStack renders nothing for an empty roster', () => {
  assertEqual(render(createElement(AvatarStack, { users: [] })), '', 'empty stack renders nothing');
});

/* --------------------------------------------------------- CategoryIcon */

section('CategoryIcon \u2014 categorical mapping');

test('every category has a label, a glyph and a distinct tint', () => {
  assertEqual(EXPENSE_CATEGORIES.length, 8, 'all eight categories are mapped');
  const backgrounds = EXPENSE_CATEGORIES.map((category) => CATEGORY_META[category].background);
  assertEqual(new Set(backgrounds).size, 8, 'each category needs its own tint');
  assertEqual(CATEGORY_OPTIONS.length, 8, 'the form exposes every category');

  for (const category of EXPENSE_CATEGORIES) {
    const meta = CATEGORY_META[category];
    assert(meta.label.length > 0, `${category} needs a label`);
    assert(meta.icon !== undefined, `${category} needs a glyph`);
  }
  assertEqual(getCategoryLabel('FOOD_AND_DRINK'), 'Food & Drink', 'label lookup');
});

test('renders an accessible glyph with a category tooltip', () => {
  const markup = render(createElement(CategoryIcon, { category: 'TRANSPORTATION', size: 42 }));
  assertContains(markup, 'role="img"', 'the glyph is exposed as an image');
  assertContains(markup, 'aria-label="Transportation"', 'glyph carries its label');
  assertContains(markup, 'width:42px', 'size is honoured');

  const quiet = render(
    createElement(CategoryIcon, { category: 'GENERAL', showTooltip: false, variant: 'solid' })
  );
  assertContains(quiet, CATEGORY_META.GENERAL.color, 'solid variant paints the container');
});

test('CategoryTag pairs the glyph with its label', () => {
  const markup = render(createElement(CategoryTag, { category: 'GROCERIES' }));
  assertContains(markup, 'Groceries', 'label is visible inline');
  assertContains(markup, CATEGORY_META.GROCERIES.background, 'tag uses the category tint');
});

test('unknown categories degrade to GENERAL instead of crashing', () => {
  const markup = render(
    createElement(CategoryIcon, {
      category: 'NOT_A_CATEGORY' as unknown as (typeof EXPENSE_CATEGORIES)[number],
      showTooltip: false,
    })
  );
  assertContains(markup, CATEGORY_META.GENERAL.color, 'unknown categories fall back to GENERAL');
});

/* ------------------------------------------------------------ MintBadge */

section('MintBadge \u2014 credit, settled and debit states');

test('renders three visually distinct states for a signed amount', () => {
  const credit = render(createElement(MintBadge, { amount: 25.5, label: 'you are owed' }));
  const settled = render(createElement(MintBadge, { amount: 0, label: 'settled' }));
  const debit = render(createElement(MintBadge, { amount: -25.5, label: 'you owe' }));

  assertContains(credit, BALANCE_TONES.credit.text, 'credit tone');
  assertContains(settled, BALANCE_TONES.settled.text, 'settled tone');
  assertContains(debit, BALANCE_TONES.debit.text, 'debit tone');

  assertDiffers(credit, settled, 'credit and settled must differ');
  assertDiffers(settled, debit, 'settled and debit must differ');
  assertDiffers(credit, debit, 'credit and debit must differ');
});

test('supports solid, outline and label-only variants', () => {
  const solid = render(
    createElement(MintBadge, { amount: 10, tone: 'credit', variant: 'solid', label: 'paid' })
  );
  assertContains(solid, BALANCE_TONES.credit.solid, 'solid variant fills with the tone');

  const outline = render(
    createElement(MintBadge, { amount: 10, tone: 'debit', variant: 'outline', label: 'owes' })
  );
  assertContains(outline, 'background-color:transparent', 'outline variant is unfilled');

  const labelOnly = render(
    createElement(MintBadge, { amount: 10, hideAmount: true, label: 'settlement' })
  );
  assertContains(labelOnly, 'settlement', 'label text is rendered');
  assertContains(labelOnly, 'text-transform:uppercase', 'label is uppercased visually');
  assert(!labelOnly.includes('$10.00'), 'amount is hidden when requested');
});

test('BalanceBadge derives its own label from the tone', () => {
  const owed = render(createElement(BalanceBadge, { amount: 12.34 }));
  assertContains(owed, 'You are owed', 'credit label');
  assertContains(owed, '+$12.34', 'credit amount');

  const owing = render(createElement(BalanceBadge, { amount: -12.34 }));
  assertContains(owing, 'You owe', 'debit label');

  const even = render(createElement(BalanceBadge, { amount: 0 }));
  assertContains(even, 'Settled', 'settled label');
});

test('StatusPill covers info and warning accents', () => {
  const info = render(createElement(StatusPill, { tone: 'info', children: 'New' }));
  assertContains(info, '#0284C7', 'info accent');

  const warning = render(createElement(StatusPill, { tone: 'warning', children: 'Pending' }));
  assertContains(warning, '#B45309', 'warning accent');

  const solid = render(
    createElement(StatusPill, { tone: 'credit', variant: 'solid', children: 'Paid' })
  );
  assertContains(solid, BALANCE_TONES.credit.solid, 'solid pill uses the tone fill');
});

/* ---------------------------------------------------- Phase 3 molecules */

const LEDGER_MEMBERS: UserProfile[] = [
  {
    id: 'user-a',
    name: 'Alex Rivera',
    email: 'alex@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-b',
    name: 'Sarah Chen',
    email: 'sarah@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-c',
    name: 'Marcus Vance',
    email: 'marcus@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const LEDGER_MEMBER_MAP: UserProfileMap = new Map(LEDGER_MEMBERS.map((user) => [user.id, user]));

const dinnerExpense: ExpenseItem = {
  id: 'exp-dinner',
  groupId: 'group-kyoto',
  description: 'Traditional Kaiseki Dinner',
  category: 'FOOD_AND_DRINK',
  amount: 320,
  currency: 'USD',
  paidBy: [{ userId: 'user-a', amountPaid: 320 }],
  splitType: 'EQUAL',
  splits: [
    { userId: 'user-a', owedAmount: 106.67 },
    { userId: 'user-b', owedAmount: 106.67 },
    { userId: 'user-c', owedAmount: 106.66 },
  ],
  date: '2026-09-01T12:00:00.000Z',
  isSettlement: false,
  createdBy: 'user-a',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const settlementExpense: ExpenseItem = {
  ...dinnerExpense,
  id: 'settle-1',
  description: 'Settlement Payment',
  category: 'GENERAL',
  amount: 50,
  paidBy: [{ userId: 'user-b', amountPaid: 50 }],
  splitType: 'EXACT',
  splits: [{ userId: 'user-a', owedAmount: 50 }],
  isSettlement: true,
};

section('ExpenseRowItem \u2014 ledger rows');

test('describes what an expense did to the signed-in user', () => {
  const lent = render(
    createElement(ExpenseRowItem, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-a',
    })
  );
  assertContains(lent, 'Traditional Kaiseki Dinner', 'description is rendered');
  assertContains(lent, 'You lent', 'the payer sees that they lent money');
  assertContains(lent, '$213.33', 'the net credit is shown');
  assertContains(lent, BALANCE_TONES.credit.text, 'credit tone');
  assertContains(lent, 'Sep 1, 2026', 'date is formatted');
  assertContains(lent, 'Paid by Alex Rivera', 'single payer is named');
  assertContains(lent, 'Equally', 'split method is surfaced');

  const borrowed = render(
    createElement(ExpenseRowItem, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-b',
    })
  );
  assertContains(borrowed, 'You borrowed', 'a participant sees that they borrowed');
  assertContains(borrowed, '$106.67', 'the owed share is shown');
  assertContains(borrowed, BALANCE_TONES.debit.text, 'debit tone');

  const uninvolved = render(
    createElement(ExpenseRowItem, {
      expense: { ...dinnerExpense, splits: [{ userId: 'user-a', owedAmount: 320 }] },
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-c',
    })
  );
  assertContains(uninvolved, 'Not involved', 'an outsider is labelled clearly');
  assertContains(uninvolved, '$320.00', 'the full amount is still shown');
});

test('renders settlements as transfers rather than spending', () => {
  const markup = render(
    createElement(ExpenseRowItem, {
      expense: settlementExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-b',
    })
  );
  assertContains(markup, 'You paid Alex', 'the payer is told who received the money');
  assertContains(markup, 'Settlement Payment', 'description is rendered');
  assertContains(markup, mintPalette.tint50, 'settlements use the mint surface');
});

test('keeps every action reachable by tap at 44px', () => {
  const markup = render(
    createElement(ExpenseRowItem, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-a',
      onDelete: () => undefined,
      onEdit: () => undefined,
      onSettle: () => undefined,
    })
  );
  assertContains(markup, 'aria-label="Delete expense"', 'delete is labelled for screen readers');
  assertContains(markup, 'aria-label="Edit expense"', 'edit is labelled');
  assertContains(markup, 'aria-label="Settle up"', 'settle is labelled');
  assertContains(markup, 'mint-touch-target', 'actions use the 44px touch-target utility');
});

test('omits actions that were not wired up', () => {
  const markup = render(
    createElement(ExpenseRowItem, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-a',
    })
  );
  assertAbsent(markup, 'aria-label="Delete expense"', 'no delete action without a handler');
  assertAbsent(markup, 'aria-label="Edit expense"', 'no edit action without a handler');
});

test('surfaces a receipt only when one is attached', () => {
  const withReceipt = render(
    createElement(ExpenseRowItem, {
      expense: { ...dinnerExpense, receiptDataUrl: 'data:image/png;base64,AAAA' },
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-a',
      onViewReceipt: () => undefined,
    })
  );
  assertContains(withReceipt, 'aria-label="View receipt"', 'receipt affordance is rendered');

  const withoutReceipt = render(
    createElement(ExpenseRowItem, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-a',
      onViewReceipt: () => undefined,
    })
  );
  assertAbsent(withoutReceipt, 'aria-label="View receipt"', 'no receipt affordance without data');
});

test('renders the compact variant as a single line', () => {
  const markup = render(
    createElement(ExpenseRowCompact, {
      expense: dinnerExpense,
      membersMap: LEDGER_MEMBER_MAP,
      currentUserId: 'user-b',
      onClick: () => undefined,
    })
  );
  assertContains(markup, 'Traditional Kaiseki Dinner', 'description');
  assertContains(markup, '$106.67', 'personal impact');
  assertAbsent(markup, 'You borrowed', 'the compact variant drops the verbose label');
});

section('MultiPayerInput \u2014 fractional payer distribution');

test('distributes a total evenly without leaking a penny', () => {
  const split = distributeEvenly(['a', 'b', 'c'], 100, 'USD');
  assertEqual(split.length, 3, 'one entry per payer');
  assertEqual(sumPayerAmounts(split), 100, 'the distribution reproduces the total');
  assertEqual(Math.max(...split.map((p) => p.amountPaid)), 33.34, 'largest share takes the residual');
  assertEqual(Math.min(...split.map((p) => p.amountPaid)), 33.33, 'smallest share');

  const jpy = distributeEvenly(['a', 'b', 'c'], 100, 'JPY');
  assert(jpy.every((payer) => Number.isInteger(payer.amountPaid)), 'JPY stays whole');
  assertEqual(sumPayerAmounts(jpy), 100, 'JPY total is preserved');

  assertEqual(distributeEvenly([], 100, 'USD').length, 0, 'no payers yields no entries');
});

test('validates the distribution to the exact penny', () => {
  assert(
    isPayerDistributionBalanced(
      [
        { userId: 'a', amountPaid: 33.33 },
        { userId: 'b', amountPaid: 33.33 },
      ],
      66.66,
      'USD'
    ),
    'a matching distribution is accepted'
  );
  assert(
    !isPayerDistributionBalanced(
      [
        { userId: 'a', amountPaid: 33.33 },
        { userId: 'b', amountPaid: 33.32 },
      ],
      66.66,
      'USD'
    ),
    'a one-penny shortfall is rejected'
  );
  assert(
    !isPayerDistributionBalanced([{ userId: 'a', amountPaid: 66.67 }], 66.66, 'USD'),
    'a one-penny overage is rejected'
  );
});

test('renders single-payer mode by default with every member selectable', () => {
  const markup = render(
    createElement(MultiPayerInput, {
      members: LEDGER_MEMBERS,
      totalAmount: 90,
      payers: [{ userId: 'user-a', amountPaid: 90 }],
      onChange: () => undefined,
    })
  );
  assertContains(markup, 'Single payer', 'single-payer mode is offered');
  assertContains(markup, 'Multiple payers', 'multi-payer mode is offered');
  assertContains(markup, 'Alex Rivera', 'members are listed');
  assertContains(markup, 'Distribution matches the expense total', 'balance is confirmed');
  assertAbsent(markup, 'still unassigned', 'no shortfall warning when balanced');
});

test('reports a shortfall and an overage when the distribution is wrong', () => {
  const short = render(
    createElement(MultiPayerInput, {
      members: LEDGER_MEMBERS,
      totalAmount: 90,
      payers: [
        { userId: 'user-a', amountPaid: 30 },
        { userId: 'user-b', amountPaid: 30 },
      ],
      onChange: () => undefined,
    })
  );
  assertContains(short, 'Allocated $60.00 of $90.00', 'shortfall is quantified');
  assertContains(short, '$30.00 still unassigned', 'the remaining amount is named');

  const over = render(
    createElement(MultiPayerInput, {
      members: LEDGER_MEMBERS,
      totalAmount: 90,
      payers: [{ userId: 'user-a', amountPaid: 120 }],
      onChange: () => undefined,
    })
  );
  assertContains(over, '$30.00 over the total', 'an overage is named');
});

test('suppresses validation when the caller opts out', () => {
  const markup = render(
    createElement(MultiPayerInput, {
      members: LEDGER_MEMBERS,
      totalAmount: 90,
      payers: [{ userId: 'user-a', amountPaid: 10 }],
      onChange: () => undefined,
      showValidation: false,
    })
  );
  assertAbsent(markup, 'still unassigned', 'validation is hidden on request');
});

section('SplitTypeSelector \u2014 EQUAL, EXACT, PERCENT and SHARES');

test('offers all four split methods and validates an equal split', () => {
  const markup = render(
    createElement(SplitTypeSelector, {
      members: LEDGER_MEMBERS,
      participantIds: ['user-a', 'user-b', 'user-c'],
      splitType: 'EQUAL',
      customValues: {},
      totalAmount: 100,
      onSplitTypeChange: () => undefined,
      onParticipantsChange: () => undefined,
      onCustomValuesChange: () => undefined,
    })
  );
  assertContains(markup, 'Equally', 'EQUAL is offered');
  assertContains(markup, 'Exact Amounts', 'EXACT is offered');
  assertContains(markup, 'Percentages', 'PERCENT is offered');
  assertContains(markup, 'Shares', 'SHARES is offered');
  assertContains(markup, 'balances to $100.00', 'the equal split is confirmed as balanced');
  assertContains(markup, 'Split between 3 of 3', 'participant count is shown');
  assertContains(markup, '$33.33', 'per-person preview is rendered');
});

test('rejects an exact split that does not reach the total', () => {
  const markup = render(
    createElement(SplitTypeSelector, {
      members: LEDGER_MEMBERS,
      participantIds: ['user-a', 'user-b', 'user-c'],
      splitType: 'EXACT',
      customValues: { 'user-a': 30, 'user-b': 25, 'user-c': 30 },
      totalAmount: 90,
      onSplitTypeChange: () => undefined,
      onParticipantsChange: () => undefined,
      onCustomValuesChange: () => undefined,
    })
  );
  assertContains(markup, 'does not match the expense total', 'the mismatch is explained');
  assertContains(markup, '5.00', 'the gap is quantified in currency');
});

test('accepts percentages that total exactly 100%', () => {
  const markup = render(
    createElement(SplitTypeSelector, {
      members: LEDGER_MEMBERS,
      participantIds: ['user-a', 'user-b', 'user-c'],
      splitType: 'PERCENT',
      customValues: { 'user-a': 33.33, 'user-b': 33.33, 'user-c': 33.34 },
      totalAmount: 100,
      onSplitTypeChange: () => undefined,
      onParticipantsChange: () => undefined,
      onCustomValuesChange: () => undefined,
    })
  );
  assertContains(markup, 'balances to $100.00', 'a valid percentage split is accepted');
  assertContains(markup, '33.34', 'percentage inputs are rendered');
});

test('reports percentages that fall short of 100%', () => {
  const markup = render(
    createElement(SplitTypeSelector, {
      members: LEDGER_MEMBERS,
      participantIds: ['user-a', 'user-b'],
      splitType: 'PERCENT',
      customValues: { 'user-a': 50, 'user-b': 40 },
      totalAmount: 100,
      onSplitTypeChange: () => undefined,
      onParticipantsChange: () => undefined,
      onCustomValuesChange: () => undefined,
    })
  );
  assertContains(markup, '100%', 'the requirement is stated');
  assertContains(markup, '90', 'the current total is shown');
});

test('blocks a split with no participants', () => {
  const markup = render(
    createElement(SplitTypeSelector, {
      members: LEDGER_MEMBERS,
      participantIds: [],
      splitType: 'EQUAL',
      customValues: {},
      totalAmount: 100,
      onSplitTypeChange: () => undefined,
      onParticipantsChange: () => undefined,
      onCustomValuesChange: () => undefined,
    })
  );
  assertContains(markup, 'at least one person', 'an empty split is explained');
});

test('seeds sensible starting values for every weighted split type', () => {
  const ids = ['a', 'b', 'c'];

  const exact = defaultCustomValues(ids, 'EXACT', 100, 'USD');
  assertEqual(sumPayerAmounts(ids.map((id) => ({ userId: id, amountPaid: exact[id] }))), 100, 'EXACT seeds the full total');

  const percent = defaultCustomValues(ids, 'PERCENT', 100, 'USD');
  const percentSum = ids.reduce((total, id) => total + percent[id], 0);
  assertEqual(Math.round(percentSum * 100) / 100, 100, 'PERCENT seeds exactly 100%');

  const shares = defaultCustomValues(ids, 'SHARES', 100, 'USD');
  assertEqual(ids.reduce((total, id) => total + shares[id], 0), 3, 'SHARES seeds one each');

  assertEqual(Object.keys(defaultCustomValues([], 'EXACT', 100, 'USD')).length, 0, 'no participants, no values');
});

section('SearchFilterBar \u2014 debounced search and filters');

const filterBarProps = {
  searchText: '',
  onSearchTextChange: () => undefined,
  categories: [],
  onCategoriesChange: () => undefined,
  splitTypes: [],
  onSplitTypesChange: () => undefined,
  sortKey: 'DATE_DESC' as const,
  onSortKeyChange: () => undefined,
  dateRange: null,
  onDateRangeChange: () => undefined,
  includeSettlements: false,
  onIncludeSettlementsChange: () => undefined,
};

test('renders search, sort, category and date controls', () => {
  const markup = render(
    createElement(SearchFilterBar, { ...filterBarProps, resultCount: 12, totalCount: 12 })
  );
  assertContains(markup, 'Search descriptions and notes…', 'search placeholder');
  assertContains(markup, 'aria-label="Search expenses"', 'search is labelled');
  assertContains(markup, 'aria-label="Sort expenses"', 'sort is labelled');
  assertContains(markup, 'aria-label="Filter by category"', 'category filter is labelled');
  assertContains(markup, 'aria-label="Filter by date range"', 'date filter is labelled');
  assertContains(markup, 'aria-label="Search and filter expenses"', 'the bar is a labelled landmark');
  assertContains(markup, '12 entries', 'result count is rendered');
});

test('explains a filtered result count and offers a reset', () => {
  const markup = render(
    createElement(SearchFilterBar, {
      ...filterBarProps,
      searchText: 'kaiseki',
      categories: ['FOOD_AND_DRINK'],
      resultCount: 3,
      totalCount: 42,
    })
  );
  assertContains(markup, '3 of 42 entries', 'filtered count is explained');
  assertContains(markup, '1 filter', 'active filter count is surfaced');
  assertContains(markup, 'aria-label="Reset search and filters"', 'a reset affordance exists');
});

test('hides the filter summary when nothing is filtered', () => {
  const markup = render(
    createElement(SearchFilterBar, { ...filterBarProps, resultCount: 5, totalCount: 5 })
  );
  assertAbsent(markup, 'filters', 'no filter chip without filters');
  assertAbsent(markup, 'aria-label="Reset search and filters"', 'no reset without filters');
});

section('MemberBalanceCard \u2014 friend balance tiles');

test('states the direction of a balance in words and colour', () => {
  const owed = render(
    createElement(MemberBalanceCard, {
      user: LEDGER_MEMBERS[1],
      netBalance: 42.5,
      totalPaid: 120,
      totalOwed: 77.5,
      sharedExpenseCount: 4,
    })
  );
  assertContains(owed, 'Sarah Chen', 'name');
  assertContains(owed, 'owes you', 'credit direction');
  assertContains(owed, '$42.50', 'amount');
  assertContains(owed, BALANCE_TONES.credit.text, 'credit tone');
  assertContains(owed, '4 shared', 'shared expense count');

  const owing = render(
    createElement(MemberBalanceCard, { user: LEDGER_MEMBERS[2], netBalance: -18.25 })
  );
  assertContains(owing, 'you owe', 'debit direction');
  assertContains(owing, BALANCE_TONES.debit.text, 'debit tone');

  const even = render(
    createElement(MemberBalanceCard, { user: LEDGER_MEMBERS[2], netBalance: 0 })
  );
  assertContains(even, 'settled up', 'settled direction');
  assertAbsent(even, 'Settle', 'no settle action when nothing is outstanding');
});

test('only offers the settle action when a balance is outstanding', () => {
  const withAction = render(
    createElement(MemberBalanceCard, {
      user: LEDGER_MEMBERS[1],
      netBalance: 10,
      onSettle: () => undefined,
    })
  );
  assertContains(withAction, 'Settle', 'settle is offered for an outstanding balance');

  const noAction = render(
    createElement(MemberBalanceCard, {
      user: LEDGER_MEMBERS[1],
      netBalance: 0,
      onSettle: () => undefined,
    })
  );
  assertAbsent(noAction, '>Settle<', 'settle is withheld once settled');
});

test('renders a selection affordance only when selectable', () => {
  const selectable = render(
    createElement(MemberBalanceCard, {
      user: LEDGER_MEMBERS[1],
      netBalance: 10,
      onSelect: () => undefined,
      selected: true,
    })
  );
  assertContains(selectable, '<button', 'the tile becomes a button');
  assertContains(selectable, 'aria-pressed="true"', 'selection is announced');
  assertContains(selectable, mintPalette.tint50, 'the selected tile is tinted');

  const staticTile = render(
    createElement(MemberBalanceCard, { user: LEDGER_MEMBERS[1], netBalance: 10 })
  );
  assertAbsent(staticTile, '<button', 'a non-selectable tile is not a button');
});

/* ---------------------------------------------------- Phase 4 organisms */

const ORG_MEMBERS: UserProfile[] = [
  { ...LEDGER_MEMBERS[0] },
  { ...LEDGER_MEMBERS[1] },
  { ...LEDGER_MEMBERS[2] },
];
const ORG_MEMBER_MAP: UserProfileMap = new Map(ORG_MEMBERS.map((user) => [user.id, user]));

/** a pays 90 for a and b, so b owes a 45. */
const ORG_EXPENSES: ExpenseItem[] = [
  {
    id: 'org-1',
    groupId: 'group-kyoto',
    description: 'Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 90,
    currency: 'USD',
    paidBy: [{ userId: 'user-a', amountPaid: 90 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-a', owedAmount: 45 },
      { userId: 'user-b', owedAmount: 45 },
    ],
    date: '2026-09-10T12:00:00.000Z',
    isSettlement: false,
    createdBy: 'user-a',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
  },
  {
    id: 'org-2',
    groupId: 'group-kyoto',
    description: 'Rail Passes',
    category: 'TRANSPORTATION',
    amount: 60,
    currency: 'USD',
    paidBy: [{ userId: 'user-b', amountPaid: 60 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-a', owedAmount: 30 },
      { userId: 'user-b', owedAmount: 30 },
    ],
    date: '2026-09-12T12:00:00.000Z',
    isSettlement: false,
    createdBy: 'user-b',
    createdAt: '2026-09-12T12:00:00.000Z',
    updatedAt: '2026-09-12T12:00:00.000Z',
  },
];

const ORG_TRANSFERS: DebtTransfer[] = [
  { fromUserId: 'user-b', toUserId: 'user-a', amount: 15, currency: 'USD' },
];

section('DebtSimplificationCard \u2014 settlement plan visualisation');

test('celebrates a fully settled ledger', () => {
  const markup = render(
    createElement(DebtSimplificationCard, {
      transfers: [],
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      groupName: 'Kyoto Autumn Retreat',
    })
  );
  assertContains(markup, 'All settled up', 'the empty state is affirmative');
  assertContains(markup, 'Kyoto Autumn Retreat', 'the ledger is named');
});

test('renders each suggested transfer with its direction and amount', () => {
  const markup = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      groupName: 'Kyoto Autumn Retreat',
      onSettleTransfer: () => undefined,
    })
  );
  assertContains(markup, 'Simplified settlements', 'the card is titled');
  assertContains(markup, '$15.00', 'the transfer amount is shown');
  assertContains(markup, 'Settle', 'an actionable transfer offers the action');
  assertContains(markup, '1 payment', 'the plan size is stated');
});

test('withholds the settle action when no handler is wired up', () => {
  const markup = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
    })
  );
  assertAbsent(markup, '>Settle<', 'no action is offered without a handler');
});

test('labels the direction from the signed-in user\'s point of view', () => {
  const receiving = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
    })
  );
  assertContains(receiving, 'you receive', 'the receiver is told they receive');
  assertContains(receiving, 'Your part of the plan', 'their position is summarised');

  const paying = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-b',
    })
  );
  assertContains(paying, 'you pay', 'the payer is told they pay');
});

test('explains how many transfers the solver avoided', () => {
  const markup = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      rawDebtCount: 6,
    })
  );
  assertContains(markup, '6 separate debts into 1 payment', 'the saving is quantified');
  assertContains(markup, '5 transfers avoided', 'the number avoided is stated');
});

test('tells an uninvolved user that nothing concerns them', () => {
  const markup = render(
    createElement(DebtSimplificationCard, {
      transfers: ORG_TRANSFERS,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-c',
      showAllTransfers: false,
    })
  );
  assertContains(markup, 'You are not involved', 'an outsider is told plainly');
});

test('DebtSummaryBar nets the plan for one person', () => {
  const markup = render(
    createElement(DebtSummaryBar, {
      transfers: ORG_TRANSFERS,
      currentUserId: 'user-b',
      rawDebtCount: 6,
      currency: 'USD',
    })
  );
  assertContains(markup, 'You owe', 'a net payer is told they owe');
  assertContains(markup, '$15.00', 'the net amount');
  assertContains(markup, '6 raw debts → 1 payment', 'the consolidation is stated');
});

section('GroupLedgerTable \u2014 ledger rendering');

test('offers a single call to action when the ledger is empty', () => {
  const markup = render(
    createElement(GroupLedgerTable, {
      expenses: [],
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      groupName: 'Kyoto Autumn Retreat',
      onAddExpense: () => undefined,
      forceViewMode: 'CARDS',
    })
  );
  assertContains(markup, 'Kyoto Autumn Retreat has no expenses yet', 'the empty state is specific');
  assertContains(markup, 'Add the first expense', 'a way forward is offered');
});

test('distinguishes "no matches" from "nothing recorded"', () => {
  const markup = render(
    createElement(GroupLedgerTable, {
      expenses: [],
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      totalCount: 42,
      forceViewMode: 'CARDS',
    })
  );
  assertContains(markup, 'No expenses match the current filters', 'filtering is explained');
  assertContains(markup, '42 in this ledger', 'the unfiltered total is offered');
});

test('renders the card presentation for phones', () => {
  const markup = render(
    createElement(GroupLedgerTable, {
      expenses: ORG_EXPENSES,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      forceViewMode: 'CARDS',
      paginated: false,
    })
  );
  assertContains(markup, 'Kaiseki Dinner', 'rows are rendered');
  assertContains(markup, 'Rail Passes', 'every row is rendered');
  assertAbsent(markup, '<table', 'the card presentation is not a table');
  assertContains(markup, '2 of 2 entries', 'the row count is stated');
});

test('renders the table presentation for desktop with aligned money', () => {
  const markup = render(
    createElement(GroupLedgerTable, {
      expenses: ORG_EXPENSES,
      membersMap: ORG_MEMBER_MAP,
      currentUserId: 'user-a',
      forceViewMode: 'TABLE',
      paginated: false,
    })
  );
  assertContains(markup, '<table', 'the table presentation uses a real table');
  assertContains(markup, 'Your share', 'the personal impact column exists');
  assertContains(markup, 'Equally', 'the split method is shown');
  assertContains(markup, 'font-variant-numeric:tabular-nums', 'money columns are tabular');
});

test('LedgerTotalsBar separates spending from settlements', () => {
  const markup = render(
    createElement(LedgerTotalsBar, {
      expenses: [
        ...ORG_EXPENSES,
        {
          ...ORG_EXPENSES[0],
          id: 'org-settle',
          description: 'Settlement Payment',
          amount: 20,
          isSettlement: true,
          paidBy: [{ userId: 'user-b', amountPaid: 20 }],
          splits: [{ userId: 'user-a', owedAmount: 20 }],
        },
      ],
      currency: 'USD',
      currentUserId: 'user-a',
    })
  );
  assertContains(markup, 'Spending', 'spending is labelled');
  assertContains(markup, 'Settlements', 'settlements are labelled separately');
  assertContains(markup, '$150.00', 'spending excludes the settlement');
  assertContains(markup, '$20.00', 'the settlement is reported on its own');
});

section('GroupAnalytics \u2014 spending insight panels');

test('explains an empty ledger instead of rendering empty charts', () => {
  const markup = render(
    createElement(GroupAnalytics, {
      expenses: [],
      membersMap: ORG_MEMBER_MAP,
      members: ORG_MEMBERS,
      groupName: 'Kyoto Autumn Retreat',
    })
  );
  assertContains(markup, 'nothing to analyse', 'the empty state explains itself');
});

test('renders headline metrics, categories, payers and balances', () => {
  const markup = render(
    createElement(GroupAnalytics, {
      expenses: ORG_EXPENSES,
      membersMap: ORG_MEMBER_MAP,
      members: ORG_MEMBERS,
      currency: 'USD',
    })
  );
  assertContains(markup, 'Total spend', 'total spend tile');
  assertContains(markup, '$150.00', 'the total is correct (90 + 60)');
  assertContains(markup, 'Average expense', 'average tile');
  assertContains(markup, '$75.00', 'the average is correct');
  assertContains(markup, 'Spending by category', 'category panel');
  // `&` is escaped in markup, so the assertion uses the serialised form.
  assertContains(markup, 'Food &amp; Drink', 'a category is labelled');
  assertContains(markup, 'Who fronted the money', 'payer panel');
  assertContains(markup, 'Member balances', 'balance panel');
  assertContains(markup, 'Monthly spend', 'burn panel');
});

test('renders only the requested panels', () => {
  const markup = render(
    createElement(GroupAnalytics, {
      expenses: ORG_EXPENSES,
      membersMap: ORG_MEMBER_MAP,
      members: ORG_MEMBERS,
      panels: ['CATEGORIES'],
    })
  );
  assertContains(markup, 'Spending by category', 'the requested panel renders');
  assertAbsent(markup, 'Who fronted the money', 'unrequested panels are omitted');
  assertAbsent(markup, 'Member balances', 'unrequested panels are omitted');
});

test('excludes settlements from spending analytics', () => {
  const markup = render(
    createElement(GroupAnalytics, {
      expenses: [
        ...ORG_EXPENSES,
        {
          ...ORG_EXPENSES[0],
          id: 'org-settle-2',
          amount: 500,
          isSettlement: true,
        },
      ],
      membersMap: ORG_MEMBER_MAP,
      members: ORG_MEMBERS,
      panels: ['CATEGORIES'],
    })
  );
  assertContains(markup, '$150.00', 'a 500 settlement does not inflate the spend total');
  assertAbsent(markup, '$650.00', 'settlements are never counted as spending');
});

test('BalanceCallout states direction in words and colour', () => {
  const owed = render(
    createElement(BalanceCallout, { label: 'Net balance', amount: 42.5, currency: 'USD' })
  );
  assertContains(owed, 'Net balance', 'the label is shown');
  assertContains(owed, '$42.50', 'the amount is shown');
  assertContains(owed, BALANCE_TONES.credit.surface, 'a credit uses the jade surface');

  const owing = render(
    createElement(BalanceCallout, { label: 'Net balance', amount: -42.5, currency: 'USD' })
  );
  assertContains(owing, BALANCE_TONES.debit.surface, 'a debt uses the rose surface');
  assertDiffers(owed, owing, 'the two directions render differently');
});

/* ----------------------------------------------------- Phase 5 templates */

const TPL_MEMBERS: UserProfile[] = [
  {
    id: 'user-a',
    name: 'Alex Rivera',
    email: 'alex@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-b',
    name: 'Sarah Chen',
    email: 'sarah@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-c',
    name: 'Marcus Vance',
    email: 'marcus@mintsplit.app',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const TPL_MEMBER_MAP: UserProfileMap = new Map(TPL_MEMBERS.map((user) => [user.id, user]));

const TPL_GROUP: Group = {
  id: 'group-kyoto',
  name: 'Kyoto Autumn Retreat',
  category: 'TRIP',
  description: 'Ryokan nights and rail passes.',
  currency: 'USD',
  avatarIcon: 'CompassOutlined',
  simplifyDebts: true,
  members: TPL_MEMBERS.map((user) => ({
    userId: user.id,
    joinedAt: '2026-01-01T00:00:00.000Z',
    role: user.id === 'user-a' ? ('ADMIN' as const) : ('MEMBER' as const),
  })),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** a pays 90 for a+b; b pays 60 for a+b. Net: a is owed 15. */
const TPL_EXPENSES: ExpenseItem[] = [
  {
    id: 'tpl-1',
    groupId: 'group-kyoto',
    description: 'Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 90,
    currency: 'USD',
    paidBy: [{ userId: 'user-a', amountPaid: 90 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-a', owedAmount: 45 },
      { userId: 'user-b', owedAmount: 45 },
    ],
    date: '2026-09-10T12:00:00.000Z',
    isSettlement: false,
    createdBy: 'user-a',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
  },
  {
    id: 'tpl-2',
    groupId: 'group-kyoto',
    description: 'Rail Passes',
    category: 'TRANSPORTATION',
    amount: 60,
    currency: 'USD',
    paidBy: [{ userId: 'user-b', amountPaid: 60 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-a', owedAmount: 30 },
      { userId: 'user-b', owedAmount: 30 },
    ],
    date: '2026-09-12T12:00:00.000Z',
    isSettlement: false,
    createdBy: 'user-b',
    createdAt: '2026-09-12T12:00:00.000Z',
    updatedAt: '2026-09-12T12:00:00.000Z',
  },
];

const TPL_ACTIVITIES: ActivityLog[] = [
  {
    id: 'act-1',
    groupId: 'group-kyoto',
    actorUserId: 'user-a',
    action: 'EXPENSE_CREATED',
    entityId: 'tpl-1',
    metadata: { description: 'Kaiseki Dinner', amount: 90, currency: 'USD' },
    timestamp: '2026-09-10T12:00:00.000Z',
  },
  {
    id: 'act-2',
    groupId: 'group-kyoto',
    actorUserId: 'user-b',
    action: 'SETTLEMENT_RECORDED',
    entityId: 'tpl-2',
    metadata: { description: 'Rail Passes', amount: 60, currency: 'USD' },
    timestamp: '2026-09-12T12:00:00.000Z',
  },
];

const TPL_FILTERS = { ...DEFAULT_LEDGER_FILTERS };

const noop = (): void => undefined;

const GROUP_SUMMARIES = [
  {
    group: TPL_GROUP,
    memberCount: 3,
    expenseCount: 2,
    totalSpend: 150,
    myNetBalance: 15,
    lastActivityAt: '2026-09-12T12:00:00.000Z',
  },
];

section('ResponsiveAppShell \u2014 cross-viewport chrome');

test('renders the brand, navigation and primary actions', () => {
  const markup = render(
    createElement(ResponsiveAppShell, {
        users: TPL_MEMBERS,
        groups: [TPL_GROUP],
        currentUserId: 'user-a',
        activeTab: 'DASHBOARD',
        onTabChange: noop,
        onSwitchUser: noop,
        onAddExpense: noop,
        onSettleUp: noop,
        onOpenBackup: noop,
        onNewGroup: noop,
        netBalance: 15,
        currency: 'USD',
        pendingTransferCount: 1,
        children: createElement('div', null, 'VIEW_CONTENT'),
      })
  );

  // The brand is `Mint<span>Split</span>`, so the words are separate text nodes.
  assertContains(markup, '>Mint<', 'the brand prefix is rendered');
  assertContains(markup, '>Split</span>', 'the brand suffix is rendered in the accent colour');
  assertContains(markup, 'VIEW_CONTENT', 'children are rendered inside the shell');
  assertContains(markup, 'aria-label="Add an expense"', 'the add action is labelled');
  assertContains(markup, 'aria-label="Record a payment"', 'the settle action is labelled');
  assertContains(markup, 'aria-label="Switch who you are"', 'the identity switcher is labelled');
});

test('exposes the four validated navigation destinations', () => {
  for (const tab of SHELL_TABS) {
    assert(
      ['DASHBOARD', 'GROUPS', 'FRIENDS', 'ACTIVITY'].includes(tab.key),
      `${tab.key} is one of the four destinations`
    );
    assert(tab.label.length > 0, `${tab.key} has a label`);
  }
  assertEqual(SHELL_TABS.length, 4, 'exactly four destinations');
});

test('the bottom navigation is marked so desktop CSS can hide it', () => {
  // Server rendering has no viewport, so `useResponsive` reports the mobile
  // layout; the nav must therefore carry the class the stylesheet keys on.
  const markup = render(
    createElement(ResponsiveAppShell, {
        users: TPL_MEMBERS,
        groups: [TPL_GROUP],
        currentUserId: 'user-a',
        activeTab: 'GROUPS',
        onTabChange: noop,
        onSwitchUser: noop,
        onAddExpense: noop,
        onSettleUp: noop,
        onOpenBackup: noop,
        onNewGroup: noop,
        children: null,
      })
  );
  assertContains(markup, 'mobile-bottom-nav', 'the nav is classed for the responsive stylesheet');
  assertContains(markup, 'aria-label="Primary navigation"', 'the nav is a labelled landmark');
  assertContains(markup, 'aria-current="page"', 'the active destination is announced');
});

section('DashboardView \u2014 aggregate position and ledgers');

test('states the net position, both directions and the ledgers', () => {
  const markup = render(
    createElement(DashboardView, {
      currentUserId: 'user-a',
      users: TPL_MEMBERS,
      groups: [TPL_GROUP],
      expenses: TPL_EXPENSES,
      membersMap: TPL_MEMBER_MAP,
      currency: 'USD',
      groupSummaries: GROUP_SUMMARIES,
      onSelectGroup: noop,
      onSelectFriend: noop,
      onAddExpense: noop,
      onNewGroup: noop,
      onSettleUp: noop,
      onSettleTransfer: noop,
      onOpenExpense: noop,
      onViewReceipt: noop,
      onDeleteExpense: noop,
    })
  );

  assertContains(markup, 'Net balance', 'the net tile is present');
  assertContains(markup, 'Owed to you', 'the credit side is labelled');
  assertContains(markup, 'You owe', 'the debit side is labelled');
  assertContains(markup, 'Kyoto Autumn Retreat', 'the ledger is listed');
  assertContains(markup, 'People you split with', 'the friends section is present');
  assertContains(markup, 'Recent activity', 'recent expenses are listed');
  assertContains(markup, 'Simplified settlements', 'the settlement plan is shown');
  assertContains(markup, '$15.00', 'the net position is stated (90 vs 45+30 share split)');
});

test('offers a first action when the ledger is empty', () => {
  const markup = render(
    createElement(DashboardView, {
      currentUserId: 'user-a',
      users: TPL_MEMBERS,
      groups: [],
      expenses: [],
      membersMap: TPL_MEMBER_MAP,
      groupSummaries: [],
      onSelectGroup: noop,
      onSelectFriend: noop,
      onAddExpense: noop,
      onNewGroup: noop,
      onSettleUp: noop,
      onSettleTransfer: noop,
      onOpenExpense: noop,
      onViewReceipt: noop,
      onDeleteExpense: noop,
    })
  );
  assertContains(markup, 'No expenses yet', 'the empty state is honest');
  assertContains(markup, 'Add your first expense', 'a first action is offered');
});

test('renders a skeleton instead of a wrong number while loading', () => {
  const markup = render(
    createElement(DashboardView, {
      currentUserId: 'user-a',
      users: TPL_MEMBERS,
      groups: [],
      expenses: [],
      membersMap: TPL_MEMBER_MAP,
      groupSummaries: [],
      loading: true,
      onSelectGroup: noop,
      onSelectFriend: noop,
      onAddExpense: noop,
      onNewGroup: noop,
      onSettleUp: noop,
      onSettleTransfer: noop,
      onOpenExpense: noop,
      onViewReceipt: noop,
      onDeleteExpense: noop,
    })
  );
  assertContains(markup, 'ant-skeleton', 'a skeleton is rendered');
  assertAbsent(markup, 'Net balance', 'no figures are shown before the data arrives');
});

section('GroupDetailView \u2014 ledger, balances and analytics');

test('renders the header facts and all three tabs', () => {
  const markup = render(
    createElement(GroupDetailView, {
      group: TPL_GROUP,
      members: TPL_MEMBERS,
      membersMap: TPL_MEMBER_MAP,
      currentUserId: 'user-a',
      expenses: TPL_EXPENSES,
      filters: TPL_FILTERS,
      filteredExpenses: TPL_EXPENSES,
      onBack: noop,
      onAddExpense: noop,
      onEditGroup: noop,
      onAddMember: noop,
      onRemoveMember: noop,
      onDeleteGroup: noop,
      onSelectFriend: noop,
      onEditExpense: noop,
      onDeleteExpense: noop,
      onViewReceipt: noop,
      onSettleTransfer: noop,
      onSettleMember: noop,
    })
  );

  assertContains(markup, 'Kyoto Autumn Retreat', 'the group name is the heading');
  assertContains(markup, 'Ryokan nights and rail passes.', 'the description is shown');
  assertContains(markup, 'Total spend', 'total spend is reported');
  assertContains(markup, '$150.00', 'the total is correct (90 + 60)');
  assertContains(markup, 'Your position', 'the member position is shown');
  assertContains(markup, 'Ledger (2)', 'the ledger tab counts its rows');
  assertContains(markup, 'Balances', 'the balances tab exists');
  assertContains(markup, 'Analytics', 'the analytics tab exists');
  assertContains(markup, 'simplified', 'the simplification setting is surfaced');
});

test('handles a group with no expenses without breaking', () => {
  const markup = render(
    createElement(GroupDetailView, {
      group: TPL_GROUP,
      members: TPL_MEMBERS,
      membersMap: TPL_MEMBER_MAP,
      currentUserId: 'user-a',
      expenses: [],
      filters: TPL_FILTERS,
      filteredExpenses: [],
      onBack: noop,
      onAddExpense: noop,
      onEditGroup: noop,
      onAddMember: noop,
      onRemoveMember: noop,
      onDeleteGroup: noop,
      onSelectFriend: noop,
      onEditExpense: noop,
      onDeleteExpense: noop,
      onViewReceipt: noop,
      onSettleTransfer: noop,
      onSettleMember: noop,
    })
  );
  assertContains(markup, 'Kyoto Autumn Retreat', 'the header still renders');
  assertContains(markup, 'Ledger (0)', 'the empty ledger tab is counted correctly');
  assertContains(
    markup,
    'has no expenses yet',
    'the ledger empty state names the group'
  );
});

section('FriendsDetailView \u2014 pairwise ledger');

test('states the pairwise position and the shared ledger', () => {
  const markup = render(
    createElement(FriendsDetailView, {
      currentUserId: 'user-a',
      friend: TPL_MEMBERS[1],
      users: TPL_MEMBERS,
      groups: [TPL_GROUP],
      expenses: TPL_EXPENSES,
      membersMap: TPL_MEMBER_MAP,
      currency: 'USD',
      onBack: noop,
      onSelectFriend: noop,
      onAddExpense: noop,
      onSettleUp: noop,
      onEditExpense: noop,
      onDeleteExpense: noop,
      onViewReceipt: noop,
    })
  );

  assertContains(markup, 'Sarah Chen', 'the friend is named');
  assertContains(markup, 'Shared ledger (2)', 'every shared expense is listed');
  assertContains(markup, 'Between you two', 'the pairwise panel is present');
  assertContains(markup, 'owes you', 'the direction is stated in words');
  assertContains(markup, '$15.00', 'the pairwise net is stated (b owes a 45, a owes b 30)');
  assertContains(markup, 'in your favour', 'the direction is restated');
});

test('offers a first expense when nothing is shared', () => {
  const markup = render(
    createElement(FriendsDetailView, {
      currentUserId: 'user-a',
      friend: TPL_MEMBERS[1],
      users: TPL_MEMBERS,
      groups: [],
      expenses: [],
      membersMap: TPL_MEMBER_MAP,
      currency: 'USD',
      onBack: noop,
      onSelectFriend: noop,
      onAddExpense: noop,
      onSettleUp: noop,
      onEditExpense: noop,
      onDeleteExpense: noop,
      onViewReceipt: noop,
    })
  );
  assertContains(markup, 'have not split anything yet', 'the empty state is specific');
  assertContains(markup, 'Add the first expense', 'a way forward is offered');
});

section('ActivityFeedView \u2014 audit trail');

test('groups entries by day and links them to their expense', () => {
  const markup = render(
    createElement(ActivityFeedView, {
      activities: TPL_ACTIVITIES,
      expenses: TPL_EXPENSES,
      groups: [TPL_GROUP],
      membersMap: TPL_MEMBER_MAP,
      currentUserId: 'user-a',
      currency: 'USD',
      onSelectExpense: noop,
      onSelectGroup: noop,
    })
  );

  assertContains(markup, 'Activity', 'the view is titled');
  assertContains(markup, 'Kaiseki Dinner', 'the recorded description is shown');
  assertContains(markup, 'You', 'the signed-in actor is named in the first person');
  assertContains(markup, 'Kyoto Autumn Retreat', 'the ledger is labelled on the entry');
  assertContains(markup, 'Open expense', 'actionable entries link to their expense');
  assertContains(markup, '2 entries', 'the entry count is stated');
});

test('explains an empty audit trail', () => {
  const markup = render(
    createElement(ActivityFeedView, {
      activities: [],
      expenses: [],
      groups: [],
      membersMap: TPL_MEMBER_MAP,
      currentUserId: 'user-a',
    })
  );
  assertContains(markup, 'No activity recorded yet', 'the empty state explains how entries appear');
});

section('List views \u2014 groups and people');

test('GroupsListView summarises each ledger and lists group expenses', () => {
  const markup = render(
    createElement(GroupsListView, {
      groupSummaries: GROUP_SUMMARIES,
      expenses: TPL_EXPENSES,
      membersMap: TPL_MEMBER_MAP,
      currentUserId: 'user-a',
      currency: 'USD',
      filters: TPL_FILTERS,
      onSelectGroup: noop,
      onNewGroup: noop,
      onAddExpense: noop,
      onEditExpense: noop,
      onDeleteExpense: noop,
      onViewReceipt: noop,
    })
  );

  assertContains(markup, 'Groups', 'the view is titled');
  assertContains(markup, '1 ledger you belong to', 'the ledger count is stated');
  assertContains(markup, 'Kyoto Autumn Retreat', 'the group is listed');
  assertContains(markup, '3 members', 'the member count is shown');
  assertContains(markup, 'Your position', 'the personal position is shown');
  assertContains(markup, '$150.00 spent', 'the ledger spend is shown');
  assertContains(markup, 'Every group expense', 'the cross-group feed is present');
});

test('FriendsListView orders people by how much is at stake', () => {
  const markup = render(
    createElement(FriendsListView, {
      users: TPL_MEMBERS,
      expenses: TPL_EXPENSES,
      currentUserId: 'user-a',
      currency: 'USD',
      onSelectFriend: noop,
      onSettleUp: noop,
    })
  );

  assertContains(markup, 'People', 'the view is titled');
  assertContains(markup, 'Net balance with everyone', 'the aggregate is stated');
  assertContains(markup, 'Sarah Chen', 'a counterparty with a live balance is listed');
  assertContains(markup, '$15.00', 'the outstanding amount is shown');
  assertContains(markup, 'owes you', 'the direction is stated');
  assertContains(markup, '1 person shares a ledger with you', 'the count agrees with the list');
  // A saved contact with no shared expense and no balance is not a ledger entry.
  assertAbsent(markup, 'Marcus Vance', 'people with nothing at stake are omitted');
});

test('FriendsListView hides people with no dealings and no balance', () => {
  const markup = render(
    createElement(FriendsListView, {
      users: TPL_MEMBERS,
      expenses: [],
      currentUserId: 'user-a',
      currency: 'USD',
      onSelectFriend: noop,
      onSettleUp: noop,
    })
  );
  assertContains(markup, 'not split anything together yet', 'the empty state explains why');
});

/* ------------------------------------------------------ responsive routing */

section('Routing \u2014 view resolution and guards');

test('each tab resolves to its own route and title', () => {
  assertEqual(resolveRoute({ name: 'DASHBOARD' }).tab, 'DASHBOARD', 'dashboard tab');
  assertEqual(resolveRoute({ name: 'GROUPS' }).tab, 'GROUPS', 'groups tab');
  assertEqual(resolveRoute({ name: 'FRIENDS' }).tab, 'FRIENDS', 'friends tab');
  assertEqual(resolveRoute({ name: 'ACTIVITY' }).tab, 'ACTIVITY', 'activity tab');
  assertEqual(
    resolveRoute({ name: 'GROUP_DETAIL', groupId: 'g' }).tab,
    'GROUPS',
    'a group detail keeps the groups tab active'
  );
  assertEqual(
    resolveRoute({ name: 'FRIEND_DETAIL', friendId: 'u' }).tab,
    'FRIENDS',
    'a friend detail keeps the friends tab active'
  );
  assertContains(resolveRoute({ name: 'GROUP_DETAIL', groupId: 'g' }).title, 'Group', 'group title');
});

test('a drilled-into entity that no longer exists falls back to its list', () => {
  const context = { groupIds: new Set(['group-live']), userIds: new Set(['user-live']) };

  assertEqual(
    guardRoute({ name: 'GROUP_DETAIL', groupId: 'group-deleted' }, context).name,
    'GROUPS',
    'a deleted group falls back'
  );
  assertEqual(
    guardRoute({ name: 'FRIEND_DETAIL', friendId: 'user-deleted' }, context).name,
    'FRIENDS',
    'a deleted person falls back'
  );
  assertEqual(
    guardRoute({ name: 'GROUP_DETAIL', groupId: 'group-live' }, context).name,
    'GROUP_DETAIL',
    'a live group is left alone'
  );
  assertEqual(guardRoute({ name: 'DASHBOARD' }, context).name, 'DASHBOARD', 'plain routes pass through');
});

test('only the groups a person belongs to are listed for them', () => {
  const other: Group = {
    ...TPL_GROUP,
    id: 'group-other',
    name: 'Someone else\x27s trip',
    members: [{ userId: 'user-zzz', joinedAt: '2026-01-01T00:00:00.000Z', role: 'ADMIN' }],
  };
  const visible = selectVisibleGroups([TPL_GROUP, other], 'user-a');
  assertEqual(visible.length, 1, 'only the membership group is visible');
  assertEqual(visible[0].id, 'group-kyoto', 'the right group is returned');
});

test('every tab the shell renders resolves to a route', () => {
  for (const tab of SHELL_TABS) {
    const route = routeForTab(tab.key);
    assertEqual(resolveRoute(route).tab, tab.key, `${tab.key} round-trips through its route`);
  }
});

/* ---------------------------------------------------------------- reporting */

exitWithReport();
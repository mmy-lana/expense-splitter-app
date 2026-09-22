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
import type { ExpenseItem, UserProfile, UserProfileMap } from '../src/types';
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

/* ---------------------------------------------------------------- reporting */

exitWithReport();
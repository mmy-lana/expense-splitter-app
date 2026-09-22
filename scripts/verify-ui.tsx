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
import { assert, assertContains, assertEqual, assertDiffers, exitWithReport, section, test } from './harness';

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

/* ---------------------------------------------------------------- reporting */

exitWithReport();

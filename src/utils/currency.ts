import BigNumber from 'bignumber.js';
import type { CurrencyCode, CurrencyConfig } from '../types';

/**
 * Offline-first currency toolkit.
 *
 * All conversions between major units (what the UI shows) and minor units
 * (integer pennies, what the engines split on) funnel through BigNumber so a
 * ledger can never accumulate binary floating point drift.
 */

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

/**
 * Static, bundled rate table. MintSplit is an offline application: rates are a
 * documented snapshot rather than a live feed, and are only used for the
 * informational "approx. in base currency" readouts.
 */
export const CURRENCY_CONFIGS: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', decimals: 2, exchangeRateToBase: 1 },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, exchangeRateToBase: 1.08 },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, exchangeRateToBase: 1.27 },
  JPY: { code: 'JPY', symbol: '¥', decimals: 0, exchangeRateToBase: 0.0064 },
  CAD: { code: 'CAD', symbol: 'CA$', decimals: 2, exchangeRateToBase: 0.73 },
  AUD: { code: 'AUD', symbol: 'AU$', decimals: 2, exchangeRateToBase: 0.66 },
  INR: { code: 'INR', symbol: '₹', decimals: 2, exchangeRateToBase: 0.012 },
  SGD: { code: 'SGD', symbol: 'SG$', decimals: 2, exchangeRateToBase: 0.74 },
};

export const CURRENCY_CODES: CurrencyCode[] = Object.keys(CURRENCY_CONFIGS) as CurrencyCode[];

export const BASE_CURRENCY: CurrencyCode = 'USD';

/** Balances smaller than half a penny are treated as settled. */
export const ZERO_EPSILON = 0.005;

export function getCurrencyConfig(currency: CurrencyCode = BASE_CURRENCY): CurrencyConfig {
  return CURRENCY_CONFIGS[currency] ?? CURRENCY_CONFIGS[BASE_CURRENCY];
}

export function getCurrencySymbol(currency: CurrencyCode = BASE_CURRENCY): string {
  return CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS[BASE_CURRENCY];
}

export function getCurrencyDecimals(currency: CurrencyCode = BASE_CURRENCY): number {
  return getCurrencyConfig(currency).decimals;
}

/** Multiplier that converts major units into integer minor units. */
export function getMinorUnitFactor(currency: CurrencyCode = BASE_CURRENCY): number {
  return 10 ** getCurrencyDecimals(currency);
}

export function currencyLabel(currency: CurrencyCode): string {
  return `${currency} (${getCurrencySymbol(currency)})`;
}

/** Round a major-unit amount to the currency's smallest representable value. */
export function roundToCurrency(amount: number, currency: CurrencyCode = BASE_CURRENCY): number {
  const decimals = getCurrencyDecimals(currency);
  return new BigNumber(amount).decimalPlaces(decimals, BigNumber.ROUND_HALF_UP).toNumber();
}

/** Major units -> integer minor units (pennies). */
export function toMinorUnits(amount: number, currency: CurrencyCode = BASE_CURRENCY): number {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new BigNumber(safe)
    .times(getMinorUnitFactor(currency))
    .integerValue(BigNumber.ROUND_HALF_UP)
    .toNumber();
}

/** Integer minor units (pennies) -> major units. */
export function fromMinorUnits(minorUnits: number, currency: CurrencyCode = BASE_CURRENCY): number {
  const safe = Number.isFinite(minorUnits) ? minorUnits : 0;
  return new BigNumber(safe).dividedBy(getMinorUnitFactor(currency)).toNumber();
}

export function isEffectivelyZero(amount: number, epsilon: number = ZERO_EPSILON): boolean {
  return new BigNumber(amount).abs().isLessThanOrEqualTo(epsilon);
}

/** Exact decimal sum of a list of amounts (never `Array.prototype.reduce` on floats). */
export function sumMoney(amounts: number[]): number {
  return amounts
    .reduce((total, amount) => total.plus(new BigNumber(amount)), new BigNumber(0))
    .toNumber();
}

/**
 * Formats an amount with the currency symbol, sign, and currency-correct
 * precision (2 decimals for most currencies, 0 for JPY).
 */
export function formatMoney(amount: number, currency: CurrencyCode = BASE_CURRENCY): string {
  const config = getCurrencyConfig(currency);
  const bn = new BigNumber(amount);
  if (bn.isNaN()) return `${config.symbol}0.00`;

  const isNegative = bn.isLessThan(0);
  const absoluteValue = bn.abs().toFixed(config.decimals, BigNumber.ROUND_HALF_UP);

  return `${isNegative ? '-' : ''}${config.symbol}${absoluteValue}`;
}

export interface SignedMoneyOptions {
  /** Render an explicit `+` for positive values (used for net balances). */
  showPlus?: boolean;
}

/** Formats an amount, always rendering the sign so direction is unambiguous. */
export function formatMoneySigned(
  amount: number,
  currency: CurrencyCode = BASE_CURRENCY,
  options: SignedMoneyOptions = {}
): string {
  const bn = new BigNumber(amount);
  const magnitude = formatMoney(bn.abs().toNumber(), currency);

  if (bn.isLessThan(0)) return `-${magnitude}`;
  if (bn.isGreaterThan(0) && options.showPlus) return `+${magnitude}`;
  return magnitude;
}

/** Compact notation for charts and dense metric tiles: `$1.2K`, `$3.4M`. */
export function formatMoneyCompact(amount: number, currency: CurrencyCode = BASE_CURRENCY): string {
  const config = getCurrencyConfig(currency);
  const bn = new BigNumber(amount);
  if (bn.isNaN()) return `${config.symbol}0`;

  const absolute = bn.abs();
  const sign = bn.isLessThan(0) ? '-' : '';

  if (absolute.isGreaterThanOrEqualTo(1_000_000)) {
    return `${sign}${config.symbol}${absolute.dividedBy(1_000_000).toFixed(1)}M`;
  }
  if (absolute.isGreaterThanOrEqualTo(1_000)) {
    return `${sign}${config.symbol}${absolute.dividedBy(1_000).toFixed(1)}K`;
  }
  return `${sign}${config.symbol}${absolute.toFixed(config.decimals, BigNumber.ROUND_HALF_UP)}`;
}

/** Strips currency noise from user input and returns a safe major-unit number. */
export function parseMonetaryInput(val: string | number): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = val.replace(/[^0-9.-]+/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface RenderMoneyOptions {
  /** Overrides the currency's own minor-unit precision. */
  precision?: number;
  /** Renders an explicit `+` on positive values. */
  showSign?: boolean;
  /** Abbreviates large values (`$1.2K`, `$3.4M`). */
  compact?: boolean;
}

/**
 * The single formatting contract for money in the UI.
 *
 * Handles the three cases the plain formatter cannot: a caller-supplied
 * precision, an explicit `+` sign, and compact notation. Non-finite input
 * degrades to a zero amount so `NaN` can never reach the DOM.
 */
export function renderMoney(
  amount: number,
  currency: CurrencyCode = BASE_CURRENCY,
  options: RenderMoneyOptions = {}
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (options.compact) return formatMoneyCompact(safe, currency);

  const digits = options.precision ?? getCurrencyDecimals(currency);
  const symbol = getCurrencySymbol(currency);
  const magnitude = Math.abs(safe).toFixed(digits);
  const sign = safe < 0 ? '-' : options.showSign && safe > 0 ? '+' : '';
  return `${sign}${symbol}${magnitude}`;
}

/** Converts between currencies using the bundled static rate table. */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;
  const fromRate = getCurrencyConfig(from).exchangeRateToBase;
  const toRate = getCurrencyConfig(to).exchangeRateToBase;
  if (toRate === 0) return 0;
  return new BigNumber(amount)
    .times(fromRate)
    .dividedBy(toRate)
    .decimalPlaces(getCurrencyDecimals(to), BigNumber.ROUND_HALF_UP)
    .toNumber();
}

/** Formats a 0-1 ratio as a whole/half percentage string, e.g. `37.5%`. */
export function formatPercentage(ratio: number, decimals = 1): string {
  const bn = new BigNumber(Number.isFinite(ratio) ? ratio : 0).times(100);
  const fixed = bn.toFixed(decimals, BigNumber.ROUND_HALF_UP);
  return `${fixed.replace(/\.0+$/, '')}%`;
}

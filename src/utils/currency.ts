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

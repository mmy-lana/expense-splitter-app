import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import dayjs from 'dayjs';
import type {
  ExpenseCategory,
  ExpenseItem,
  ISODateString,
  LedgerSortKey,
  SplitType,
  UUID,
} from '../types';

/**
 * Ledger filter state plus the pure predicate that applies it.
 *
 * `applyLedgerFilters` is deliberately a pure function rather than a store
 * method: the views call it inside a `useMemo` over the Dexie live-query result,
 * and the verification harness calls it directly with fixtures. One
 * implementation, two consumers, no chance of the UI and the tests disagreeing.
 */

export interface DateRangeFilter {
  /** Inclusive lower bound, ISO date string. */
  from: ISODateString;
  /** Inclusive upper bound, ISO date string. */
  to: ISODateString;
}

export interface LedgerFilters {
  searchText: string;
  categories: ExpenseCategory[];
  splitTypes: SplitType[];
  /** Restricts the ledger to these members (empty = everyone). */
  memberIds: UUID[];
  dateRange: DateRangeFilter | null;
  minAmount: number | null;
  maxAmount: number | null;
  includeSettlements: boolean;
  sortKey: LedgerSortKey;
}

export interface FilterState extends LedgerFilters {
  setSearchText: (searchText: string) => void;
  setCategories: (categories: ExpenseCategory[]) => void;
  toggleCategory: (category: ExpenseCategory) => void;
  setSplitTypes: (splitTypes: SplitType[]) => void;
  toggleSplitType: (splitType: SplitType) => void;
  setMemberIds: (memberIds: UUID[]) => void;
  toggleMember: (memberId: UUID) => void;
  setDateRange: (range: DateRangeFilter | null) => void;
  setAmountRange: (min: number | null, max: number | null) => void;
  setIncludeSettlements: (include: boolean) => void;
  setSortKey: (sortKey: LedgerSortKey) => void;
  /** Restores every default. Used by the "clear filters" affordance. */
  resetFilters: () => void;
}

export const DEFAULT_LEDGER_FILTERS: LedgerFilters = {
  searchText: '',
  categories: [],
  splitTypes: [],
  memberIds: [],
  dateRange: null,
  minAmount: null,
  maxAmount: null,
  includeSettlements: false,
  sortKey: 'DATE_DESC',
};

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      ...DEFAULT_LEDGER_FILTERS,

      setSearchText: (searchText) => set({ searchText }),
      setCategories: (categories) => set({ categories }),
      toggleCategory: (category) => set((state) => ({ categories: toggleValue(state.categories, category) })),
      setSplitTypes: (splitTypes) => set({ splitTypes }),
      toggleSplitType: (splitType) => set((state) => ({ splitTypes: toggleValue(state.splitTypes, splitType) })),
      setMemberIds: (memberIds) => set({ memberIds }),
      toggleMember: (memberId) => set((state) => ({ memberIds: toggleValue(state.memberIds, memberId) })),
      setDateRange: (dateRange) => set({ dateRange }),
      setAmountRange: (minAmount, maxAmount) => set({ minAmount, maxAmount }),
      setIncludeSettlements: (includeSettlements) => set({ includeSettlements }),
      setSortKey: (sortKey) => set({ sortKey }),
      resetFilters: () => set({ ...DEFAULT_LEDGER_FILTERS }),
    }),
    {
      name: 'mintsplit-filters',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/* ----------------------------------------------------------- pure filtering */

/** Case-insensitive match across description, notes, and category label. */
function matchesSearch(expense: ExpenseItem, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystack = [expense.description, expense.notes ?? '', expense.category]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesMembers(expense: ExpenseItem, memberIds: UUID[]): boolean {
  if (memberIds.length === 0) return true;
  const involved = new Set<UUID>([
    ...expense.paidBy.map((payer) => payer.userId),
    ...expense.splits.map((split) => split.userId),
  ]);
  return memberIds.some((memberId) => involved.has(memberId));
}

function matchesDateRange(expense: ExpenseItem, range: DateRangeFilter | null): boolean {
  if (!range) return true;
  const timestamp = new Date(expense.date).getTime();
  if (Number.isNaN(timestamp)) return false;

  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return true;

  // The range is inclusive of both endpoints, compared at day granularity.
  const start = dayjs(from).startOf('day').valueOf();
  const end = dayjs(to).endOf('day').valueOf();
  return timestamp >= start && timestamp <= end;
}

function matchesAmountRange(
  expense: ExpenseItem,
  minAmount: number | null,
  maxAmount: number | null
): boolean {
  if (minAmount !== null && expense.amount < minAmount) return false;
  if (maxAmount !== null && expense.amount > maxAmount) return false;
  return true;
}

function sortExpenses(expenses: ExpenseItem[], sortKey: LedgerSortKey): ExpenseItem[] {
  const sorted = [...expenses];

  switch (sortKey) {
    case 'DATE_ASC':
      return sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    case 'AMOUNT_DESC':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'AMOUNT_ASC':
      return sorted.sort((a, b) => a.amount - b.amount);
    case 'DESCRIPTION_ASC':
      return sorted.sort((a, b) => a.description.localeCompare(b.description));
    case 'DATE_DESC':
    default:
      return sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

/**
 * Applies every active filter and the sort, in a deterministic order.
 *
 * Settlements are excluded unless explicitly requested: they move money between
 * people but are not spending, so including them by default would inflate totals
 * and clutter the ledger.
 */
export function applyLedgerFilters(expenses: ExpenseItem[], filters: LedgerFilters): ExpenseItem[] {
  const needle = filters.searchText.trim().toLowerCase();

  const filtered = expenses.filter((expense) => {
    if (!filters.includeSettlements && expense.isSettlement) return false;
    if (!matchesSearch(expense, needle)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(expense.category)) return false;
    if (filters.splitTypes.length > 0 && !filters.splitTypes.includes(expense.splitType)) return false;
    if (!matchesMembers(expense, filters.memberIds)) return false;
    if (!matchesDateRange(expense, filters.dateRange)) return false;
    if (!matchesAmountRange(expense, filters.minAmount, filters.maxAmount)) return false;
    return true;
  });

  return sortExpenses(filtered, filters.sortKey);
}

/** Number of independently active filters, for the badge on the filter button. */
export function countActiveFilters(filters: LedgerFilters): number {
  return (
    (filters.searchText.trim().length > 0 ? 1 : 0) +
    filters.categories.length +
    filters.splitTypes.length +
    filters.memberIds.length +
    (filters.dateRange ? 1 : 0) +
    (filters.minAmount !== null || filters.maxAmount !== null ? 1 : 0)
  );
}

export function hasActiveFilters(filters: LedgerFilters): boolean {
  return countActiveFilters(filters) > 0;
}

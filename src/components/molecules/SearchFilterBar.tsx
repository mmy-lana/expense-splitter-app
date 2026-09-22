import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, DatePicker, Input, Select, Typography } from 'antd';
import { CloseOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ExpenseCategory, SplitType } from '../../types';
import { CATEGORY_OPTIONS, CATEGORY_META } from '../atoms/CategoryIcon';
import { mintPalette, radii, spacing, typography } from '../../theme';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SPLIT_TYPE_LABELS } from '../../utils/splitEngine';

/**
 * Ledger search, filter and sort bar.
 *
 * The text field is debounced so typing does not re-filter a large ledger on
 * every keystroke, while dropdown changes apply immediately (they are discrete
 * choices, and waiting on them feels broken). The component is fully controlled:
 * state lives in `useFilterStore`, so filters survive navigation between views.
 */

export type LedgerSortKey =
  | 'DATE_DESC'
  | 'DATE_ASC'
  | 'AMOUNT_DESC'
  | 'AMOUNT_ASC'
  | 'DESCRIPTION_ASC';

export const LEDGER_SORT_OPTIONS: { label: string; value: LedgerSortKey }[] = [
  { label: 'Newest first', value: 'DATE_DESC' },
  { label: 'Oldest first', value: 'DATE_ASC' },
  { label: 'Largest amount', value: 'AMOUNT_DESC' },
  { label: 'Smallest amount', value: 'AMOUNT_ASC' },
  { label: 'Description A–Z', value: 'DESCRIPTION_ASC' },
];

export interface SearchFilterBarProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  categories: ExpenseCategory[];
  onCategoriesChange: (categories: ExpenseCategory[]) => void;
  splitTypes: SplitType[];
  onSplitTypesChange: (splitTypes: SplitType[]) => void;
  sortKey: LedgerSortKey;
  onSortKeyChange: (sortKey: LedgerSortKey) => void;
  dateRange: [Dayjs, Dayjs] | null;
  onDateRangeChange: (range: [Dayjs, Dayjs] | null) => void;
  /** Number of rows matching the current filters, for the result count. */
  resultCount: number;
  /** Total rows in the ledger, used to explain "3 of 42". */
  totalCount: number;
  /** Includes settlements in the ledger; off by default in the UI. */
  includeSettlements: boolean;
  onIncludeSettlementsChange: (include: boolean) => void;
  debounceMs?: number;
  /** Renders the controls stacked and full-width for phone layouts. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const SearchFilterBar: FC<SearchFilterBarProps> = ({
  searchText,
  onSearchTextChange,
  categories,
  onCategoriesChange,
  splitTypes,
  onSplitTypesChange,
  sortKey,
  onSortKeyChange,
  dateRange,
  onDateRangeChange,
  resultCount,
  totalCount,
  includeSettlements,
  onIncludeSettlementsChange,
  debounceMs = 250,
  compact = false,
  className,
  style,
}) => {
  // Local mirror so typing stays instant while the parent updates are debounced.
  const [draft, setDraft] = useState(searchText);
  const debouncedDraft = useDebouncedValue(draft, debounceMs);

  useEffect(() => {
    onSearchTextChange(debouncedDraft);
    // `onSearchTextChange` is intentionally excluded: callers pass an inline
    // arrow, and re-running on its identity would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft]);

  // Keep the field in sync when the store is reset from elsewhere.
  useEffect(() => {
    setDraft((current) => (current === searchText ? current : searchText));
  }, [searchText]);

  const activeFilterCount = useMemo(
    () =>
      categories.length +
      splitTypes.length +
      (dateRange ? 1 : 0) +
      (includeSettlements ? 0 : 0),
    [categories.length, splitTypes.length, dateRange, includeSettlements]
  );

  const hasAnyFilter = activeFilterCount > 0 || searchText.trim().length > 0;

  const clearAll = (): void => {
    setDraft('');
    onSearchTextChange('');
    onCategoriesChange([]);
    onSplitTypesChange([]);
    onDateRangeChange(null);
    onIncludeSettlementsChange(false);
  };

  return (
    <section
      className={className}
      aria-label="Search and filter expenses"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        padding: compact ? spacing.sm : spacing.md,
        borderRadius: radii.lg,
        border: `1px solid ${mintPalette.slateBorder}`,
        backgroundColor: mintPalette.surface,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          alignItems: 'center',
          flexWrap: compact ? 'wrap' : 'nowrap',
        }}
      >
        <Input
          allowClear
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={() => onSearchTextChange(draft)}
          placeholder="Search descriptions and notes…"
          prefix={<SearchOutlined style={{ color: mintPalette.slateFaint }} />}
          aria-label="Search expenses"
          style={{ flex: 1, minWidth: compact ? '100%' : 180 }}
        />

        <Select<LedgerSortKey>
          value={sortKey}
          onChange={onSortKeyChange}
          options={LEDGER_SORT_OPTIONS}
          aria-label="Sort expenses"
          style={{ minWidth: compact ? '48%' : 156, flex: compact ? 1 : undefined }}
        />

        <Select<ExpenseCategory[]>
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          value={categories}
          onChange={onCategoriesChange}
          options={CATEGORY_OPTIONS}
          placeholder="Categories"
          aria-label="Filter by category"
          style={{ minWidth: compact ? '48%' : 200, flex: compact ? 1 : undefined }}
          optionRender={(option) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: CATEGORY_META[option.value as ExpenseCategory]?.color,
                }}
              />
              {option.label}
            </span>
          )}
        />

        {!compact ? (
          <Select<SplitType[]>
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={splitTypes}
            onChange={onSplitTypesChange}
            options={(Object.keys(SPLIT_TYPE_LABELS) as SplitType[]).map((type) => ({
              label: SPLIT_TYPE_LABELS[type],
              value: type,
            }))}
            placeholder="Split method"
            aria-label="Filter by split method"
            style={{ minWidth: 168 }}
          />
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(range) => {
              if (range && range[0] && range[1]) {
                onDateRangeChange([range[0], range[1]]);
              } else {
                onDateRangeChange(null);
              }
            }}
            allowEmpty={[true, true]}
            aria-label="Filter by date range"
            style={{ maxWidth: compact ? '100%' : 260 }}
            presets={[
              { label: 'Last 7 days', value: [dayjs().add(-7, 'day'), dayjs()] },
              { label: 'Last 30 days', value: [dayjs().add(-30, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              { label: 'This year', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
            ]}
          />

          <Button
            size="small"
            type={includeSettlements ? 'primary' : 'default'}
            onClick={() => onIncludeSettlementsChange(!includeSettlements)}
            aria-pressed={includeSettlements}
            style={includeSettlements ? { backgroundColor: mintPalette.primary } : undefined}
          >
            Settlements
          </Button>
        </div>

        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            {resultCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`
              : `${resultCount} of ${totalCount} entries`}
          </Typography.Text>

          {activeFilterCount > 0 ? (
            <Button
              size="small"
              icon={<FilterOutlined />}
              onClick={clearAll}
              aria-label="Clear all filters"
            >
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </Button>
          ) : null}

          {hasAnyFilter ? (
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={clearAll}
              aria-label="Reset search and filters"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};

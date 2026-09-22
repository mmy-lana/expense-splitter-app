import type { CSSProperties, FC, ReactNode } from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined,
  CarOutlined,
  CoffeeOutlined,
  CompassOutlined,
  HomeOutlined,
  ShoppingOutlined,
  SmileOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { ExpenseCategory } from '../../types';
import { typography } from '../../theme';

/**
 * Categorical glyph atom.
 *
 * The category table is exported because it is the app's single source of truth
 * for how a category is labelled, coloured and iconified across the ledger, the
 * analytics charts and the expense form. Nothing else may re-declare these.
 */

export type CategoryIconVariant = 'soft' | 'solid';

export interface CategoryMeta {
  value: ExpenseCategory;
  /** Human label used in selects, filters and summaries. */
  label: string;
  icon: ReactNode;
  /** Tinted container background. */
  background: string;
  /** Glyph and label colour. */
  color: string;
}

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  FOOD_AND_DRINK: {
    value: 'FOOD_AND_DRINK',
    label: 'Food & Drink',
    icon: <CoffeeOutlined />,
    background: '#FEF3C7',
    color: '#D97706',
  },
  TRANSPORTATION: {
    value: 'TRANSPORTATION',
    label: 'Transportation',
    icon: <CarOutlined />,
    background: '#E0F2FE',
    color: '#0284C7',
  },
  ENTERTAINMENT: {
    value: 'ENTERTAINMENT',
    label: 'Entertainment',
    icon: <SmileOutlined />,
    background: '#FCE7F3',
    color: '#DB2777',
  },
  HOME_UTILITIES: {
    value: 'HOME_UTILITIES',
    label: 'Home & Utilities',
    icon: <HomeOutlined />,
    background: '#E0E7FF',
    color: '#4F46E5',
  },
  LODGING: {
    value: 'LODGING',
    label: 'Lodging',
    icon: <CompassOutlined />,
    background: '#DCFCE7',
    color: '#059669',
  },
  SERVICES: {
    value: 'SERVICES',
    label: 'Services',
    icon: <ToolOutlined />,
    background: '#F3E8FF',
    color: '#9333EA',
  },
  GROCERIES: {
    value: 'GROCERIES',
    label: 'Groceries',
    icon: <ShoppingOutlined />,
    background: '#ECFDF5',
    color: '#00A86B',
  },
  GENERAL: {
    value: 'GENERAL',
    label: 'General',
    icon: <AppstoreOutlined />,
    background: '#F1F5F9',
    color: '#64748B',
  },
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = Object.keys(
  CATEGORY_META
) as ExpenseCategory[];

/** Select-ready options, ordered for the expense form. */
export const CATEGORY_OPTIONS: { label: string; value: ExpenseCategory }[] = [
  'FOOD_AND_DRINK',
  'GROCERIES',
  'TRANSPORTATION',
  'LODGING',
  'HOME_UTILITIES',
  'ENTERTAINMENT',
  'SERVICES',
  'GENERAL',
].map((value) => ({
  value: value as ExpenseCategory,
  label: CATEGORY_META[value as ExpenseCategory].label,
}));

export function getCategoryMeta(category: ExpenseCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.GENERAL;
}

export function getCategoryLabel(category: ExpenseCategory): string {
  return getCategoryMeta(category).label;
}

export interface CategoryIconProps {
  category: ExpenseCategory;
  /** Container edge length in px. */
  size?: number;
  variant?: CategoryIconVariant;
  shape?: 'rounded' | 'circle';
  showTooltip?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const CategoryIcon: FC<CategoryIconProps> = ({
  category,
  size = 40,
  variant = 'soft',
  shape = 'rounded',
  showTooltip = true,
  className,
  style,
}) => {
  const meta = getCategoryMeta(category);
  const isSolid = variant === 'solid';

  const glyph = (
    <span
      className={className}
      role="img"
      aria-label={meta.label}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? '50%' : Math.round(size * 0.28),
        backgroundColor: isSolid ? meta.color : meta.background,
        color: isSolid ? '#FFFFFF' : meta.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(12, Math.floor(size * 0.48)),
        lineHeight: 1,
        flexShrink: 0,
        transition: 'background-color 0.15s ease, color 0.15s ease',
        ...style,
      }}
    >
      {meta.icon}
    </span>
  );

  if (!showTooltip) return glyph;

  return (
    <Tooltip title={meta.label} placement="top">
      {glyph}
    </Tooltip>
  );
};

/** Inline "icon + label" pair for chips, table cells and legends. */
export interface CategoryTagProps {
  category: ExpenseCategory;
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
}

export const CategoryTag: FC<CategoryTagProps> = ({ category, size = 'md', className, style }) => {
  const meta = getCategoryMeta(category);
  const compact = size === 'sm';

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '1px 8px 1px 4px' : '2px 10px 2px 5px',
        borderRadius: 999,
        backgroundColor: meta.background,
        color: meta.color,
        fontSize: compact ? typography.sizes.caption : typography.sizes.small,
        fontWeight: typography.weights.semibold,
        whiteSpace: 'nowrap',
        lineHeight: 1.6,
        ...style,
      }}
    >
      <CategoryIcon
        category={category}
        size={compact ? 16 : 20}
        variant="solid"
        shape="circle"
        showTooltip={false}
        style={{ fontSize: compact ? 8 : 10 }}
      />
      {meta.label}
    </span>
  );
};

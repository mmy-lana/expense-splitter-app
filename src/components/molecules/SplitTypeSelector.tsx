import { useMemo } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, InputNumber, Segmented, Tooltip, Typography } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled, PercentageOutlined } from '@ant-design/icons';
import BigNumber from 'bignumber.js';
import type { CurrencyCode, ExpenseSplitParticipant, SplitType, UUID, UserProfile } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { SPLIT_TYPE_HINTS, SPLIT_TYPE_LABELS, computeSplits } from '../../utils/splitEngine';
import { getCurrencySymbol, renderMoney } from '../../utils/currency';

/**
 * Split method selector and per-participant editor.
 *
 * The component never re-implements split arithmetic: every preview amount and
 * every validation message comes from `computeSplits`, the same engine that
 * persists the expense. That guarantees the number a user sees while typing is
 * byte-for-byte the number that lands in the ledger.
 */

export interface SplitTypeSelectorProps {
  /** Everyone who could take part in this expense. */
  members: UserProfile[];
  /** Currently included participants, in display order. */
  participantIds: UUID[];
  splitType: SplitType;
  /** Raw input per participant: exact amount, percentage, or share count. */
  customValues: Record<UUID, number>;
  totalAmount: number;
  currency?: CurrencyCode;
  onSplitTypeChange: (splitType: SplitType) => void;
  onParticipantsChange: (participantIds: UUID[]) => void;
  onCustomValuesChange: (values: Record<UUID, number>) => void;
  disabled?: boolean;
  /** Hides the explanatory line under the selector. */
  showHint?: boolean;
  /** Renders the per-participant editor in a compact single line. */
  dense?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SPLIT_TYPE_SEQUENCE: SplitType[] = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

/** Sensible starting values when switching into a weighted split type. */
export function defaultCustomValues(
  participantIds: UUID[],
  splitType: SplitType,
  totalAmount: number,
  currency: CurrencyCode
): Record<UUID, number> {
  const values: Record<UUID, number> = {};
  if (participantIds.length === 0) return values;

  if (splitType === 'EXACT') {
    const factor = currency === 'JPY' ? 1 : 100;
    const totalMinor = Math.round(totalAmount * factor);
    const base = Math.floor(totalMinor / participantIds.length);
    let remainder = totalMinor - base * participantIds.length;
    for (const id of participantIds) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      values[id] = (base + extra) / factor;
    }
    return values;
  }

  if (splitType === 'PERCENT') {
    const base = Math.floor(10000 / participantIds.length) / 100;
    let remainder = Math.round((100 - base * participantIds.length) * 100);
    for (const id of participantIds) {
      const extra = remainder > 0 ? 0.01 : 0;
      if (remainder > 0) remainder -= 1;
      values[id] = new BigNumber(base).plus(extra).toNumber();
    }
    return values;
  }

  if (splitType === 'SHARES') {
    for (const id of participantIds) values[id] = 1;
    return values;
  }

  return values;
}

export const SplitTypeSelector: FC<SplitTypeSelectorProps> = ({
  members,
  participantIds,
  splitType,
  customValues,
  totalAmount,
  currency = 'USD',
  onSplitTypeChange,
  onParticipantsChange,
  onCustomValuesChange,
  disabled = false,
  showHint = true,
  dense = false,
  className,
  style,
}) => {
  const symbol = getCurrencySymbol(currency);

  /** The authoritative split: preview and validation in one call. */
  const result = useMemo(
    () =>
      computeSplits({
        totalAmount,
        splitType,
        participantIds,
        customValues,
        currency,
      }),
    [totalAmount, splitType, participantIds, customValues, currency]
  );

  const previewByUser = useMemo(() => {
    const map = new Map<UUID, ExpenseSplitParticipant>();
    for (const split of result.splits) map.set(split.userId, split);
    return map;
  }, [result.splits]);

  const selectedSet = useMemo(() => new Set(participantIds), [participantIds]);

  const toggleParticipant = (userId: UUID, included: boolean): void => {
    const next = included
      ? [...participantIds, userId]
      : participantIds.filter((id) => id !== userId);

    // Keep participants in member order so the penny remainder is deterministic.
    const ordered = members.filter((member) => next.includes(member.id)).map((member) => member.id);
    onParticipantsChange(ordered);

    if (splitType !== 'EQUAL') {
      const nextValues = defaultCustomValues(ordered, splitType, totalAmount, currency);
      // Preserve anything the user already typed for participants still selected.
      for (const id of ordered) {
        if (customValues[id] !== undefined) nextValues[id] = customValues[id];
      }
      onCustomValuesChange(nextValues);
    }
  };

  const handleSplitTypeChange = (nextType: SplitType): void => {
    onSplitTypeChange(nextType);
    if (nextType !== 'EQUAL') {
      onCustomValuesChange(defaultCustomValues(participantIds, nextType, totalAmount, currency));
    }
  };

  const updateValue = (userId: UUID, value: number | null): void => {
    onCustomValuesChange({ ...customValues, [userId]: value ?? 0 });
  };

  const selectAll = (): void => {
    const all = members.map((member) => member.id);
    onParticipantsChange(all);
    if (splitType !== 'EQUAL') {
      onCustomValuesChange(defaultCustomValues(all, splitType, totalAmount, currency));
    }
  };

  const clearAll = (): void => {
    onParticipantsChange([]);
    onCustomValuesChange({});
  };

  const valueSuffix = splitType === 'PERCENT' ? '%' : splitType === 'SHARES' ? 'sh' : symbol;
  const valueMax = splitType === 'PERCENT' ? 100 : splitType === 'SHARES' ? 999 : totalAmount;
  const valueStep = splitType === 'PERCENT' ? 5 : splitType === 'SHARES' ? 1 : 0.5;

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, ...style }}
    >
      <Segmented<SplitType>
        block
        disabled={disabled}
        value={splitType}
        onChange={(value) => handleSplitTypeChange(value)}
        options={SPLIT_TYPE_SEQUENCE.map((type) => ({
          label: SPLIT_TYPE_LABELS[type],
          value: type,
        }))}
      />

      {showHint ? (
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          {SPLIT_TYPE_HINTS[splitType]}
        </Typography.Text>
      ) : null}

      {/* Participant picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Typography.Text strong style={{ fontSize: typography.sizes.small }}>
          Split between {participantIds.length} of {members.length}
        </Typography.Text>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          <Button size="small" type="link" disabled={disabled} onClick={selectAll}>
            Select all
          </Button>
          <Button
            size="small"
            type="link"
            disabled={disabled || participantIds.length === 0}
            onClick={clearAll}
          >
            Clear
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {members.map((member) => {
          const included = selectedSet.has(member.id);
          const preview = previewByUser.get(member.id);

          return (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: dense ? `${spacing.xxs}px ${spacing.sm}px` : `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: radii.md,
                border: `1px solid ${included ? mintPalette.slateBorder : mintPalette.slateDivider}`,
                backgroundColor: included ? mintPalette.surface : mintPalette.canvas,
                minHeight: dense ? 42 : 48,
              }}
            >
              <input
                type="checkbox"
                checked={included}
                disabled={disabled}
                aria-label={`Include ${member.name} in this split`}
                onChange={(event) => toggleParticipant(member.id, event.target.checked)}
                style={{ width: 18, height: 18, accentColor: mintPalette.primary, flexShrink: 0 }}
              />

              <UserAvatar
                name={member.name}
                avatarUrl={member.avatarUrl}
                size="sm"
                showTooltip={false}
              />

              <Typography.Text
                ellipsis
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: typography.sizes.body,
                  color: included ? mintPalette.slateDark : mintPalette.slateMuted,
                }}
              >
                {member.name}
              </Typography.Text>

              {included && splitType !== 'EQUAL' ? (
                <InputNumber
                  size="small"
                  min={0}
                  max={valueMax}
                  step={valueStep}
                  disabled={disabled}
                  value={customValues[member.id] ?? 0}
                  onChange={(value) => updateValue(member.id, value)}
                  suffix={
                    <span style={{ fontSize: typography.sizes.caption, color: mintPalette.slateMuted }}>
                      {valueSuffix}
                    </span>
                  }
                  style={{ width: 116, flexShrink: 0 }}
                  aria-label={`${SPLIT_TYPE_LABELS[splitType]} for ${member.name}`}
                />
              ) : null}

              {included ? (
                <span style={{ flexShrink: 0, minWidth: 84, textAlign: 'right' }}>
                  {preview ? (
                    <CurrencyDisplay
                      amount={preview.owedAmount}
                      currency={currency}
                      size="sm"
                      muted={splitType === 'EQUAL'}
                    />
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                      —
                    </Typography.Text>
                  )}
                </span>
              ) : (
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: typography.sizes.caption, flexShrink: 0, minWidth: 84, textAlign: 'right' }}
                >
                  not included
                </Typography.Text>
              )}
            </div>
          );
        })}
      </div>

      {/* Validation + summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: radii.md,
          backgroundColor: result.isValid ? mintPalette.tint50 : '#FFF7ED',
          border: `1px solid ${result.isValid ? mintPalette.tint100 : '#FED7AA'}`,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: typography.sizes.small,
            color: result.isValid ? BALANCE_TONES.credit.text : '#B45309',
            fontWeight: typography.weights.medium,
          }}
        >
          {result.isValid ? <CheckCircleFilled /> : <ExclamationCircleFilled />}
          {result.isValid
            ? `${SPLIT_TYPE_LABELS[splitType]} split balances to ${renderMoney(totalAmount, currency)}`
            : (result.validationError ?? 'This split is not balanced yet.')}
        </span>

        {splitType !== 'EQUAL' && participantIds.length > 0 ? (
          <Tooltip title="Replace the current values with an even distribution">
            <Button
              size="small"
              icon={<PercentageOutlined />}
              disabled={disabled}
              onClick={() =>
                onCustomValuesChange(
                  defaultCustomValues(participantIds, splitType, totalAmount, currency)
                )
              }
            >
              Even out
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
};

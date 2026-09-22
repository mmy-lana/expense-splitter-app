import { useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Button, InputNumber, Radio, Segmented, Tooltip, Typography } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled, ThunderboltOutlined } from '@ant-design/icons';
import BigNumber from 'bignumber.js';
import type { ExpensePayer, UUID, UserProfile } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { renderMoney, toMinorUnits } from '../../utils/currency';

/**
 * Multi-payer distribution input.
 *
 * Most expenses have one payer, but splitting the bill across two cards is
 * common enough that the ledger must model it properly. This molecule owns both
 * modes and keeps the distribution exact: it compares totals in integer minor
 * units, so `$33.33 + $33.33` against a `$66.66` total is accepted while a
 * one-penny mismatch is surfaced as a blocking error.
 */

export type PayerMode = 'SINGLE' | 'MULTIPLE';

export interface MultiPayerInputProps {
  /** Everyone who could have paid (group members, or all contacts). */
  members: UserProfile[];
  totalAmount: number;
  currency?: Parameters<typeof renderMoney>[1];
  payers: ExpensePayer[];
  onChange: (payers: ExpensePayer[]) => void;
  /** Disables every control, e.g. while the form is submitting. */
  disabled?: boolean;
  /** Renders an inline error when the distribution does not match the total. */
  showValidation?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Exact decimal sum of a payer list. */
export function sumPayerAmounts(payers: ExpensePayer[]): number {
  return payers
    .reduce((total, payer) => total.plus(new BigNumber(payer.amountPaid)), new BigNumber(0))
    .toNumber();
}

/** True when the distribution matches the total to the exact penny. */
export function isPayerDistributionBalanced(
  payers: ExpensePayer[],
  totalAmount: number,
  currency: Parameters<typeof renderMoney>[1] = 'USD'
): boolean {
  const paidMinor = payers.reduce(
    (total, payer) => total + toMinorUnits(payer.amountPaid, currency),
    0
  );
  return paidMinor === toMinorUnits(totalAmount, currency);
}

/** Splits a total across the chosen payers as evenly as the penny allows. */
export function distributeEvenly(
  userIds: UUID[],
  totalAmount: number,
  currency: Parameters<typeof renderMoney>[1] = 'USD'
): ExpensePayer[] {
  if (userIds.length === 0) return [];

  const factor = currency === 'JPY' ? 1 : 100;
  const totalMinor = Math.round(totalAmount * factor);
  const base = Math.floor(totalMinor / userIds.length);
  let remainder = totalMinor - base * userIds.length;

  return userIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { userId, amountPaid: (base + extra) / factor };
  });
}

export const MultiPayerInput: FC<MultiPayerInputProps> = ({
  members,
  totalAmount,
  currency = 'USD',
  payers,
  onChange,
  disabled = false,
  showValidation = true,
  className,
  style,
}) => {
  const [mode, setMode] = useState<PayerMode>(() => (payers.length > 1 ? 'MULTIPLE' : 'SINGLE'));

  const allocated = sumPayerAmounts(payers);
  const difference = new BigNumber(totalAmount).minus(new BigNumber(allocated));
  const differenceMinor = toMinorUnits(difference.toNumber(), currency);
  const balanced = differenceMinor === 0;

  const selectedPayerIds = payers.filter((payer) => payer.amountPaid > 0).map((payer) => payer.userId);
  const singlePayerId = payers[0]?.userId ?? members[0]?.id;

  const switchToSingle = (userId: UUID): void => {
    setMode('SINGLE');
    onChange([{ userId, amountPaid: totalAmount }]);
  };

  const setPayerAmount = (userId: UUID, value: number | null): void => {
    const nextAmount = value ?? 0;
    const others = payers.filter((payer) => payer.userId !== userId);
    const next: ExpensePayer[] = [...others, { userId, amountPaid: nextAmount }]
      .filter((payer) => payer.amountPaid > 0)
      .sort(
        (a, b) => members.findIndex((m) => m.id === a.userId) - members.findIndex((m) => m.id === b.userId)
      );
    onChange(next);
  };

  const toggleMultiplePayer = (userId: UUID, checked: boolean): void => {
    if (checked) {
      const existing = payers.find((payer) => payer.userId === userId);
      onChange([...payers, { userId, amountPaid: existing?.amountPaid ?? 0 }]);
      return;
    }
    onChange(payers.filter((payer) => payer.userId !== userId));
  };

  const fillRemaining = (): void => {
    const remaining = difference.toNumber();
    if (remainingMinorIsZero(difference.toNumber(), currency)) return;

    const target = payers.find((payer) => payer.amountPaid === 0) ?? payers[0];
    if (!target) return;
    setPayerAmount(target.userId, new BigNumber(target.amountPaid).plus(remaining).toNumber());
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, ...style }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <Segmented<PayerMode>
          size="small"
          value={mode}
          disabled={disabled}
          onChange={(next) => {
            setMode(next);
            if (next === 'SINGLE') {
              const firstId = payers[0]?.userId ?? members[0]?.id;
              if (firstId) onChange([{ userId: firstId, amountPaid: totalAmount }]);
            } else {
              // Seed the multi-payer mode with a sensible even distribution.
              const seeds = (selectedPayerIds.length > 1 ? selectedPayerIds : members.map((m) => m.id))
                .slice(0, Math.max(2, selectedPayerIds.length));
              onChange(distributeEvenly(seeds, totalAmount, currency));
            }
          }}
          options={[
            { label: 'Single payer', value: 'SINGLE' },
            { label: 'Multiple payers', value: 'MULTIPLE' },
          ]}
        />

        {mode === 'MULTIPLE' ? (
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <Tooltip title="Spread the total evenly across the selected payers">
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                disabled={disabled}
                onClick={() =>
                  onChange(distributeEvenly(selectedPayerIds.length > 1 ? selectedPayerIds : members.map((m) => m.id).slice(0, 2), totalAmount, currency))
                }
              >
                Split evenly
              </Button>
            </Tooltip>
            {!balanced ? (
              <Button size="small" type="link" disabled={disabled} onClick={fillRemaining}>
                Fill remaining
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === 'SINGLE' ? (
        <Radio.Group
          value={singlePayerId}
          disabled={disabled}
          onChange={(event) => switchToSingle(event.target.value as UUID)}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: spacing.sm }}
        >
          {members.map((member) => {
            const selected = singlePayerId === member.id;
            return (
              <label
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.md,
                  border: `1px solid ${selected ? mintPalette.primary : mintPalette.slateBorder}`,
                  backgroundColor: selected ? mintPalette.tint50 : mintPalette.surface,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  minHeight: 44,
                }}
              >
                <Radio value={member.id} disabled={disabled} style={{ marginInlineEnd: 0 }} />
                <UserAvatar
                  name={member.name}
                  avatarUrl={member.avatarUrl}
                  size="sm"
                  showTooltip={false}
                />
                <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: typography.sizes.body }}>
                  {member.name}
                </Typography.Text>
                {selected ? (
                  <CurrencyDisplay amount={totalAmount} currency={currency} size="sm" muted />
                ) : null}
              </label>
            );
          })}
        </Radio.Group>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {members.map((member) => {
            const payer = payers.find((entry) => entry.userId === member.id);
            const included = payer !== undefined;
            return (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  borderRadius: radii.md,
                  border: `1px solid ${included ? mintPalette.slateBorder : mintPalette.slateDivider}`,
                  backgroundColor: included ? mintPalette.surface : mintPalette.canvas,
                  minHeight: 48,
                }}
              >
                <input
                  type="checkbox"
                  checked={included}
                  disabled={disabled}
                  aria-label={`${member.name} paid part of this expense`}
                  onChange={(event) => toggleMultiplePayer(member.id, event.target.checked)}
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
                <InputNumber
                  min={0}
                  max={totalAmount}
                  step={0.5}
                  disabled={disabled || !included}
                  value={payer?.amountPaid ?? 0}
                  prefix={renderMoney(0, currency).replace(/[\d.,]+$/, '')}
                  onChange={(value) => setPayerAmount(member.id, value)}
                  style={{ width: 124, flexShrink: 0 }}
                  aria-label={`Amount paid by ${member.name}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {showValidation ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: radii.sm,
            backgroundColor: balanced ? mintPalette.tint50 : '#FFF7ED',
            border: `1px solid ${balanced ? mintPalette.tint100 : '#FED7AA'}`,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: typography.sizes.small,
              color: balanced ? BALANCE_TONES.credit.text : '#B45309',
            }}
          >
            {balanced ? <CheckCircleFilled /> : <ExclamationCircleFilled />}
            {balanced
              ? 'Distribution matches the expense total'
              : `Allocated ${renderMoney(allocated, currency)} of ${renderMoney(totalAmount, currency)}`}
          </span>

          {!balanced ? (
            <Typography.Text style={{ fontSize: typography.sizes.small, color: '#B45309' }}>
              {difference.isGreaterThan(0)
                ? `${renderMoney(difference.toNumber(), currency)} still unassigned`
                : `${renderMoney(difference.abs().toNumber(), currency)} over the total`}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

function remainingMinorIsZero(amount: number, currency: Parameters<typeof renderMoney>[1]): boolean {
  return toMinorUnits(amount, currency) === 0;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { Alert, Button, DatePicker, Input, InputNumber, Modal, Result, Select, Typography } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import confetti from 'canvas-confetti';
import type { CurrencyCode, ExpenseItem, UUID, UserProfile, UserProfileMap } from '../../types';
import { BALANCE_TONES, mintPalette, radii, spacing, typography } from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { recordSettlement } from '../../services/expenseService';
import {
  buildSettlementPlan,
  isSelfSettlement,
  suggestSettlementAmount,
} from '../../utils/settlementPlan';
import { renderMoney, toMinorUnits } from '../../utils/currency';

/**
 * Step-by-step payoff executor.
 *
 * The wizard is deliberately narrow: pick who paid whom, confirm or adjust the
 * amount, record it. Recording writes a real settlement row, so the two balances
 * move by exactly the same number of pennies and the outstanding debt disappears
 * from the simplified plan — which the success step states explicitly rather
 * than claiming success unconditionally.
 */

export interface SettlementWizardProps {
  open: boolean;
  onClose: () => void;
  /** Every person in the ledger; the pickers are restricted to these. */
  users: UserProfile[];
  /** All expenses, used to compute the outstanding pairwise balance. */
  expenses: ExpenseItem[];
  currency?: CurrencyCode;
  /** Signed-in user, used to default the payer and to phrase the copy. */
  currentUserId: UUID;
  defaultPayerId?: UUID;
  defaultReceiverId?: UUID;
  defaultAmount?: number;
  /** Scopes the settlement row to a group ledger. */
  groupId?: UUID | null;
  /** Called after a successful write so views can refresh or highlight the row. */
  onRecorded?: (expenseId: UUID) => void;
  /** Skips the celebratory confetti (used by automated/preview contexts). */
  disableCelebration?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const SettlementWizard: FC<SettlementWizardProps> = ({
  open,
  onClose,
  users,
  expenses,
  currency = 'USD',
  currentUserId,
  defaultPayerId,
  defaultReceiverId,
  defaultAmount,
  groupId = null,
  onRecorded,
  disableCelebration = false,
  className,
  style,
}) => {
  const membersMap: UserProfileMap = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users]
  );

  const [payerId, setPayerId] = useState<UUID>(defaultPayerId ?? currentUserId);
  const [receiverId, setReceiverId] = useState<UUID>(defaultReceiverId ?? '');
  const [amount, setAmount] = useState<number>(defaultAmount ?? 0);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedId, setRecordedId] = useState<UUID | null>(null);
  const isSubmittingRef = useRef(false);

  // The suggested amount and every guard rail come from the pure planner, which
  // is the same arithmetic that decides whether the write clears the debt.
  const plan = useMemo(
    () =>
      buildSettlementPlan({
        fromUserId: payerId,
        toUserId: receiverId,
        amount,
        currency,
        expenses,
      }),
    [payerId, receiverId, amount, currency, expenses]
  );

  useEffect(() => {
    if (!open) return;

    const nextPayer = defaultPayerId ?? currentUserId;
    const fallbackReceiver = users.find((user) => user.id !== nextPayer)?.id ?? '';
    const nextReceiver = defaultReceiverId ?? fallbackReceiver;

    setPayerId(nextPayer);
    setReceiverId(nextReceiver);
    setDate(dayjs());
    setNote('');
    setError(null);
    setRecordedId(null);

    // Pre-fill the exact outstanding debt so "one click to settle" really is one
    // click for the common case.
    setAmount(
      defaultAmount ?? suggestSettlementAmount(nextPayer, nextReceiver, expenses, currency)
    );
  }, [open, defaultPayerId, defaultReceiverId, defaultAmount, currentUserId, users, expenses, currency]);

  const payer = membersMap.get(payerId);
  const receiver = membersMap.get(receiverId);

  const samePerson = isSelfSettlement(payerId, receiverId);
  const canSubmit = plan.canSubmit && !submitting;
  const clearsBalance = plan.clearsBalance;
  const remainingAfter = plan.position === 'OWES' ? plan.remainingAfter : null;

  const handleSettle = async (): Promise<void> => {
    if (isSubmittingRef.current) return;

    if (isSelfSettlement(payerId, receiverId)) {
      setError('A payment needs two different people.');
      return;
    }
    if (toMinorUnits(amount, currency) <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    if (plan.validationError) {
      setError(plan.validationError);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await recordSettlement({
        fromUserId: payerId,
        toUserId: receiverId,
        amount,
        currency,
        groupId,
        note,
        date: date.toISOString(),
      });

      if (!result.ok || !result.expenseId) {
        setError(result.error ?? 'That payment could not be recorded.');
        return;
      }

      setRecordedId(result.expenseId);
      onRecorded?.(result.expenseId);

      if (!disableCelebration) {
        confetti({
          particleCount: 90,
          spread: 65,
          origin: { y: 0.62 },
          colors: [mintPalette.primary, '#10B981', '#34D399', '#A7F3D0'],
          disableForReducedMotion: true,
        });
      }
    } catch (settleErr) {
      setError(settleErr instanceof Error ? settleErr.message : 'Failed to record settlement.');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <Modal
      className={className}
      style={style}
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      centered={!isMobile}
      title="Record a payment"
      styles={{ body: { padding: `${spacing.xl}px ${spacing.xxl}px` } }}
    >
      {recordedId ? (
        <Result
          status="success"
          icon={<CheckCircleFilled style={{ color: mintPalette.primary }} />}
          title="Payment recorded"
          subTitle={
            clearsBalance
              ? `${payer?.name ?? 'The payer'} and ${receiver?.name ?? 'the recipient'} are settled up.`
              : `${renderMoney(amount, currency)} recorded from ${payer?.name ?? 'the payer'} to ${receiver?.name ?? 'the recipient'}.`
          }
          extra={[
            remainingAfter !== null && remainingAfter > 0 ? (
              <Typography.Text key="remaining" type="secondary" style={{ display: 'block' }}>
                {renderMoney(remainingAfter, currency)} still outstanding between them.
              </Typography.Text>
            ) : null,
            <Button
              key="done"
              type="primary"
              onClick={onClose}
              style={{ backgroundColor: mintPalette.primary, minHeight: 40 }}
            >
              Done
            </Button>,
          ]}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          {/* Transfer direction, resolved live from the two pickers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radii.lg,
              backgroundColor: mintPalette.tint50,
              border: `1px solid ${mintPalette.tint100}`,
            }}
          >
            <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
              <UserAvatar
                name={payer?.name ?? 'Payer'}
                avatarUrl={payer?.avatarUrl}
                size="lg"
                showTooltip={false}
                status="debit"
              />
              <Typography.Text strong ellipsis style={{ display: 'block', marginTop: spacing.xs }}>
                {payer?.name ?? 'Select a payer'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                Pays
              </Typography.Text>
            </div>

            <ArrowRightOutlined style={{ fontSize: 20, color: mintPalette.primary }} />

            <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
              <UserAvatar
                name={receiver?.name ?? 'Recipient'}
                avatarUrl={receiver?.avatarUrl}
                size="lg"
                showTooltip={false}
                status="credit"
              />
              <Typography.Text strong ellipsis style={{ display: 'block', marginTop: spacing.xs }}>
                {receiver?.name ?? 'Select a recipient'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
                Receives
              </Typography.Text>
            </div>
          </div>

          {/* Outstanding balance between the two, stated explicitly */}
          {!samePerson && receiverId.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
                padding: `${spacing.sm}px ${spacing.md}px`,
                borderRadius: radii.md,
                backgroundColor:
                  plan.position === 'OWED' ? BALANCE_TONES.credit.surface : BALANCE_TONES.debit.surface,
                border: `1px solid ${
                  plan.position === 'OWED' ? BALANCE_TONES.credit.border : BALANCE_TONES.debit.border
                }`,
                flexWrap: 'wrap',
              }}
            >
              <Typography.Text style={{ fontSize: typography.sizes.small }}>
                {plan.position === 'SETTLED'
                  ? `${payer?.name?.split(' ')[0] ?? 'They'} and ${receiver?.name?.split(' ')[0] ?? 'they'} are settled up`
                  : plan.position === 'OWES'
                    ? `${payer?.name?.split(' ')[0] ?? 'They'} owes ${receiver?.name?.split(' ')[0] ?? 'them'}`
                    : `${receiver?.name?.split(' ')[0] ?? 'They'} owes ${payer?.name?.split(' ')[0] ?? 'them'}`}
              </Typography.Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <CurrencyDisplay amount={plan.outstanding} currency={currency} colored size="md" />
                {plan.outstanding > 0.005 &&
                plan.amountMinorUnits !== toMinorUnits(plan.outstanding, currency) ? (
                  <Button size="small" type="link" onClick={() => setAmount(plan.outstanding)}>
                    Use full amount
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {samePerson ? (
            <Alert
              type="warning"
              showIcon
              message="Choose two different people"
              description="A payment moves money from one person to another."
            />
          ) : null}

          {error ? (
            <Alert type="error" showIcon message="Payment not recorded" description={error} />
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <label style={{ display: 'block' }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.small, marginBottom: spacing.xs }}
              >
                Who is paying?
              </Typography.Text>
              <Select<UUID>
                value={payerId}
                onChange={setPayerId}
                style={{ width: '100%' }}
                options={users.map((user) => ({
                  value: user.id,
                  label: user.id === currentUserId ? `${user.name} (you)` : user.name,
                }))}
              />
            </label>

            <label style={{ display: 'block' }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.small, marginBottom: spacing.xs }}
              >
                Who is receiving?
              </Typography.Text>
              <Select<UUID>
                value={receiverId || undefined}
                onChange={setReceiverId}
                placeholder="Select a recipient"
                style={{ width: '100%' }}
                options={users
                  .filter((user) => user.id !== payerId)
                  .map((user) => ({
                    value: user.id,
                    label: user.id === currentUserId ? `${user.name} (you)` : user.name,
                  }))}
              />
            </label>

            <label style={{ display: 'block' }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.small, marginBottom: spacing.xs }}
              >
                Amount
              </Typography.Text>
              <InputNumber
                value={amount}
                onChange={(value) => setAmount(value ?? 0)}
                min={0}
                step={1}
                prefix={renderMoney(0, currency).replace(/[\d.,]+$/, '')}
                style={{ width: '100%' }}
                size="large"
                status={plan.amountMinorUnits <= 0 ? 'warning' : undefined}
              />
            </label>

            <label style={{ display: 'block' }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.small, marginBottom: spacing.xs }}
              >
                Date
              </Typography.Text>
              <DatePicker
                value={date}
                onChange={(value) => setDate(value ?? dayjs())}
                allowClear={false}
                style={{ width: '100%' }}
              />
            </label>

            <label style={{ display: 'block' }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.small, marginBottom: spacing.xs }}
              >
                Note (optional)
              </Typography.Text>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Bank transfer, cash, Venmo"
                maxLength={140}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            {clearsBalance ? (
              <StatusPill tone="credit" icon={<CheckCircleFilled />}>
                clears the balance
              </StatusPill>
            ) : null}
            {remainingAfter !== null && remainingAfter > 0 ? (
              <StatusPill tone="warning">
                {renderMoney(remainingAfter, currency)} would remain
              </StatusPill>
            ) : null}
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<SwapOutlined />}
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSettle}
            style={{ backgroundColor: mintPalette.primary }}
          >
            Record payment of {renderMoney(amount, currency)}
          </Button>
        </div>
      )}
    </Modal>
  );
};

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
  Upload,
} from 'antd';
import { CameraOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type {
  CurrencyCode,
  ExpenseCategory,
  ExpenseItem,
  ExpensePayer,
  Group,
  SplitType,
  UUID,
  UserProfile,
} from '../../types';
import { CATEGORY_OPTIONS } from '../atoms/CategoryIcon';
import { UserAvatar } from '../atoms/UserAvatar';
import { StatusPill } from '../atoms/MintBadge';
import { MultiPayerInput } from '../molecules/MultiPayerInput';
import { SplitTypeSelector, defaultCustomValues } from '../molecules/SplitTypeSelector';
import { CURRENCY_CODES, getCurrencySymbol, renderMoney } from '../../utils/currency';
import { validateDraft } from '../../utils/expenseValidation';
import type { ExpenseDraft } from '../../utils/expenseValidation';
import { createExpense, updateExpense } from '../../services/expenseService';
import { compressReceiptImage } from '../../services/receiptOcr';
import { useResponsive } from '../../hooks/useResponsive';
import { mintPalette, radii, spacing, typography } from '../../theme';

/**
 * Expense capture form.
 *
 * One form, two presentations: a centred modal from 768px up, and a bottom
 * drawer on phones where a centred dialog would be unusable above a soft
 * keyboard. The switch is driven by `useResponsive`, and the *same* form element
 * is rendered in both cases, so validation state and draft values survive a
 * viewport change (rotating a phone must not discard a half-typed expense).
 *
 * The modal never computes splits itself: the split preview comes from
 * `SplitTypeSelector`, which calls the same engine the write path uses.
 */

export interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: UUID;
  /** Pre-selects the destination ledger when the user opened it inside a group. */
  defaultGroupId?: UUID | null;
  users: UserProfile[];
  groups: Group[];
  /** Existing expense to edit; omit to create a new one. */
  expense?: ExpenseItem | null;
  /** Pre-selects participants, e.g. a direct split with one friend. */
  defaultParticipantIds?: UUID[];
  onSaved?: (expenseId: UUID) => void;
  className?: string;
  style?: CSSProperties;
}

interface ExpenseFormValues {
  description: string;
  category: ExpenseCategory;
  groupId: UUID | 'DIRECT';
  currency: CurrencyCode;
  date: Dayjs;
  notes?: string;
}

const DIRECT = 'DIRECT' as const;

export const ExpenseFormModal: FC<ExpenseFormModalProps> = ({
  open,
  onClose,
  currentUserId,
  defaultGroupId = null,
  users,
  groups,
  expense = null,
  defaultParticipantIds,
  onSaved,
  className,
  style,
}) => {
  const { isMobile } = useResponsive();
  const [form] = Form.useForm<ExpenseFormValues>();

  const isEditing = expense !== null;

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('FOOD_AND_DRINK');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [amount, setAmount] = useState(0);
  const [destination, setDestination] = useState<UUID | typeof DIRECT>(defaultGroupId ?? DIRECT);
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [participantIds, setParticipantIds] = useState<UUID[]>([]);
  const [customValues, setCustomValues] = useState<Record<UUID, number>>({});
  const [payers, setPayers] = useState<ExpensePayer[]>([{ userId: currentUserId, amountPaid: 0 }]);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [notes, setNotes] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | undefined>(undefined);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Who can take part: the group's members, or everyone for a direct split. */
  const activeMembers = useMemo(() => {
    if (destination === DIRECT) return users;
    const group = groups.find((entry) => entry.id === destination);
    if (!group) return users;
    const memberIds = new Set(group.members.map((member) => member.userId));
    const members = users.filter((user) => memberIds.has(user.id));
    return members.length > 0 ? members : users;
  }, [destination, groups, users]);

  const activeGroup = destination === DIRECT ? null : groups.find((g) => g.id === destination) ?? null;

  /* Reset (or hydrate) the draft whenever the dialog opens. */
  useEffect(() => {
    if (!open) return;

    setError(null);
    setSubmitting(false);

    if (expense) {
      const expensePayers =
        expense.paidBy.length > 0 ? expense.paidBy : [{ userId: currentUserId, amountPaid: expense.amount }];

      setDescription(expense.description);
      setCategory(expense.category);
      setCurrency(expense.currency);
      setAmount(expense.amount);
      setDestination(expense.groupId ?? DIRECT);
      setSplitType(expense.splitType);
      setParticipantIds(expense.splits.map((split) => split.userId));
      setPayers(expensePayers);
      setDate(dayjs(expense.date));
      setNotes(expense.notes ?? '');
      setReceiptDataUrl(expense.receiptDataUrl);
      form.setFieldsValue({
        description: expense.description,
        category: expense.category,
        groupId: expense.groupId ?? DIRECT,
        currency: expense.currency,
        date: dayjs(expense.date),
        notes: expense.notes,
      });

      const values: Record<UUID, number> = {};
      for (const split of expense.splits) {
        values[split.userId] = split.rawInput ?? split.percentage ?? split.shares ?? split.owedAmount;
      }
      setCustomValues(values);
      return;
    }

    const initialCurrency = activeGroup?.currency ?? 'USD';
    setDescription('');
    setCategory('FOOD_AND_DRINK');
    setCurrency(initialCurrency);
    setAmount(0);
    setDestination(defaultGroupId ?? DIRECT);
    setSplitType('EQUAL');
    setPayers([{ userId: currentUserId, amountPaid: 0 }]);
    setDate(dayjs());
    setNotes('');
    setReceiptDataUrl(undefined);
    setCustomValues({});

    const initialParticipants = (
      defaultParticipantIds && defaultParticipantIds.length > 0
        ? defaultParticipantIds
        : activeMembers.map((member) => member.id)
    ).filter((id) => activeMembers.some((member) => member.id === id));
    setParticipantIds(initialParticipants);

    form.resetFields();
    form.setFieldsValue({
      description: '',
      category: 'FOOD_AND_DRINK',
      groupId: defaultGroupId ?? DIRECT,
      currency: initialCurrency,
      date: dayjs(),
      notes: '',
    });
    // `activeMembers` is derived from `destination`; re-running on its identity
    // would clobber a half-typed draft, so only the open toggle is a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense, defaultGroupId, currentUserId, form]);

  /* Keep the single-payer amount glued to the total. */
  const handleAmountChange = (value: number | null): void => {
    const next = value ?? 0;
    setAmount(next);
    if (payers.length === 1) {
      setPayers([{ userId: payers[0].userId, amountPaid: next }]);
    }
  };

  /* Changing the destination re-scopes participants to the new member set. */
  const handleDestinationChange = (value: UUID | typeof DIRECT): void => {
    setDestination(value);
    const group = value === DIRECT ? null : groups.find((entry) => entry.id === value);
    const memberIds = group
      ? new Set(group.members.map((member) => member.userId))
      : new Set(users.map((user) => user.id));

    const nextMembers = users.filter((user) => memberIds.has(user.id));
    const nextParticipants = nextMembers.map((member) => member.id);

    setParticipantIds(nextParticipants);
    if (splitType !== 'EQUAL') {
      setCustomValues(defaultCustomValues(nextParticipants, splitType, amount, currency));
    }

    const nextCurrency = group?.currency;
    if (nextCurrency && nextCurrency !== currency) {
      setCurrency(nextCurrency);
      form.setFieldValue('currency', nextCurrency);
    }

    const payerStillValid = nextParticipants.includes(payers[0]?.userId ?? '');
    if (!payerStillValid) setPayers([{ userId: currentUserId, amountPaid: amount }]);
  };

  const handleReceiptUpload = async (file: File): Promise<boolean> => {
    setReceiptBusy(true);
    setError(null);
    try {
      const compressed = await compressReceiptImage(file);
      setReceiptDataUrl(compressed);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'That image could not be processed.');
    } finally {
      setReceiptBusy(false);
    }
    // Never auto-upload: the data URL is submitted with the form itself.
    return false;
  };

  /* Live validation runs the exact rules the write path enforces, so Save is
     never a surprise and the two can never disagree. */
  const draft: ExpenseDraft = {
    groupId: destination === DIRECT ? null : destination,
    description,
    category,
    amount,
    currency,
    paidBy: payers,
    splitType,
    participantIds,
    customValues,
    date: date.toISOString(),
    notes,
    receiptDataUrl,
  };

  const validation = validateDraft(draft);
  const blockers = validation.problems;

  const handleSubmit = async (): Promise<void> => {
    if (blockers.length > 0) {
      setError(blockers[0]);
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = isEditing
      ? await updateExpense(expense.id, draft, currentUserId)
      : await createExpense(draft, currentUserId);

    setSubmitting(false);

    if (!result.ok || !result.expenseId) {
      setError(result.error ?? 'The expense could not be saved.');
      return;
    }

    onSaved?.(result.expenseId);
    onClose();
  };

  const formBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          message="Check this expense"
          description={error}
          onClose={() => setError(null)}
        />
      ) : null}

      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24} sm={14}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Description
          </Typography.Text>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Traditional Kaiseki Dinner"
            size="large"
            maxLength={120}
            autoFocus={!isMobile}
          />
        </Col>

        <Col xs={24} sm={10}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Amount
          </Typography.Text>
          <InputNumber
            value={amount}
            onChange={handleAmountChange}
            min={0}
            step={0.5}
            size="large"
            style={{ width: '100%' }}
            placeholder="0.00"
            prefix={getCurrencySymbol(currency)}
            status={amount <= 0 ? 'warning' : undefined}
          />
        </Col>
      </Row>

      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24} sm={8}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Category
          </Typography.Text>
          <Select<ExpenseCategory>
            value={category}
            onChange={setCategory}
            options={CATEGORY_OPTIONS}
            style={{ width: '100%' }}
          />
        </Col>

        <Col xs={12} sm={8}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Date
          </Typography.Text>
          <DatePicker
            value={date}
            onChange={(value) => setDate(value ?? dayjs())}
            allowClear={false}
            style={{ width: '100%' }}
          />
        </Col>

        <Col xs={12} sm={8}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Currency
          </Typography.Text>
          <Select<CurrencyCode>
            value={currency}
            onChange={(value) => {
              setCurrency(value);
              setCustomValues((current) =>
                splitType === 'EQUAL'
                  ? current
                  : defaultCustomValues(participantIds, splitType, amount, value)
              );
            }}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: `${code} (${getCurrencySymbol(code)})`,
            }))}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          Ledger
        </Typography.Text>
        <Select<UUID | typeof DIRECT>
          value={destination}
          onChange={handleDestinationChange}
          style={{ width: '100%' }}
          options={[
            { value: DIRECT, label: 'Direct split (no group)' },
            ...groups.map((group) => ({
              value: group.id,
              label: `${group.name} — ${group.members.length} member${group.members.length === 1 ? '' : 's'}`,
            })),
          ]}
        />
      </div>

      <Divider style={{ margin: `${spacing.xs}px 0` }} />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Typography.Text strong style={{ fontSize: typography.sizes.body }}>
            Who paid?
          </Typography.Text>
          {activeGroup ? (
            <StatusPill tone="info">{activeGroup.name}</StatusPill>
          ) : (
            <StatusPill>Direct</StatusPill>
          )}
        </div>
        <div style={{ marginTop: spacing.sm }}>
          <MultiPayerInput
            members={activeMembers}
            totalAmount={amount}
            currency={currency}
            payers={payers}
            onChange={setPayers}
            disabled={submitting}
          />
        </div>
      </div>

      <Divider style={{ margin: `${spacing.xs}px 0` }} />

      <div>
        <Typography.Text strong style={{ fontSize: typography.sizes.body }}>
          How should it be split?
        </Typography.Text>
        <div style={{ marginTop: spacing.sm }}>
          <SplitTypeSelector
            members={activeMembers}
            participantIds={participantIds}
            splitType={splitType}
            customValues={customValues}
            totalAmount={amount}
            currency={currency}
            disabled={submitting}
            onSplitTypeChange={setSplitType}
            onParticipantsChange={setParticipantIds}
            onCustomValuesChange={setCustomValues}
          />
        </div>
      </div>

      <Divider style={{ margin: `${spacing.xs}px 0` }} />

      <div>
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          Notes (optional)
        </Typography.Text>
        <Input.TextArea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything worth remembering about this expense"
          rows={2}
          maxLength={280}
          showCount
        />
      </div>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          Receipt (optional)
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' }}>
          <Upload
            accept="image/*"
            maxCount={1}
            showUploadList={false}
            beforeUpload={handleReceiptUpload}
            disabled={receiptBusy}
          >
            <Button icon={<CameraOutlined />} loading={receiptBusy} style={{ minHeight: 40 }}>
              {receiptDataUrl ? 'Replace receipt' : 'Attach receipt photo'}
            </Button>
          </Upload>

          {receiptDataUrl ? (
            <>
              <img
                src={receiptDataUrl}
                alt="Receipt preview"
                style={{
                  maxHeight: 72,
                  borderRadius: radii.md,
                  border: `1px solid ${mintPalette.slateBorder}`,
                  objectFit: 'cover',
                }}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setReceiptDataUrl(undefined)}
                aria-label="Remove receipt"
                className="mint-touch-target"
              />
            </>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
              Images are downsampled to 800px and stored on device only.
            </Typography.Text>
          )}
        </div>
      </div>

      {/* Live summary: exactly what will be written */}
      <Card
        size="small"
        style={{
          borderRadius: radii.md,
          backgroundColor: mintPalette.tint50,
          border: `1px solid ${mintPalette.tint100}`,
        }}
        styles={{ body: { padding: spacing.md } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Typography.Text style={{ fontSize: typography.sizes.small }}>
            {payerLabel(payers, activeMembers, currentUserId)} pays{' '}
            <strong>{renderMoney(amount, currency)}</strong> for {participantIds.length}{' '}
            {participantIds.length === 1 ? 'person' : 'people'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.caption }}>
            {splitType === 'EQUAL'
              ? `${renderMoney(participantIds.length > 0 ? amount / participantIds.length : 0, currency)} each (pennies distributed)`
              : `Split by ${splitType.toLowerCase()}`}
          </Typography.Text>
        </div>
      </Card>
    </div>
  );

  const footer = (
    <div
      style={{
        display: 'flex',
        gap: spacing.sm,
        justifyContent: 'flex-end',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {blockers.length > 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small, marginRight: 'auto' }}>
          {blockers.length} thing{blockers.length === 1 ? '' : 's'} to fix
        </Typography.Text>
      ) : null}
      <Button onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={submitting}
        onClick={handleSubmit}
        style={{ backgroundColor: mintPalette.primary }}
      >
        {isEditing ? 'Save changes' : 'Add expense'}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        className={className}
        style={style}
        title={isEditing ? 'Edit expense' : 'Add an expense'}
        placement="bottom"
        open={open}
        onClose={onClose}
        height="92vh"
        styles={{ body: { paddingBottom: spacing.xxl }, footer: { padding: spacing.md } }}
        footer={footer}
      >
        {formBody}
      </Drawer>
    );
  }

  return (
    <Modal
      className={className}
      style={style}
      title={isEditing ? 'Edit expense' : 'Add an expense'}
      open={open}
      onCancel={onClose}
      width={720}
      footer={footer}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: spacing.xl } }}
    >
      {formBody}
    </Modal>
  );
};

/** Human summary of who is fronting the money. */
function payerLabel(
  payers: ExpensePayer[],
  members: UserProfile[],
  currentUserId: UUID
): string {
  if (payers.length === 0) return 'Nobody';
  if (payers.length > 1) return `${payers.length} people`;

  const payerId = payers[0].userId;
  if (payerId === currentUserId) return 'You';
  return members.find((member) => member.id === payerId)?.name.split(' ')[0] ?? 'Someone';
}

/** Small inline avatar list used by the compact summary rows. */
export const PayerAvatars: FC<{ payers: ExpensePayer[]; members: UserProfile[] }> = ({
  payers,
  members,
}) => (
  <span style={{ display: 'inline-flex', gap: spacing.xs }}>
    {payers.map((payer) => {
      const member = members.find((entry) => entry.id === payer.userId);
      return (
        <UserAvatar
          key={payer.userId}
          name={member?.name ?? 'Unknown'}
          avatarUrl={member?.avatarUrl}
          size="xs"
          showTooltip
        />
      );
    })}
  </span>
);

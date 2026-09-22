import { useEffect, useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Col,
  Drawer,
  Input,
  Modal,
  Row,
  Select,
  Switch,
  Typography,
  message,
} from 'antd';
import type { CurrencyCode, Group, GroupCategory, UUID, UserProfile } from '../../types';
import {
  BALANCE_TONES,
  mintPalette,
  radii,
  spacing,
  typography,
} from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { StatusPill } from '../atoms/MintBadge';
import { CURRENCY_CODES, getCurrencySymbol } from '../../utils/currency';
import { createGroup, updateGroup } from '../../services/groupService';
import type { GroupDraft } from '../../services/groupService';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Group creation and editing.
 *
 * The member picker is the same interaction in both modes, and the creator is
 * always an admin — a group the creator cannot administer is a locked door. The
 * form switches between a modal and a bottom drawer exactly like the expense
 * form, so the two creation flows feel like one product.
 */

export const GROUP_CATEGORY_OPTIONS: { label: string; value: GroupCategory }[] = [
  { label: 'Trip', value: 'TRIP' },
  { label: 'Home', value: 'HOME' },
  { label: 'Couple', value: 'COUPLE' },
  { label: 'Project', value: 'PROJECT' },
  { label: 'Other', value: 'OTHER' },
];

export const GROUP_ICON_OPTIONS: { label: string; value: string }[] = [
  { label: 'Compass (travel)', value: 'CompassOutlined' },
  { label: 'Home', value: 'HomeOutlined' },
  { label: 'Team', value: 'TeamOutlined' },
  { label: 'Fire (cabin)', value: 'FireOutlined' },
  { label: 'Rocket (project)', value: 'RocketOutlined' },
  { label: 'Gift (celebration)', value: 'GiftOutlined' },
  { label: 'Wallet (shared costs)', value: 'WalletOutlined' },
];

export interface GroupFormModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: UUID;
  users: UserProfile[];
  /** Existing group to edit; omit to create. */
  group?: Group | null;
  onSaved?: (groupId: UUID) => void;
  className?: string;
}

export const GroupFormModal: FC<GroupFormModalProps> = ({
  open,
  onClose,
  currentUserId,
  users,
  group = null,
  onSaved,
  className,
}) => {
  const { isMobile } = useResponsive();
  const isEditing = group !== null;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('TRIP');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [avatarIcon, setAvatarIcon] = useState('CompassOutlined');
  const [memberIds, setMemberIds] = useState<UUID[]>([]);
  const [simplifyDebts, setSimplifyDebts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSubmitting(false);

    if (group) {
      setName(group.name);
      setCategory(group.category);
      setDescription(group.description);
      setCurrency(group.currency);
      setAvatarIcon(group.avatarIcon);
      setMemberIds(group.members.map((member) => member.userId));
      setSimplifyDebts(group.simplifyDebts);
      return;
    }

    setName('');
    setCategory('TRIP');
    setDescription('');
    setCurrency('USD');
    setAvatarIcon('CompassOutlined');
    setSimplifyDebts(true);
    // Default to everyone: the common case is splitting with the whole roster.
    setMemberIds(users.map((user) => user.id));
  }, [open, group, users]);

  const draft: GroupDraft = {
    name,
    category,
    description,
    currency,
    avatarIcon,
    memberIds,
    simplifyDebts,
  };

  const problems: string[] = [];
  if (name.trim().length === 0) problems.push('Give this group a name.');
  if (name.trim().length > 60) problems.push('Group names are limited to 60 characters.');
  if (memberIds.length === 0) problems.push('Add at least one person to this group.');

  const handleSubmit = async (): Promise<void> => {
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = isEditing
      ? await updateGroup(group.id, draft, currentUserId)
      : await createGroup(draft, currentUserId);

    setSubmitting(false);

    if (!result.ok || !result.groupId) {
      setError(result.error ?? 'That group could not be saved.');
      return;
    }

    if (result.warnings && result.warnings.length > 0) {
      message.info(result.warnings.join(' '));
    }

    message.success(isEditing ? `${draft.name.trim()} updated.` : `${draft.name.trim()} created.`);
    onSaved?.(result.groupId);
    onClose();
  };

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {error ? (
        <Alert type="error" showIcon closable message="Check this group" description={error} onClose={() => setError(null)} />
      ) : null}

      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={24} sm={14}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Name
          </Typography.Text>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Kyoto Autumn Retreat"
            size="large"
            maxLength={60}
          />
        </Col>
        <Col xs={24} sm={10}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Category
          </Typography.Text>
          <Select<GroupCategory>
            value={category}
            onChange={setCategory}
            options={GROUP_CATEGORY_OPTIONS}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          Description (optional)
        </Typography.Text>
        <Input.TextArea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this ledger for?"
          rows={2}
          maxLength={200}
        />
      </div>

      <Row gutter={[spacing.md, spacing.md]}>
        <Col xs={12}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Currency
          </Typography.Text>
          <Select<CurrencyCode>
            value={currency}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((code) => ({
              value: code,
              label: `${code} (${getCurrencySymbol(code)})`,
            }))}
            style={{ width: '100%' }}
          />
        </Col>
        <Col xs={12}>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Icon
          </Typography.Text>
          <Select<string>
            value={avatarIcon}
            onChange={setAvatarIcon}
            options={GROUP_ICON_OPTIONS}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: radii.md,
          border: `1px solid ${mintPalette.slateBorder}`,
          backgroundColor: mintPalette.canvas,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: typography.sizes.body }}>
            Simplify debts
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
            Collapse the ledger into the fewest possible payments.
          </Typography.Text>
        </div>
        <Switch checked={simplifyDebts} onChange={setSimplifyDebts} />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Typography.Text strong>Members</Typography.Text>
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <Button size="small" type="link" onClick={() => setMemberIds(users.map((user) => user.id))}>
              Everyone
            </Button>
            <Button size="small" type="link" onClick={() => setMemberIds([currentUserId])}>
              Just me
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.sm }}>
          {users.map((user) => {
            const included = memberIds.includes(user.id);
            const isCreator = user.id === currentUserId;
            return (
              <label
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  borderRadius: radii.md,
                  border: `1px solid ${included ? mintPalette.slateBorder : mintPalette.slateDivider}`,
                  backgroundColor: included ? mintPalette.surface : mintPalette.canvas,
                  minHeight: 48,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={included}
                  disabled={isCreator}
                  aria-label={`Include ${user.name} in this group`}
                  onChange={(event) =>
                    setMemberIds((current) =>
                      event.target.checked
                        ? [...current, user.id]
                        : current.filter((id) => id !== user.id)
                    )
                  }
                  style={{ width: 18, height: 18, accentColor: mintPalette.primary, flexShrink: 0 }}
                />
                <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" showTooltip={false} />
                <Typography.Text
                  ellipsis
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: typography.sizes.body,
                    color: included ? mintPalette.slateDark : mintPalette.slateMuted,
                  }}
                >
                  {user.name}
                </Typography.Text>
                {isCreator ? <StatusPill tone="info">admin</StatusPill> : null}
              </label>
            );
          })}
        </div>

        <Typography.Text type="secondary" style={{ display: 'block', marginTop: spacing.xs, fontSize: typography.sizes.caption }}>
          {memberIds.length} member{memberIds.length === 1 ? '' : 's'} selected
        </Typography.Text>
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, alignItems: 'center' }}>
      {problems.length > 0 ? (
        <Typography.Text
          type="secondary"
          style={{ marginRight: 'auto', fontSize: typography.sizes.small, color: BALANCE_TONES.settled.text }}
        >
          {problems.length} thing{problems.length === 1 ? '' : 's'} to fix
        </Typography.Text>
      ) : null}
      <Button onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        type="primary"
        loading={submitting}
        onClick={handleSubmit}
        disabled={problems.length > 0}
        style={{ backgroundColor: mintPalette.primary }}
      >
        {isEditing ? 'Save group' : 'Create group'}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        className={className}
        title={isEditing ? 'Edit group' : 'New group'}
        placement="bottom"
        open={open}
        onClose={onClose}
        height="92vh"
        footer={footer}
        styles={{ footer: { padding: spacing.md } }}
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Modal
      className={className}
      title={isEditing ? 'Edit group' : 'New group'}
      open={open}
      onCancel={onClose}
      width={620}
      footer={footer}
      styles={{ body: { maxHeight: '68vh', overflowY: 'auto', padding: spacing.xl } }}
    >
      {body}
    </Modal>
  );
};

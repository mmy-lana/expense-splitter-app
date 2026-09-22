import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { Button, Empty, Modal, Tooltip, Typography, message } from 'antd';
import { DeleteOutlined, DownloadOutlined, ExpandOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ExpenseItem, UUID, UserProfileMap } from '../../types';
import { mintPalette, radii, spacing, typography } from '../../theme';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { StatusPill } from '../atoms/MintBadge';
import { CategoryTag, getCategoryLabel } from '../atoms/CategoryIcon';
import { removeReceipt } from '../../services/expenseService';
import { estimateDataUrlBytes } from '../../services/receiptOcr';

/**
 * Receipt lightbox.
 *
 * Receipts are stored inline as data URLs, so they are readable with no network
 * at all — but they also count against the browser's IndexedDB quota, which is
 * why the stored size is shown next to the image and why removing one is a
 * first-class action rather than a hidden one.
 */

export interface ReceiptViewerModalProps {
  open: boolean;
  onClose: () => void;
  expense: ExpenseItem | null;
  membersMap: UserProfileMap;
  /** Enables the remove action. */
  onReceiptRemoved?: (expenseId: UUID) => void;
  currentUserId?: UUID;
}

export const ReceiptViewerModal: FC<ReceiptViewerModalProps> = ({
  open,
  onClose,
  expense,
  membersMap,
  onReceiptRemoved,
  currentUserId,
}) => {
  const [zoomed, setZoomed] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open]);

  const dataUrl = expense?.receiptDataUrl;
  const bytes = dataUrl ? estimateDataUrlBytes(dataUrl) : 0;
  const payer = expense ? membersMap.get(expense.paidBy[0]?.userId) : undefined;

  const handleRemove = async (): Promise<void> => {
    if (!expense || !currentUserId) return;

    setRemoving(true);
    const result = await removeReceipt(expense.id, currentUserId);
    setRemoving(false);

    if (!result.ok) {
      message.error(result.error ?? 'That receipt could not be removed.');
      return;
    }

    message.success('Receipt removed');
    onReceiptRemoved?.(expense.id);
    onClose();
  };

  const handleDownload = (): void => {
    if (!dataUrl || !expense || !dataUrl.startsWith('data:image/')) return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `receipt-${expense.id}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={zoomed ? '92vw' : 560}
      centered
      title={expense ? `Receipt — ${expense.description}` : 'Receipt'}
    >
      {!dataUrl || !expense ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="This expense has no receipt attached."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              flexWrap: 'wrap',
              paddingBottom: spacing.sm,
              borderBottom: `1px solid ${mintPalette.slateDivider}`,
            }}
          >
            <CategoryTag category={expense.category} />
            <CurrencyDisplay amount={expense.amount} currency={expense.currency} size="md" />
            <StatusPill>
              {dayjs(expense.date).format('MMM D, YYYY')}
            </StatusPill>
            {payer ? <StatusPill tone="info">Paid by {payer.name.split(' ')[0]}</StatusPill> : null}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              backgroundColor: mintPalette.canvas,
              borderRadius: radii.md,
              border: `1px solid ${mintPalette.slateBorder}`,
              padding: spacing.sm,
              maxHeight: zoomed ? '74vh' : '52vh',
              overflow: 'auto',
            }}
          >
            <img
              src={dataUrl}
              alt={`Receipt for ${expense.description}`}
              onClick={() => setZoomed((current) => !current)}
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: radii.sm,
                cursor: 'zoom-in',
                display: 'block',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
              {getCategoryLabel(expense.category)} · {(bytes / 1024).toFixed(0)} KB stored on this
              device
            </Typography.Text>

            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Tooltip title={zoomed ? 'Fit to window' : 'Zoom in'}>
                <Button
                  size="small"
                  icon={<ExpandOutlined />}
                  onClick={() => setZoomed((current) => !current)}
                >
                  {zoomed ? 'Fit' : 'Zoom'}
                </Button>
              </Tooltip>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
                Download
              </Button>
              {onReceiptRemoved && currentUserId ? (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={removing}
                  onClick={handleRemove}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

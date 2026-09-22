import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Card, Divider, Modal, Popconfirm, Typography, Upload, message } from 'antd';
import {
  DatabaseOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { mintPalette, radii, spacing, typography } from '../../theme';
import {
  describeImportReport,
  exportDatabaseToJson,
  exportExpensesToCsv,
  importFromText,
  importSnapshotFromJson,
} from '../../services/exportImport';
import type { ImportReport } from '../../services/exportImport';
import { seedDemoData } from '../../services/dbSeed';
import { db, getDatabaseStats } from '../../services/db';
import type { DatabaseStats } from '../../services/db';

/**
 * Data portability panel.
 *
 * The ledger lives only on this device, so the user's ability to get their data
 * out and back in is a correctness requirement, not a nicety. JSON is the
 * full-fidelity format (it round-trips users, groups, multi-payer splits and
 * receipts); CSV is the analysis format. The distinction is stated in the UI
 * rather than left for the user to discover after a lossy restore.
 */

export interface BackupRestoreModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after any operation that changed the ledger, so views can refresh. */
  onDataChanged?: () => void;
  className?: string;
}

export const BackupRestoreModal: FC<BackupRestoreModalProps> = ({
  open,
  onClose,
  onDataChanged,
}) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [busy, setBusy] = useState<'EXPORT_JSON' | 'EXPORT_CSV' | 'IMPORT' | 'RESEED' | null>(null);
  const [lastReport, setLastReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setLastReport(null);
    getDatabaseStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [open]);

  const runExport = async (format: 'JSON' | 'CSV'): Promise<void> => {
    setBusy(format === 'JSON' ? 'EXPORT_JSON' : 'EXPORT_CSV');
    setError(null);
    try {
      const summary = format === 'JSON' ? await exportDatabaseToJson() : await exportExpensesToCsv();
      message.success(`Exported ${summary.filename} (${(summary.bytes / 1024).toFixed(1)} KB)`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'The export failed.');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (contents: string, filename: string): Promise<void> => {
    setBusy('IMPORT');
    setError(null);
    try {
      const report = await importFromText(contents, filename, { mode: 'replace' });
      setLastReport(report);
      setStats(await getDatabaseStats());
      message.success(describeImportReport(report));
      onDataChanged?.();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'That backup could not be restored.');
    } finally {
      setBusy(null);
    }
  };

  const handleReseed = async (): Promise<void> => {
    setBusy('RESEED');
    setError(null);
    try {
      const result = await seedDemoData();
      setStats(await getDatabaseStats());
      message.success(
        `Sample ledger restored: ${result.counts.users} people, ${result.counts.groups} groups, ${result.counts.expenses} expenses.`
      );
      onDataChanged?.();
    } catch (reseedError) {
      setError(reseedError instanceof Error ? reseedError.message : 'The sample data could not be restored.');
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async (): Promise<void> => {
    setBusy('IMPORT');
    setError(null);
    try {
      await db.transaction('rw', db.users, db.groups, db.expenses, db.activities, async () => {
        await db.activities.clear();
        await db.expenses.clear();
        await db.groups.clear();
        await db.users.clear();
      });
      setStats(await getDatabaseStats());
      message.success('Local ledger cleared.');
      onDataChanged?.();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'The ledger could not be cleared.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={580}
      title="Backup & restore"
      centered={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <Alert
          type="info"
          showIcon
          icon={<DatabaseOutlined />}
          message="Your ledger never leaves this device"
          description="MintSplit stores everything in this browser's IndexedDB. Export a backup before clearing site data or switching devices."
        />

        {error ? (
          <Alert type="error" showIcon message="Something went wrong" description={error} />
        ) : null}

        {stats ? (
          <div
            style={{
              display: 'flex',
              gap: spacing.xxl,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: mintPalette.canvas,
              border: `1px solid ${mintPalette.slateBorder}`,
              flexWrap: 'wrap',
            }}
          >
            <Stat label="People" value={stats.users} />
            <Stat label="Groups" value={stats.groups} />
            <Stat label="Expenses" value={stats.expenses} />
            <Stat label="Activity" value={stats.activities} />
          </div>
        ) : null}

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            Export
          </Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <Card
              size="small"
              style={{ borderRadius: radii.md }}
              styles={{ body: { padding: spacing.md } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                <FileTextOutlined style={{ color: mintPalette.primary, fontSize: 18 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Typography.Text strong style={{ display: 'block', fontSize: typography.sizes.body }}>
                    Full backup (JSON)
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                    Everything, including multi-payer splits and receipts. This is the file that
                    restores perfectly.
                  </Typography.Text>
                </div>
                <Button
                  icon={<DownloadOutlined />}
                  loading={busy === 'EXPORT_JSON'}
                  disabled={busy !== null}
                  onClick={() => runExport('JSON')}
                >
                  Download
                </Button>
              </div>
            </Card>

            <Card
              size="small"
              style={{ borderRadius: radii.md }}
              styles={{ body: { padding: spacing.md } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                <FileTextOutlined style={{ color: mintPalette.slateMuted, fontSize: 18 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Typography.Text strong style={{ display: 'block', fontSize: typography.sizes.body }}>
                    Expense ledger (CSV)
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                    One row per expense for spreadsheets. Receipts are omitted to keep the file
                    small.
                  </Typography.Text>
                </div>
                <Button
                  icon={<DownloadOutlined />}
                  loading={busy === 'EXPORT_CSV'}
                  disabled={busy !== null}
                  onClick={() => runExport('CSV')}
                >
                  Download
                </Button>
              </div>
            </Card>
          </div>
        </div>

        <Divider style={{ margin: 0 }} />

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            Restore
          </Typography.Text>
          <Upload
            accept=".json,.csv,application/json,text/csv"
            showUploadList={false}
            maxCount={1}
            disabled={busy !== null}
            beforeUpload={(file) => {
              file
                .text()
                .then((contents) => runImport(contents, file.name))
                .catch(() => setError('That file could not be read.'));
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={busy === 'IMPORT'} disabled={busy !== null}>
              Choose a backup file
            </Button>
          </Upload>
          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginTop: spacing.xs, fontSize: typography.sizes.small }}
          >
            Restoring replaces the ledger on this device. Rows that reference a missing person are
            reported rather than invented.
          </Typography.Text>

          {lastReport && lastReport.skipped.length > 0 ? (
            <div style={{ marginTop: spacing.sm }}>
              <Typography.Text strong style={{ fontSize: typography.sizes.small }}>
                Skipped {lastReport.skipped.length} row{lastReport.skipped.length === 1 ? '' : 's'}:
              </Typography.Text>
              <ul style={{ margin: `${spacing.xs}px 0 0`, paddingLeft: spacing.lg }}>
                {lastReport.skipped.slice(0, 5).map((entry, index) => (
                  <li key={`${entry.entity}-${entry.id}-${index}`}>
                    <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
                      {entry.id}: {entry.reason}
                    </Typography.Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Divider style={{ margin: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <Typography.Text strong>Reset</Typography.Text>

          <Popconfirm
            title="Restore the sample ledger?"
            description="This replaces everything on this device with the demo dataset."
            okText="Restore sample"
            cancelText="Cancel"
            onConfirm={handleReseed}
          >
            <Button icon={<ReloadOutlined />} loading={busy === 'RESEED'} disabled={busy !== null} block>
              Restore the sample ledger
            </Button>
          </Popconfirm>

          <Popconfirm
            title="Delete every local record?"
            description="People, groups, expenses and history will be permanently removed from this device."
            okText="Delete everything"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={handleReset}
          >
            <Button danger disabled={busy !== null} block>
              Clear the ledger
            </Button>
          </Popconfirm>
        </div>
      </div>
    </Modal>
  );
};

const Stat: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: typography.sizes.caption }}>
      {label}
    </Typography.Text>
    <Typography.Text strong style={{ fontSize: typography.sizes.title }}>
      {value}
    </Typography.Text>
  </div>
);

/** Kept exported for callers that need to restore a raw JSON string directly. */
export { importSnapshotFromJson };

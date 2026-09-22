import { db } from './db';
import {
  LedgerImportError,
  createSnapshot,
  parseExpensesFromCsv,
  parseSnapshot,
  serializeExpensesToCsv,
  serializeSnapshot,
} from './ledgerSnapshot';
import type { ImportReport, LedgerSnapshot } from './ledgerSnapshot';

/**
 * Backup, restore and export orchestration.
 *
 * This module is the boundary between the pure serialisation contract
 * (`ledgerSnapshot.ts`) and the two things it must not know about: IndexedDB and
 * the browser download/upload APIs. Every write goes through a single Dexie
 * transaction, so a restore can never leave a half-imported ledger behind.
 */

export type { ImportReport, LedgerSnapshot } from './ledgerSnapshot';
export { LedgerImportError } from './ledgerSnapshot';

export interface ExportSummary {
  filename: string;
  bytes: number;
  counts: LedgerSnapshot['counts'];
}

/* ------------------------------------------------------------------ reading */

/** Loads every table and assembles a snapshot. */
export async function buildSnapshot(): Promise<LedgerSnapshot> {
  const [users, groups, expenses, activities] = await Promise.all([
    db.users.toArray(),
    db.groups.toArray(),
    db.expenses.orderBy('date').reverse().toArray(),
    db.activities.orderBy('timestamp').reverse().toArray(),
  ]);

  return createSnapshot({ users, groups, expenses, activities });
}

/* ---------------------------------------------------------------- download */

function triggerDownload(filename: string, mimeType: string, contents: string): number {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Release the object URL on the next tick so Safari has time to start the
  // download before the blob is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return blob.size;
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/** Full-fidelity JSON backup: the format used for restore. */
export async function exportDatabaseToJson(): Promise<ExportSummary> {
  const snapshot = await buildSnapshot();
  const contents = serializeSnapshot(snapshot);
  const filename = `mintsplit-backup-${timestampSuffix()}.json`;

  return {
    filename,
    bytes: triggerDownload(filename, 'application/json;charset=utf-8', contents),
    counts: snapshot.counts,
  };
}

/** Flat CSV of the expense ledger, for spreadsheets and analysis. */
export async function exportExpensesToCsv(expenses?: LedgerSnapshot['expenses']): Promise<ExportSummary> {
  const rows = expenses ?? (await db.expenses.orderBy('date').reverse().toArray());
  const contents = serializeExpensesToCsv(rows);
  const filename = `mintsplit-expenses-${timestampSuffix()}.csv`;

  return {
    filename,
    bytes: triggerDownload(filename, 'text/csv;charset=utf-8', contents),
    counts: { users: 0, groups: 0, expenses: rows.length, activities: 0 },
  };
}

/* ------------------------------------------------------------------ upload */

export interface ImportOptions {
  /**
   * `replace` wipes every table first (a true restore). `merge` upserts the
   * incoming rows and leaves anything not mentioned untouched.
   */
  mode?: 'replace' | 'merge';
  /** Skips the wipe even when `mode` is `replace` (used by partial restores). */
  preserveActivities?: boolean;
}

/** Reads a user-selected file as text, rejecting oversized payloads early. */
export async function readFileAsText(file: File, maxBytes = 64 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    throw new LedgerImportError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${maxBytes / 1024 / 1024} MB import limit.`
    );
  }
  return file.text();
}

/** Restores a JSON backup produced by `exportDatabaseToJson`. */
export async function importSnapshotFromJson(
  json: string,
  options: ImportOptions = {}
): Promise<ImportReport> {
  const { snapshot, report } = parseSnapshot(json);
  const mode = options.mode ?? 'replace';

  await db.transaction('rw', db.users, db.groups, db.expenses, db.activities, async () => {
    if (mode === 'replace') {
      if (!options.preserveActivities) await db.activities.clear();
      await db.expenses.clear();
      await db.groups.clear();
      await db.users.clear();
    }

    await db.users.bulkPut(snapshot.users);
    await db.groups.bulkPut(snapshot.groups);
    await db.expenses.bulkPut(snapshot.expenses);
    await db.activities.bulkPut(snapshot.activities);
  });

  return report;
}

/**
 * Imports an expense CSV.
 *
 * CSV carries expenses but not the identity graph, so users referenced by a row
 * must already exist locally. Unknown user ids are reported rather than silently
 * fabricated, because inventing a person would corrupt every balance.
 */
export async function importExpensesFromCsv(
  csv: string,
  options: ImportOptions = {}
): Promise<ImportReport> {
  const { expenses, report } = parseExpensesFromCsv(csv);
  const existingUserIds = new Set((await db.users.toArray()).map((user) => user.id));
  const existingGroupIds = new Set((await db.groups.toArray()).map((group) => group.id));

  const accepted = expenses.filter((expense) => {
    const referenced = [
      expense.createdBy,
      ...expense.paidBy.map((payer) => payer.userId),
      ...expense.splits.map((split) => split.userId),
    ];
    const unknown = referenced.find((userId) => !existingUserIds.has(userId));

    if (unknown) {
      report.skipped.push({
        entity: 'expense',
        id: expense.id,
        reason: `references unknown user "${unknown}". Import the JSON backup or create that person first.`,
      });
      return false;
    }

    if (expense.groupId && !existingGroupIds.has(expense.groupId)) {
      report.skipped.push({
        entity: 'expense',
        id: expense.id,
        reason: `references unknown group "${expense.groupId}"; the expense was imported as a direct split.`,
      });
      // Repair rather than reject: the money is real even if the group is gone.
      expense.groupId = null;
    }

    return true;
  });

  await db.transaction('rw', db.expenses, async () => {
    if (options.mode === 'replace') await db.expenses.clear();
    await db.expenses.bulkPut(accepted);
  });

  return { ...report, imported: { ...report.imported, expenses: accepted.length } };
}

/** Dispatches on file extension so the UI can offer one "Import backup" control. */
export async function importFromFile(file: File, options: ImportOptions = {}): Promise<ImportReport> {
  const contents = await readFileAsText(file);
  return importFromText(contents, file.name, options);
}

/**
 * Imports backup contents that were already read, dispatching on the filename.
 *
 * Separate from `importFromFile` so a caller holding the text (e.g. a drop target
 * that already decoded the payload) does not have to wrap it back into a File.
 */
export async function importFromText(
  contents: string,
  filename: string,
  options: ImportOptions = {}
): Promise<ImportReport> {
  const isCsv = filename.toLowerCase().endsWith('.csv');
  return isCsv
    ? importExpensesFromCsv(contents, options)
    : importSnapshotFromJson(contents, options);
}

/** Human-readable summary of an import, for the confirmation toast. */
export function describeImportReport(report: ImportReport): string {
  const parts = [
    report.imported.users > 0 ? `${report.imported.users} people` : null,
    report.imported.groups > 0 ? `${report.imported.groups} groups` : null,
    `${report.imported.expenses} expenses`,
    report.imported.activities > 0 ? `${report.imported.activities} activity entries` : null,
  ].filter((part): part is string => part !== null);

  const base = `Imported ${parts.join(', ')}.`;
  return report.skipped.length > 0
    ? `${base} ${report.skipped.length} row(s) were skipped.`
    : base;
}

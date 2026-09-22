import { db } from './db';
import { buildSeedDataset, SEED_GROUP_IDS, SEED_USER_IDS } from './seedDataset';
import type { SeedDataset } from './seedDataset';
import type { ISODateString } from '../types';

/**
 * Seed persistence layer.
 *
 * The demo dataset itself is owned by `seedDataset.ts`, which is pure and
 * storage-free so the verification harness can audit it without IndexedDB. This
 * module is the only place that is allowed to write it into Dexie, and every
 * write happens inside a single read-write transaction: either the whole demo
 * ledger lands, or nothing does.
 */

export { SEED_GROUP_IDS, SEED_USER_IDS };
export type { SeedDataset, SeedSpec } from './seedDataset';

export interface SeedResult {
  /** `true` when this call inserted the dataset, `false` when it was a no-op. */
  seeded: boolean;
  counts: {
    users: number;
    groups: number;
    expenses: number;
    activities: number;
  };
}

function emptyCounts(): SeedResult['counts'] {
  return { users: 0, groups: 0, expenses: 0, activities: 0 };
}

/** Writes an entire dataset atomically. Callers own the surrounding decision. */
async function persistDataset(dataset: SeedDataset): Promise<void> {
  await db.transaction('rw', db.users, db.groups, db.expenses, db.activities, async () => {
    await db.users.bulkAdd(dataset.users);
    await db.groups.bulkAdd(dataset.groups);
    await db.expenses.bulkAdd(dataset.expenses);
    await db.activities.bulkAdd(dataset.activities);
  });
}

/**
 * Seeds the demo dataset once, on first launch.
 *
 * The users table is the emptiness sentinel: a database with users but no
 * expenses is a legitimate state (the user deleted every row) and must never be
 * silently repopulated.
 */
export async function seedInitialDataIfEmpty(): Promise<boolean> {
  const userCount = await db.users.count();
  if (userCount > 0) return false;

  const dataset = buildSeedDataset();
  await persistDataset(dataset);
  return true;
}

/**
 * Rebuilds the demo dataset from scratch, discarding every local change.
 *
 * Clearing and writing share one transaction, so a failure mid-way cannot leave
 * a half-wiped database behind.
 */
export async function seedDemoData(seedTimestamp: number = Date.now()): Promise<SeedResult> {
  const dataset = buildSeedDataset(seedTimestamp);

  await db.transaction('rw', db.users, db.groups, db.expenses, db.activities, async () => {
    await db.activities.clear();
    await db.expenses.clear();
    await db.groups.clear();
    await db.users.clear();
    await db.users.bulkAdd(dataset.users);
    await db.groups.bulkAdd(dataset.groups);
    await db.expenses.bulkAdd(dataset.expenses);
    await db.activities.bulkAdd(dataset.activities);
  });

  return {
    seeded: true,
    counts: {
      users: dataset.users.length,
      groups: dataset.groups.length,
      expenses: dataset.expenses.length,
      activities: dataset.activities.length,
    },
  };
}

/** Row counts currently stored on device. */
export async function getSeedCounts(): Promise<SeedResult['counts']> {
  const [users, groups, expenses, activities] = await Promise.all([
    db.users.count(),
    db.groups.count(),
    db.expenses.count(),
    db.activities.count(),
  ]);
  return { users, groups, expenses, activities };
}

/**
 * Idempotent bootstrap used by the app shell: guarantees the ledger is readable
 * on first paint, and reports what is actually on device afterwards.
 */
export async function ensureSeeded(): Promise<SeedResult> {
  try {
    const seeded = await seedInitialDataIfEmpty();
    return { seeded, counts: await getSeedCounts() };
  } catch (error) {
    console.error('[MintSplit] Failed to seed the local database', error);
    return { seeded: false, counts: emptyCounts() };
  }
}

/** Timestamp of the most recent ledger mutation, used by diagnostics views. */
export async function getLatestActivityTimestamp(): Promise<ISODateString | null> {
  const latest = await db.activities.orderBy('timestamp').last();
  return latest ? latest.timestamp : null;
}

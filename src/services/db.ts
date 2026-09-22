import Dexie, { type Table } from 'dexie';
import type { ActivityLog, ExpenseItem, Group, UserProfile } from '../types';

/**
 * Offline ACID persistence layer.
 *
 * IndexedDB via Dexie gives us transactional writes and `useLiveQuery`
 * reactivity with zero network dependency: the entire ledger lives on device.
 */
export class SplitwiseDatabase extends Dexie {
  users!: Table<UserProfile, string>;
  groups!: Table<Group, string>;
  expenses!: Table<ExpenseItem, string>;
  activities!: Table<ActivityLog, string>;

  constructor() {
    super('SplitwiseCloneDB');
    this.version(1).stores({
      users: 'id, email, name, createdAt',
      groups: 'id, name, category, updatedAt',
      expenses: 'id, groupId, category, date, isSettlement, createdBy, createdAt',
      activities: 'id, groupId, entityId, actorUserId, timestamp',
    });
  }
}

export const db = new SplitwiseDatabase();

export interface DatabaseStats {
  users: number;
  groups: number;
  expenses: number;
  activities: number;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const [users, groups, expenses, activities] = await Promise.all([
    db.users.count(),
    db.groups.count(),
    db.expenses.count(),
    db.activities.count(),
  ]);
  return { users, groups, expenses, activities };
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const stats = await getDatabaseStats();
  return stats.users === 0 && stats.groups === 0 && stats.expenses === 0;
}

/** Removes every row while keeping the schema (used by restore/reset flows). */
export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', db.users, db.groups, db.expenses, db.activities, async () => {
    await db.activities.clear();
    await db.expenses.clear();
    await db.groups.clear();
    await db.users.clear();
  });
}

/** Fully drops the IndexedDB database; the next open recreates the schema. */
export async function deleteDatabase(): Promise<void> {
  await db.delete();
}

/** Appends an audit-trail entry, returning a boolean status. */
export async function recordActivity(entry: ActivityLog): Promise<boolean> {
  try {
    await db.activities.add(entry);
    return true;
  } catch (error) {
    console.error('[MintSplit] Failed to persist activity log entry', error);
    return false;
  }
}

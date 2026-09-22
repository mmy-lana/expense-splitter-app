import Dexie, { type Table } from 'dexie';
import type { UserProfile, Group, ExpenseItem, ActivityLog } from '../types';

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

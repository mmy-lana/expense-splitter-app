import { db } from './db';
import type { UserProfile, Group, ExpenseItem, ActivityLog } from '../types';

export async function seedInitialDataIfEmpty(): Promise<void> {
  const userCount = await db.users.count();
  if (userCount > 0) return;

  const now = new Date().toISOString();

  const primaryUser: UserProfile = {
    id: 'user-self',
    name: 'Alex Rivera (You)',
    email: 'alex@cleanfinance.internal',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend1: UserProfile = {
    id: 'user-sarah',
    name: 'Sarah Chen',
    email: 'sarah.c@cleanfinance.internal',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend2: UserProfile = {
    id: 'user-marcus',
    name: 'Marcus Vance',
    email: 'marcus.v@cleanfinance.internal',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const friend3: UserProfile = {
    id: 'user-elena',
    name: 'Elena Rostova',
    email: 'elena.r@cleanfinance.internal',
    avatarUrl: '',
    defaultCurrency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  await db.users.bulkAdd([primaryUser, friend1, friend2, friend3]);

  const groupTrip: Group = {
    id: 'group-kyoto',
    name: 'Kyoto Retreat',
    category: 'TRIP',
    description: 'Shared train, hotel, and food expenses',
    currency: 'USD',
    avatarIcon: 'CompassOutlined',
    simplifyDebts: true,
    members: [
      { userId: 'user-self', joinedAt: now, role: 'ADMIN' },
      { userId: 'user-sarah', joinedAt: now, role: 'MEMBER' },
      { userId: 'user-marcus', joinedAt: now, role: 'MEMBER' },
      { userId: 'user-elena', joinedAt: now, role: 'MEMBER' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const groupHome: Group = {
    id: 'group-home',
    name: 'Apartment 4B',
    category: 'HOME',
    description: 'Utilities, internet and groceries',
    currency: 'USD',
    avatarIcon: 'HomeOutlined',
    simplifyDebts: true,
    members: [
      { userId: 'user-self', joinedAt: now, role: 'ADMIN' },
      { userId: 'user-marcus', joinedAt: now, role: 'MEMBER' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await db.groups.bulkAdd([groupTrip, groupHome]);

  const exp1: ExpenseItem = {
    id: 'exp-101',
    groupId: 'group-kyoto',
    description: 'Kaiseki Dinner',
    category: 'FOOD_AND_DRINK',
    amount: 320.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-self', amountPaid: 320.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 80.0 },
      { userId: 'user-sarah', owedAmount: 80.0 },
      { userId: 'user-marcus', owedAmount: 80.0 },
      { userId: 'user-elena', owedAmount: 80.0 },
    ],
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    notes: 'Paid with card. Receipt kept.',
    isSettlement: false,
    createdBy: 'user-self',
    createdAt: now,
    updatedAt: now,
  };

  const exp2: ExpenseItem = {
    id: 'exp-102',
    groupId: 'group-kyoto',
    description: 'Express Train Passes',
    category: 'TRANSPORTATION',
    amount: 480.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-sarah', amountPaid: 480.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 120.0 },
      { userId: 'user-sarah', owedAmount: 120.0 },
      { userId: 'user-marcus', owedAmount: 120.0 },
      { userId: 'user-elena', owedAmount: 120.0 },
    ],
    date: new Date(Date.now() - 86400000).toISOString(),
    isSettlement: false,
    createdBy: 'user-sarah',
    createdAt: now,
    updatedAt: now,
  };

  const exp3: ExpenseItem = {
    id: 'exp-103',
    groupId: 'group-home',
    description: 'High-speed Fiber Internet',
    category: 'HOME_UTILITIES',
    amount: 85.0,
    currency: 'USD',
    paidBy: [{ userId: 'user-marcus', amountPaid: 85.0 }],
    splitType: 'EQUAL',
    splits: [
      { userId: 'user-self', owedAmount: 42.5 },
      { userId: 'user-marcus', owedAmount: 42.5 },
    ],
    date: new Date().toISOString(),
    isSettlement: false,
    createdBy: 'user-marcus',
    createdAt: now,
    updatedAt: now,
  };

  await db.expenses.bulkAdd([exp1, exp2, exp3]);

  const act1: ActivityLog = {
    id: 'act-1',
    groupId: 'group-kyoto',
    actorUserId: 'user-self',
    action: 'EXPENSE_CREATED',
    entityId: 'exp-101',
    metadata: { description: 'Kaiseki Dinner', amount: 320.0, currency: 'USD' },
    timestamp: now,
  };

  await db.activities.bulkAdd([act1]);
}

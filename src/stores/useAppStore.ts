import { create } from 'zustand';
import type { UUID, CurrencyCode } from '../types';

interface AppState {
  currentUserId: UUID;
  activeGroupId: UUID | null;
  activeFriendId: UUID | null;
  preferredCurrency: CurrencyCode;
  isExpenseModalOpen: boolean;
  isSettlementModalOpen: boolean;
  preselectedSettlementTarget: { fromUserId: UUID; toUserId: UUID; amount: number } | null;

  setCurrentUser: (userId: UUID) => void;
  setActiveGroup: (groupId: UUID | null) => void;
  setActiveFriend: (friendId: UUID | null) => void;
  setPreferredCurrency: (curr: CurrencyCode) => void;
  openExpenseModal: () => void;
  closeExpenseModal: () => void;
  openSettlementModal: (target?: { fromUserId: UUID; toUserId: UUID; amount: number }) => void;
  closeSettlementModal: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  currentUserId: 'user-self',
  activeGroupId: null,
  activeFriendId: null,
  preferredCurrency: 'USD',
  isExpenseModalOpen: false,
  isSettlementModalOpen: false,
  preselectedSettlementTarget: null,

  setCurrentUser: (userId) => set({ currentUserId: userId }),
  setActiveGroup: (groupId) => set({ activeGroupId: groupId, activeFriendId: null }),
  setActiveFriend: (friendId) => set({ activeFriendId: friendId, activeGroupId: null }),
  setPreferredCurrency: (preferredCurrency) => set({ preferredCurrency }),
  openExpenseModal: () => set({ isExpenseModalOpen: true }),
  closeExpenseModal: () => set({ isExpenseModalOpen: false }),
  openSettlementModal: (target) =>
    set({
      isSettlementModalOpen: true,
      preselectedSettlementTarget: target || null,
    }),
  closeSettlementModal: () =>
    set({
      isSettlementModalOpen: false,
      preselectedSettlementTarget: null,
    }),
}));

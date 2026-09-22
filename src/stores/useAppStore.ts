import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CurrencyCode, UUID } from '../types';

/**
 * Global UI and session state.
 *
 * Only *session* concerns live here: who is signed in, which view is open, which
 * modal is up, and the small set of preferences worth remembering between
 * reloads. Ledger data is never mirrored into Zustand — Dexie plus `useLiveQuery`
 * is the single source of truth, and duplicating it here would create two
 * versions of the truth that can disagree.
 *
 * Preferences persist to LocalStorage (`persist` middleware), which also acts as
 * the documented fallback layer when IndexedDB is unavailable: the app still
 * opens, remembers the active identity, and reports the storage failure instead
 * of showing a blank screen.
 */

export type ShellTab = 'DASHBOARD' | 'GROUPS' | 'FRIENDS' | 'ACTIVITY';

export interface SettlementTarget {
  fromUserId: UUID;
  toUserId: UUID;
  amount: number;
  currency?: CurrencyCode;
  /** Scopes the resulting settlement row to a group when it came from one. */
  groupId?: UUID | null;
  /** Human label for the counterparty, used by the wizard's confirmation copy. */
  reason?: string;
}

export interface AppState {
  /* Session */
  currentUserId: UUID;
  preferredCurrency: CurrencyCode;
  activeTab: ShellTab;
  activeGroupId: UUID | null;
  activeFriendId: UUID | null;

  /* Modal / overlay state */
  isExpenseModalOpen: boolean;
  editingExpenseId: UUID | null;
  isSettlementModalOpen: boolean;
  preselectedSettlementTarget: SettlementTarget | null;
  isReceiptViewerOpen: boolean;
  viewingReceiptExpenseId: UUID | null;
  isExportPanelOpen: boolean;

  /* Layout */
  sidebarCollapsed: boolean;

  /* Actions */
  setCurrentUser: (userId: UUID) => void;
  setPreferredCurrency: (currency: CurrencyCode) => void;
  setActiveTab: (tab: ShellTab) => void;
  setActiveGroup: (groupId: UUID | null) => void;
  setActiveFriend: (friendId: UUID | null) => void;
  clearActiveSelection: () => void;

  openExpenseModal: (expenseId?: UUID | null) => void;
  closeExpenseModal: () => void;

  openSettlementModal: (target?: SettlementTarget) => void;
  closeSettlementModal: () => void;

  openReceiptViewer: (expenseId: UUID) => void;
  closeReceiptViewer: () => void;

  openExportPanel: () => void;
  closeExportPanel: () => void;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUserId: 'user-self',
      preferredCurrency: 'USD',
      activeTab: 'DASHBOARD',
      activeGroupId: null,
      activeFriendId: null,

      isExpenseModalOpen: false,
      editingExpenseId: null,
      isSettlementModalOpen: false,
      preselectedSettlementTarget: null,
      isReceiptViewerOpen: false,
      viewingReceiptExpenseId: null,
      isExportPanelOpen: false,

      sidebarCollapsed: false,

      setCurrentUser: (currentUserId) => set({ currentUserId }),
      setPreferredCurrency: (preferredCurrency) => set({ preferredCurrency }),
      setActiveTab: (activeTab) => set({ activeTab }),

      // Selecting a group or a friend is exclusive: the detail pane shows one.
      setActiveGroup: (activeGroupId) => set({ activeGroupId, activeFriendId: null }),
      setActiveFriend: (activeFriendId) => set({ activeFriendId, activeGroupId: null }),
      clearActiveSelection: () => set({ activeGroupId: null, activeFriendId: null }),

      openExpenseModal: (expenseId) =>
        set({ isExpenseModalOpen: true, editingExpenseId: expenseId ?? null }),
      closeExpenseModal: () => set({ isExpenseModalOpen: false, editingExpenseId: null }),

      openSettlementModal: (target) =>
        set({
          isSettlementModalOpen: true,
          preselectedSettlementTarget: target ?? null,
        }),
      closeSettlementModal: () =>
        set({
          isSettlementModalOpen: false,
          preselectedSettlementTarget: null,
        }),

      openReceiptViewer: (expenseId) =>
        set({ isReceiptViewerOpen: true, viewingReceiptExpenseId: expenseId }),
      closeReceiptViewer: () =>
        set({ isReceiptViewerOpen: false, viewingReceiptExpenseId: null }),

      openExportPanel: () => set({ isExportPanelOpen: true }),
      closeExportPanel: () => set({ isExportPanelOpen: false }),

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'mintsplit-session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Transient overlay state must never be restored: a reload should land on a
      // clean dashboard, not on a modal the user had open three days ago.
      partialize: (state) => ({
        currentUserId: state.currentUserId,
        preferredCurrency: state.preferredCurrency,
        activeTab: state.activeTab,
        activeGroupId: state.activeGroupId,
        activeFriendId: state.activeFriendId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

/** Convenience selectors keep components from subscribing to the whole store. */
export const selectCurrentUser = (state: AppState): UUID => state.currentUserId;
export const selectActiveTab = (state: AppState): ShellTab => state.activeTab;
export const selectIsAnyModalOpen = (state: AppState): boolean =>
  state.isExpenseModalOpen || state.isSettlementModalOpen || state.isReceiptViewerOpen;

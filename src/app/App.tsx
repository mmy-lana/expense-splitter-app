import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { App as AntdApp, Button, ConfigProvider, Result, Spin, Typography } from 'antd';
import { ensureSeeded } from '../services/dbSeed';
import { deleteExpense } from '../services/expenseService';
import { deleteGroup, removeGroupMember } from '../services/groupService';
import { exportDatabaseToJson, exportExpensesToCsv } from '../services/exportImport';
import { cleanFinanceMintTheme, mintPalette, spacing, typography } from '../theme';
import { useAppStore } from '../stores/useAppStore';
import { applyLedgerFilters, useFilterStore } from '../stores/useFilterStore';
import { buildGroupSummaries, useLedgerData } from '../hooks/useLedger';
import { ActivityFeedView } from '../components/templates/ActivityFeedView';
import { DashboardView } from '../components/templates/DashboardView';
import { FriendsDetailView } from '../components/templates/FriendsDetailView';
import { FriendsListView } from '../components/templates/FriendsListView';
import { GroupDetailView } from '../components/templates/GroupDetailView';
import { GroupsListView } from '../components/templates/GroupsListView';
import { ResponsiveAppShell } from '../components/templates/ResponsiveAppShell';
import { DebtSimplificationCard } from '../components/organisms/DebtSimplificationCard';
import { Card } from 'antd';
import { PlusCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { guardRoute, resolveRoute, routeForTab } from './routes';
import type { AppRoute } from './routes';
import { calculateNetBalances, calculateSimplifiedDebts } from '../utils/debtEngine';
import type { CurrencyCode, DebtTransfer, ExpenseItem, UUID } from '../types';

/**
 * Dialog flows are loaded on demand.
 *
 * They pull in Ant Design's Form, Upload, DatePicker and Drawer — a large slice
 * of the library that the dashboard never renders. Splitting them out keeps the
 * first paint to the ledger itself, and the user pays for a form only when they
 * open one.
 */
const ExpenseFormModal = lazy(() =>
  import('../components/organisms/ExpenseFormModal').then((module) => ({
    default: module.ExpenseFormModal,
  }))
);
const SettlementWizard = lazy(() =>
  import('../components/organisms/SettlementWizard').then((module) => ({
    default: module.SettlementWizard,
  }))
);
const ReceiptViewerModal = lazy(() =>
  import('../components/organisms/ReceiptViewerModal').then((module) => ({
    default: module.ReceiptViewerModal,
  }))
);
const BackupRestoreModal = lazy(() =>
  import('../components/organisms/BackupRestoreModal').then((module) => ({
    default: module.BackupRestoreModal,
  }))
);
const GroupFormModal = lazy(() =>
  import('../components/organisms/GroupFormModal').then((module) => ({
    default: module.GroupFormModal,
  }))
);

/**
 * Application root.
 *
 * The only place that connects live IndexedDB data to the presentational
 * templates. Views receive plain props and stay pure; every write goes through a
 * service; the shell owns the responsive chrome. The boot sequence is explicit —
 * seed on first launch, surface a storage failure as a real message rather than a
 * blank screen, and never render a view before its data exists.
 */

/** The signed-in user's net balance in one ledger. */
function netBalanceFor(
  userId: UUID,
  memberIds: UUID[],
  ledgerExpenses: ExpenseItem[],
  currency: CurrencyCode
): number {
  const balances = calculateNetBalances(memberIds, ledgerExpenses, currency);
  return balances.get(userId)?.decimalPlaces(2).toNumber() ?? 0;
}

const AppWorkspace: FC = () => {
  const { message } = AntdApp.useApp();
  const ledger = useLedgerData();
  const filters = useFilterStore();

  const {
    currentUserId,
    preferredCurrency,
    activeTab,
    activeGroupId,
    activeFriendId,
    isExpenseModalOpen,
    editingExpenseId,
    isSettlementModalOpen,
    preselectedSettlementTarget,
    isReceiptViewerOpen,
    viewingReceiptExpenseId,
    isExportPanelOpen,
    setActiveTab,
    setActiveGroup,
    setActiveFriend,
    setCurrentUser,
    openExpenseModal,
    closeExpenseModal,
    openSettlementModal,
    closeSettlementModal,
    openReceiptViewer,
    closeReceiptViewer,
    openExportPanel,
    closeExportPanel,
  } = useAppStore();

  const [isGroupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<UUID | null>(null);

  const currency = preferredCurrency;
  const { users, groups, expenses, activities, membersMap, groupsById, isReady, error } = ledger;

  /* -------------------------------------------------------------- routing */

  const route: AppRoute = useMemo(() => {
    if (activeGroupId) return { name: 'GROUP_DETAIL', groupId: activeGroupId };
    if (activeFriendId) return { name: 'FRIEND_DETAIL', friendId: activeFriendId };
    return routeForTab(activeTab);
  }, [activeGroupId, activeFriendId, activeTab]);

  const guardedRoute = useMemo(
    () =>
      guardRoute(route, {
        groupIds: new Set(groups.map((group) => group.id)),
        userIds: new Set(users.map((user) => user.id)),
      }),
    [route, groups, users]
  );

  const resolution = resolveRoute(guardedRoute);

  useEffect(() => {
    document.title = `MintSplit — ${resolution.title}`;
  }, [resolution.title]);

  /* A deleted group or person must not leave a dangling detail view. */
  useEffect(() => {
    if (!isReady) return;
    if (activeGroupId && !groupsById.has(activeGroupId)) setActiveGroup(null);
    if (activeFriendId && !users.some((user) => user.id === activeFriendId)) setActiveFriend(null);
  }, [isReady, activeGroupId, activeFriendId, groupsById, users, setActiveGroup, setActiveFriend]);

  /* --------------------------------------------------------- derived data */

  const filtersValue = useMemo(
    () => ({
      searchText: filters.searchText,
      categories: filters.categories,
      splitTypes: filters.splitTypes,
      memberIds: filters.memberIds,
      dateRange: filters.dateRange,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
      includeSettlements: filters.includeSettlements,
      sortKey: filters.sortKey,
    }),
    [
      filters.searchText,
      filters.categories,
      filters.splitTypes,
      filters.memberIds,
      filters.dateRange,
      filters.minAmount,
      filters.maxAmount,
      filters.includeSettlements,
      filters.sortKey,
    ]
  );

  const filteredExpenses = useMemo(
    () => applyLedgerFilters(expenses, filtersValue),
    [expenses, filtersValue]
  );

  const groupSummaries = useMemo(
    () => buildGroupSummaries(groups, expenses, currentUserId, netBalanceFor),
    [groups, expenses, currentUserId]
  );

  const allUserIds = useMemo(() => users.map((user) => user.id), [users]);

  const globalTransfers = useMemo(
    () => calculateSimplifiedDebts(allUserIds, expenses, currency),
    [allUserIds, expenses, currency]
  );

  const myNetBalance = useMemo(
    () => (isReady ? netBalanceFor(currentUserId, allUserIds, expenses, currency) : 0),
    [isReady, currentUserId, allUserIds, expenses, currency]
  );

  const pendingTransferCount = useMemo(
    () =>
      globalTransfers.filter(
        (transfer) => transfer.fromUserId === currentUserId || transfer.toUserId === currentUserId
      ).length,
    [globalTransfers, currentUserId]
  );

  const activeGroup = activeGroupId ? groupsById.get(activeGroupId) ?? null : null;
  const activeFriend = activeFriendId
    ? users.find((user) => user.id === activeFriendId) ?? null
    : null;
  const editingExpense = editingExpenseId
    ? expenses.find((expense) => expense.id === editingExpenseId) ?? null
    : null;
  const viewingReceiptExpense = viewingReceiptExpenseId
    ? expenses.find((expense) => expense.id === viewingReceiptExpenseId) ?? null
    : null;
  const editingGroup = editingGroupId ? groupsById.get(editingGroupId) ?? null : null;

  /* -------------------------------------------------------------- actions */

  const notify = useCallback(
    (text: string, kind: 'success' | 'error' | 'info' = 'success') => {
      if (kind === 'error') message.error(text);
      else if (kind === 'info') message.info(text);
      else message.success(text);
    },
    [message]
  );

  const handleDeleteExpense = useCallback(
    async (expenseId: UUID) => {
      const result = await deleteExpense(expenseId, currentUserId);
      if (result.ok) notify('Expense deleted. Balances recalculated.');
      else notify(result.error ?? 'That expense could not be deleted.', 'error');
    },
    [currentUserId, notify]
  );

  const handleOpenExpense = useCallback(
    (expense: ExpenseItem) => openExpenseModal(expense.id),
    [openExpenseModal]
  );

  const handleViewReceipt = useCallback(
    (expense: ExpenseItem) => openReceiptViewer(expense.id),
    [openReceiptViewer]
  );

  const handleSettleTransfer = useCallback(
    (transfer: DebtTransfer) => {
      openSettlementModal({
        fromUserId: transfer.fromUserId,
        toUserId: transfer.toUserId,
        amount: transfer.amount,
        currency: transfer.currency,
        groupId: activeGroupId,
      });
    },
    [openSettlementModal, activeGroupId]
  );

  const handleExportJson = useCallback(async () => {
    try {
      const summary = await exportDatabaseToJson();
      notify(`Backup saved as ${summary.filename}`);
    } catch (exportError) {
      notify(exportError instanceof Error ? exportError.message : 'The backup could not be created.', 'error');
    }
  }, [notify]);

  const handleExportCsv = useCallback(async () => {
    try {
      const summary = await exportExpensesToCsv(filteredExpenses);
      notify(`Exported ${summary.counts.expenses} expenses to ${summary.filename}`);
    } catch (exportError) {
      notify(exportError instanceof Error ? exportError.message : 'The export could not be created.', 'error');
    }
  }, [filteredExpenses, notify]);

  const handleOpenGroupForm = useCallback((groupId: UUID | null) => {
    setEditingGroupId(groupId);
    setGroupFormOpen(true);
  }, []);

  /* ---------------------------------------------------------------- rail */

  const rail = useMemo(
    () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <DebtSimplificationCard
          transfers={globalTransfers}
          membersMap={membersMap}
          currentUserId={currentUserId}
          groupName="every ledger"
          onSettleTransfer={handleSettleTransfer}
        />
        <Card
          title="Quick actions"
          style={{ borderRadius: 12, border: `1px solid ${mintPalette.slateBorder}` }}
          styles={{ body: { padding: spacing.lg } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <Button
              block
              icon={<PlusCircleOutlined />}
              onClick={() => openExpenseModal()}
              style={{ minHeight: 40 }}
            >
              Add an expense
            </Button>
            <Button
              block
              icon={<TeamOutlined />}
              onClick={() => handleOpenGroupForm(null)}
              style={{ minHeight: 40 }}
            >
              New group
            </Button>
            <Button block onClick={handleExportJson} style={{ minHeight: 40 }}>
              Download a backup
            </Button>
            <Button block onClick={handleExportCsv} style={{ minHeight: 40 }}>
              Export this view as CSV
            </Button>
            <Button block onClick={openExportPanel} style={{ minHeight: 40 }}>
              Backup & restore
            </Button>
          </div>
        </Card>
      </div>
    ),
    [
      globalTransfers,
      membersMap,
      currentUserId,
      handleSettleTransfer,
      openExpenseModal,
      handleOpenGroupForm,
      handleExportJson,
      handleExportCsv,
      openExportPanel,
    ]
  );

  /* --------------------------------------------------------------- render */

  if (!isReady) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
          backgroundColor: mintPalette.canvas,
        }}
      >
        <Spin size="large" />
        <Typography.Text type="secondary" style={{ fontSize: typography.sizes.small }}>
          Reading your ledger…
        </Typography.Text>
      </div>
    );
  }

  const renderView = (): React.ReactNode => {
    switch (guardedRoute.name) {
      case 'GROUP_DETAIL': {
        if (!activeGroup) return null;
        const groupExpenses = expenses.filter((expense) => expense.groupId === activeGroup.id);
        const members = activeGroup.members
          .map((member) => membersMap.get(member.userId))
          .filter((user): user is NonNullable<typeof user> => user !== undefined);
        const memberIds = members.map((member) => member.id);

        return (
          <GroupDetailView
            group={activeGroup}
            members={members}
            membersMap={membersMap}
            currentUserId={currentUserId}
            expenses={groupExpenses}
            filters={filtersValue}
            filteredExpenses={applyLedgerFilters(groupExpenses, filtersValue)}
            onBack={() => setActiveGroup(null)}
            onAddExpense={() => openExpenseModal()}
            onEditGroup={() => handleOpenGroupForm(activeGroup.id)}
            onAddMember={() => handleOpenGroupForm(activeGroup.id)}
            onRemoveMember={async (userId) => {
              const result = await removeGroupMember(activeGroup.id, userId, currentUserId);
              if (result.ok) notify('Member removed from this group.');
              else notify(result.error ?? 'That member could not be removed.', 'error');
            }}
            onDeleteGroup={async () => {
              const result = await deleteGroup(activeGroup.id, currentUserId);
              if (result.ok) {
                notify('Group deleted.');
                setActiveGroup(null);
              } else {
                notify(result.error ?? 'That group could not be deleted.', 'error');
              }
            }}
            onSelectFriend={setActiveFriend}
            onEditExpense={handleOpenExpense}
            onDeleteExpense={handleDeleteExpense}
            onViewReceipt={handleViewReceipt}
            onSettleTransfer={handleSettleTransfer}
            onSettleMember={(userId) => {
              const transfer = calculateSimplifiedDebts(
                memberIds,
                groupExpenses,
                activeGroup.currency
              ).find(
                (entry) =>
                  (entry.fromUserId === userId && entry.toUserId === currentUserId) ||
                  (entry.toUserId === userId && entry.fromUserId === currentUserId)
              );

              openSettlementModal({
                fromUserId: transfer?.fromUserId ?? currentUserId,
                toUserId: transfer?.toUserId ?? userId,
                amount: transfer?.amount ?? 0,
                currency: activeGroup.currency,
                groupId: activeGroup.id,
              });
            }}
          />
        );
      }

      case 'FRIEND_DETAIL': {
        if (!activeFriend) return null;
        return (
          <FriendsDetailView
            currentUserId={currentUserId}
            friend={activeFriend}
            users={users}
            groups={groups}
            expenses={expenses}
            membersMap={membersMap}
            currency={currency}
            onBack={() => setActiveFriend(null)}
            onSelectFriend={setActiveFriend}
            onAddExpense={() =>
              openExpenseModal()
            }
            onSettleUp={() => {
              const transfer = globalTransfers.find(
                (entry) =>
                  (entry.fromUserId === currentUserId && entry.toUserId === activeFriend.id) ||
                  (entry.toUserId === currentUserId && entry.fromUserId === activeFriend.id)
              );
              openSettlementModal({
                fromUserId: transfer?.fromUserId ?? currentUserId,
                toUserId: transfer?.toUserId ?? activeFriend.id,
                amount: transfer?.amount ?? 0,
                currency,
              });
            }}
            onEditExpense={handleOpenExpense}
            onDeleteExpense={handleDeleteExpense}
            onViewReceipt={handleViewReceipt}
          />
        );
      }

      case 'ACTIVITY':
        return (
          <ActivityFeedView
            activities={activities}
            expenses={expenses}
            groups={groups}
            membersMap={membersMap}
            currentUserId={currentUserId}
            currency={currency}
            onSelectExpense={(expenseId) => {
              const expense = expenses.find((entry) => entry.id === expenseId);
              if (!expense) return;
              if (expense.groupId) setActiveGroup(expense.groupId);
              else setActiveTab('DASHBOARD');
            }}
            onSelectGroup={setActiveGroup}
          />
        );

      case 'FRIENDS':
        return (
          <FriendsListView
            users={users}
            expenses={expenses}
            currentUserId={currentUserId}
            currency={currency}
            onSelectFriend={setActiveFriend}
            onSettleUp={(fromUserId, toUserId, amount) =>
              openSettlementModal({ fromUserId, toUserId, amount, currency })
            }
          />
        );

      case 'GROUPS':
        return (
          <GroupsListView
            groupSummaries={groupSummaries}
            expenses={expenses}
            membersMap={membersMap}
            currentUserId={currentUserId}
            currency={currency}
            filters={filtersValue}
            onSelectGroup={setActiveGroup}
            onNewGroup={() => handleOpenGroupForm(null)}
            onAddExpense={() => openExpenseModal()}
            onEditExpense={handleOpenExpense}
            onDeleteExpense={handleDeleteExpense}
            onViewReceipt={handleViewReceipt}
          />
        );

      case 'DASHBOARD':
      default:
        return (
          <DashboardView
            currentUserId={currentUserId}
            users={users}
            groups={groups}
            expenses={expenses}
            membersMap={membersMap}
            currency={currency}
            groupSummaries={groupSummaries}
            onSelectGroup={setActiveGroup}
            onSelectFriend={setActiveFriend}
            onAddExpense={() => openExpenseModal()}
            onNewGroup={() => handleOpenGroupForm(null)}
            onSettleUp={(target) => openSettlementModal(target ? { ...target, currency } : undefined)}
            onSettleTransfer={handleSettleTransfer}
            onOpenExpense={handleOpenExpense}
            onViewReceipt={handleViewReceipt}
            onDeleteExpense={handleDeleteExpense}
          />
        );
    }
  };

  return (
    <>
      <ResponsiveAppShell
        users={users}
        groups={groups}
        currentUserId={currentUserId}
        activeTab={resolution.tab}
        onTabChange={(tab) => {
          setActiveGroup(null);
          setActiveFriend(null);
          setActiveTab(tab);
        }}
        onSwitchUser={(userId) => {
          setCurrentUser(userId);
          notify('Switched person — every balance is now shown from their side.', 'info');
        }}
        onAddExpense={() => openExpenseModal()}
        onSettleUp={() => openSettlementModal()}
        onOpenBackup={openExportPanel}
        onNewGroup={() => handleOpenGroupForm(null)}
        netBalance={myNetBalance}
        currency={currency}
        pendingTransferCount={pendingTransferCount}
        rail={rail}
      >
        {renderView()}
      </ResponsiveAppShell>

      <Suspense fallback={null}>
        <ExpenseFormModal
          open={isExpenseModalOpen}
          onClose={closeExpenseModal}
          currentUserId={currentUserId}
          defaultGroupId={activeGroupId}
          users={users}
          groups={groups}
          expense={editingExpense}
          defaultParticipantIds={
            activeFriendId && !activeGroupId ? [currentUserId, activeFriendId] : undefined
          }
          onSaved={() => notify('Expense saved. Balances updated.')}
        />

        <SettlementWizard
          open={isSettlementModalOpen}
          onClose={closeSettlementModal}
          users={users}
          expenses={expenses}
          currency={preselectedSettlementTarget?.currency ?? currency}
          currentUserId={currentUserId}
          defaultPayerId={preselectedSettlementTarget?.fromUserId}
          defaultReceiverId={preselectedSettlementTarget?.toUserId}
          defaultAmount={preselectedSettlementTarget?.amount}
          groupId={preselectedSettlementTarget?.groupId ?? activeGroupId}
          onRecorded={() => notify('Payment recorded. Balances updated.')}
        />

        <ReceiptViewerModal
          open={isReceiptViewerOpen}
          onClose={closeReceiptViewer}
          expense={viewingReceiptExpense}
          membersMap={membersMap}
          currentUserId={currentUserId}
          onReceiptRemoved={() => notify('Receipt removed from this expense.')}
        />

        <BackupRestoreModal
          open={isExportPanelOpen}
          onClose={closeExportPanel}
          onDataChanged={() => notify('Local ledger updated.', 'info')}
        />

        <GroupFormModal
          open={isGroupFormOpen}
          onClose={() => {
            setGroupFormOpen(false);
            setEditingGroupId(null);
          }}
          currentUserId={currentUserId}
          users={users}
          group={editingGroup}
          onSaved={(groupId) => {
            setActiveGroup(groupId);
            setActiveTab('GROUPS');
          }}
        />
      </Suspense>

      {error ? (
        <Result
          status="warning"
          title="Local storage is unavailable"
          subTitle={error}
          extra={
            <Typography.Text type="secondary">
              MintSplit keeps your ledger in this browser. Check that storage is not blocked or full,
              then reload.
            </Typography.Text>
          }
        />
      ) : null}
    </>
  );
};

/** Boot wrapper: proves the database is usable before rendering the workspace. */
const AppBootstrap: FC = () => {
  const [bootState, setBootState] = useState<'LOADING' | 'READY' | 'FAILED'>('LOADING');
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureSeeded()
      .then(() => {
        if (!cancelled) setBootState('READY');
      })
      .catch((seedError: unknown) => {
        if (cancelled) return;
        setBootState('FAILED');
        setBootError(
          seedError instanceof Error
            ? `${seedError.message} Private browsing can block local storage.`
            : 'The local database could not be opened. Private browsing can block local storage.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (bootState === 'LOADING') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
          backgroundColor: mintPalette.canvas,
        }}
      >
        <Spin size="large" />
        <Typography.Text type="secondary">Preparing your ledger…</Typography.Text>
      </div>
    );
  }

  if (bootState === 'FAILED') {
    return (
      <Result
        status="warning"
        title="Local storage is unavailable"
        subTitle={bootError}
        extra={
          <Typography.Text type="secondary">
            MintSplit stores your ledger in this browser. Check that storage is not blocked or full,
            then reload.
          </Typography.Text>
        }
      />
    );
  }

  return <AppWorkspace />;
};

export const App: FC = () => (
  <ConfigProvider theme={cleanFinanceMintTheme}>
    <AntdApp>
      <AppBootstrap />
    </AntdApp>
  </ConfigProvider>
);

export default App;

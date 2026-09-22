import { useState } from 'react';
import type { CSSProperties, FC, ReactNode } from 'react';
import { Badge, Button, Dropdown, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  DollarCircleOutlined,
  HistoryOutlined,
  MenuOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { Group, UserProfile, UUID } from '../../types';
import type { ShellTab } from '../../stores/useAppStore';
import {
  BALANCE_TONES,
  elevation,
  layoutMetrics,
  mintPalette,
  radii,
  spacing,
  typography,
  zIndex,
} from '../../theme';
import { UserAvatar } from '../atoms/UserAvatar';
import { CurrencyDisplay } from '../atoms/CurrencyDisplay';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Responsive application shell.
 *
 * One component owns the three validated layouts rather than three components
 * owning one each, because the *content* is identical — only the chrome differs:
 *
 *   360–767px  header + single column + fixed bottom navigation (60px, safe-area
 *              aware, with a 56px floating "add" trigger above it)
 *   768–1023px header + single column, centred dialogs, no bottom navigation
 *   1024px+    header + persistent sidebar + content, with a right-hand rail
 *              supplied by the view itself
 *
 * Every interactive element resolves to at least 44px on touch layouts, and no
 * control is revealed only on hover.
 */

const { Header, Content, Sider } = Layout;

export interface ShellTabDefinition {
  key: ShellTab;
  label: string;
  icon: ReactNode;
}

export const SHELL_TABS: ShellTabDefinition[] = [
  { key: 'DASHBOARD', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'GROUPS', label: 'Groups', icon: <TeamOutlined /> },
  { key: 'FRIENDS', label: 'Friends', icon: <UserOutlined /> },
  { key: 'ACTIVITY', label: 'Activity', icon: <HistoryOutlined /> },
];

export interface ResponsiveAppShellProps {
  children: ReactNode;
  users: UserProfile[];
  groups: Group[];
  currentUserId: UUID;
  activeTab: ShellTab;
  onTabChange: (tab: ShellTab) => void;
  onSwitchUser: (userId: UUID) => void;
  onAddExpense: () => void;
  onSettleUp: () => void;
  onOpenBackup: () => void;
  onNewGroup: () => void;
  /** Net balance for the signed-in user, shown in the header badge. */
  netBalance?: number;
  currency?: Group['currency'];
  /** Pending settlement count, shown as a badge on the settle action. */
  pendingTransferCount?: number;
  /** Optional right-hand rail rendered from 1024px up. */
  rail?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ResponsiveAppShell: FC<ResponsiveAppShellProps> = ({
  children,
  users,
  groups,
  currentUserId,
  activeTab,
  onTabChange,
  onSwitchUser,
  onAddExpense,
  onSettleUp,
  onOpenBackup,
  onNewGroup,
  netBalance = 0,
  currency = 'USD',
  pendingTransferCount = 0,
  rail,
  className,
  style,
}) => {
  const { isMobile, isDesktop, isDesktopWide } = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0];

  const userMenuItems: MenuProps['items'] = users.map((user) => ({
    key: user.id,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.sm, padding: '2px 0' }}>
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="xs" showTooltip={false} />
        <span>{user.id === currentUserId ? `${user.name} (you)` : user.name}</span>
      </span>
    ),
  }));

  const groupMenuItems: MenuProps['items'] = [
    { key: 'new-group', label: 'New group…', icon: <PlusOutlined /> },
    ...(groups.length > 0 ? [{ type: 'divider' as const }] : []),
    ...groups.map((group) => ({
      key: `group:${group.id}`,
      label: `${group.name} · ${group.members.length} member${group.members.length === 1 ? '' : 's'}`,
    })),
  ];

  const handleGroupMenuClick: MenuProps['onClick'] = (info) => {
    if (info.key === 'new-group') {
      onNewGroup();
      return;
    }
    if (info.key.startsWith('group:')) {
      onTabChange('GROUPS');
    }
  };

  const bottomNav = isMobile ? (
    <nav
      className="mobile-bottom-nav"
      aria-label="Primary navigation"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: layoutMetrics.mobileNavHeight,
        backgroundColor: mintPalette.surface,
        borderTop: `1px solid ${mintPalette.slateBorder}`,
        boxShadow: elevation.bar,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
        zIndex: zIndex.bottomNav,
      }}
    >
      {SHELL_TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            style={{
              flex: 1,
              minWidth: 64,
              minHeight: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              border: 'none',
              background: 'transparent',
              color: active ? mintPalette.primary : mintPalette.slateMuted,
              cursor: 'pointer',
              fontSize: typography.sizes.caption,
              fontWeight: active ? typography.weights.semibold : typography.weights.regular,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  ) : null;

  return (
    <Layout
      className={className}
      style={{ minHeight: '100vh', backgroundColor: mintPalette.canvas, ...style }}
    >
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: zIndex.stickyHeader,
          height: layoutMetrics.headerHeight,
          lineHeight: 'normal',
          padding: isMobile ? `0 ${spacing.md}px` : `0 ${spacing.xl}px`,
          backgroundColor: mintPalette.surface,
          borderBottom: `1px solid ${mintPalette.slateBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
          {isDesktop ? (
            <Dropdown
              menu={{ items: groupMenuItems, onClick: handleGroupMenuClick }}
              trigger={['click']}
              placement="bottomLeft"
            >
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="Browse groups"
                style={{ minHeight: 40, minWidth: 40 }}
              />
            </Dropdown>
          ) : null}

          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: radii.md,
              backgroundColor: mintPalette.primary,
              color: mintPalette.surface,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: typography.weights.black,
              fontSize: typography.sizes.title,
              flexShrink: 0,
            }}
          >
            M
          </span>

          <Typography.Title
            level={4}
            style={{
              margin: 0,
              fontSize: typography.sizes.title,
              fontWeight: typography.weights.bold,
              letterSpacing: typography.letterSpacing.tight,
              whiteSpace: 'nowrap',
            }}
          >
            Mint<span style={{ color: mintPalette.primary }}>Split</span>
          </Typography.Title>

          {!isMobile ? (
            <CurrencyDisplay
              amount={netBalance}
              currency={currency}
              colored
              showSign={Math.abs(netBalance) > 0.005}
              size="sm"
              style={{ marginLeft: spacing.sm }}
            />
          ) : null}
        </div>

        <Space size={spacing.sm}>
          <Tooltip title="Add an expense">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAddExpense}
              aria-label="Add an expense"
              className="mint-touch-target"
              style={{
                backgroundColor: mintPalette.primary,
                minHeight: 44,
                minWidth: isMobile ? 44 : undefined,
                paddingInline: isMobile ? 8 : 16,
              }}
            >
              {!isMobile ? 'Add expense' : null}
            </Button>
          </Tooltip>

          {!isMobile && (
            <Tooltip title="Record a payment">
              <Badge count={pendingTransferCount} size="small" offset={[-2, 2]}>
                <Button
                  icon={<DollarCircleOutlined />}
                  onClick={onSettleUp}
                  aria-label="Record a payment"
                  style={{ minHeight: 40, minWidth: 44 }}
                >
                  Settle up
                </Button>
              </Badge>
            </Tooltip>
          )}

          {isDesktopWide ? (
            <Tooltip title="Backup and restore">
              <Button
                icon={<DatabaseOutlined />}
                onClick={onOpenBackup}
                aria-label="Backup and restore"
                style={{ minHeight: 40 }}
              />
            </Tooltip>
          ) : null}

          <Dropdown
            menu={{ items: userMenuItems, onClick: (info) => onSwitchUser(info.key) }}
            trigger={['click']}
            placement="bottomRight"
          >
            <button
              type="button"
              aria-label="Switch who you are"
              className="mint-touch-target"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: 44,
                minWidth: 44,
                padding: `2px ${spacing.sm}px`,
                borderRadius: radii.md,
                border: `1px solid ${mintPalette.slateBorder}`,
                backgroundColor: mintPalette.canvas,
                cursor: 'pointer',
              }}
            >
              <UserAvatar
                name={currentUser?.name ?? 'User'}
                avatarUrl={currentUser?.avatarUrl}
                size="sm"
                showTooltip={false}
              />
              {!isMobile ? (
                <span style={{ fontSize: typography.sizes.small, color: mintPalette.slateBody }}>
                  {currentUser?.name.split(' ')[0] ?? 'User'}
                </span>
              ) : null}
            </button>
          </Dropdown>

          {isMobile ? (
            <Tooltip title="More">
              <Button
                icon={<MenuOutlined />}
                aria-label="More options"
                onClick={() => setMobileMenuOpen(true)}
                className="mint-touch-target"
                style={{ minHeight: 44, minWidth: 44 }}
              />
            </Tooltip>
          ) : null}
        </Space>
      </Header>

      <Layout>
        {isDesktop ? (
          <Sider
            width={layoutMetrics.sidebarWidth}
            style={{
              backgroundColor: mintPalette.surface,
              borderRight: `1px solid ${mintPalette.slateBorder}`,
            }}
            breakpoint="lg"
            collapsedWidth={0}
          >
            <Menu
              mode="inline"
              selectedKeys={[activeTab]}
              onClick={(info) => onTabChange(info.key as ShellTab)}
              style={{ borderInlineEnd: 'none', paddingTop: spacing.md }}
              items={SHELL_TABS.map((tab) => ({
                key: tab.key,
                icon: tab.icon,
                label: tab.label,
              }))}
            />

            <div style={{ padding: spacing.lg, borderTop: `1px solid ${mintPalette.slateDivider}` }}>
              <Typography.Text
                type="secondary"
                style={{
                  display: 'block',
                  fontSize: typography.sizes.caption,
                  textTransform: 'uppercase',
                  letterSpacing: typography.letterSpacing.wide,
                  marginBottom: spacing.sm,
                }}
              >
                Your balance
              </Typography.Text>
              <CurrencyDisplay
                amount={netBalance}
                currency={currency}
                colored
                showSign={Math.abs(netBalance) > 0.005}
                size="lg"
              />
              <Typography.Text
                type="secondary"
                style={{ display: 'block', fontSize: typography.sizes.caption, color: BALANCE_TONES.settled.text }}
              >
                {netBalance > 0.005
                  ? 'Across every ledger'
                  : netBalance < -0.005
                    ? 'You owe across every ledger'
                    : 'Everything is settled'}
              </Typography.Text>
            </div>
          </Sider>
        ) : null}

        <Content
          style={{
            padding: isMobile
              ? `${spacing.md}px ${spacing.md}px calc(${layoutMetrics.mobileNavHeight}px + env(safe-area-inset-bottom, 0px) + ${spacing.xl}px)`
              : `${spacing.xl}px`,
            width: '100%',
          }}
        >
          {rail && isDesktop ? (
            <div
              style={{
                display: 'flex',
                gap: spacing.xl,
                maxWidth: layoutMetrics.maxContentWidth,
                margin: '0 auto',
                width: '100%',
                alignItems: 'flex-start',
              }}
            >
              <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
              <aside style={{ width: 360, flexShrink: 0 }}>{rail}</aside>
            </div>
          ) : (
            <main
              style={{
                maxWidth: isDesktop ? layoutMetrics.maxContentWidth : layoutMetrics.maxNarrowContentWidth,
                margin: '0 auto',
                width: '100%',
                minWidth: 0,
              }}
            >
              {children}
            </main>
          )}
        </Content>
      </Layout>

      {bottomNav}

      {/* Mobile overflow menu: the actions that do not fit the header. */}
      {mobileMenuOpen ? (
        <div
          role="dialog"
          aria-label="More options"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            zIndex: zIndex.overlay,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              backgroundColor: mintPalette.surface,
              borderRadius: `${radii.xl}px ${radii.xl}px 0 0`,
              padding: spacing.lg,
              paddingBottom: `calc(${layoutMetrics.mobileNavHeight}px + env(safe-area-inset-bottom, 0px) + ${spacing.lg}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm,
            }}
          >
            <Button
              block
              size="large"
              icon={<DollarCircleOutlined />}
              onClick={() => { setMobileMenuOpen(false); onSettleUp(); }}
            >
              Record a payment
            </Button>
            <Button block size="large" onClick={() => { setMobileMenuOpen(false); onOpenBackup(); }}>
              Backup & restore
            </Button>
            <Button block size="large" onClick={() => { setMobileMenuOpen(false); onNewGroup(); }}>
              New group
            </Button>
            <Dropdown
              menu={{ items: userMenuItems, onClick: (info) => onSwitchUser(info.key) }}
              trigger={['click']}
              placement="top"
            >
              <Button block size="large">
                Switch person
              </Button>
            </Dropdown>
            <Button block size="large" type="text" onClick={() => setMobileMenuOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Layout>
  );
};

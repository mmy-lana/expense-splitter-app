import type { ShellTab } from '../stores/useAppStore';
import type { Group } from '../types';

/**
 * View routing.
 *
 * MintSplit is a single-page workspace rather than a URL-routed site: a user
 * switches between four views and, inside two of them, drills into a specific
 * ledger or person. Modelling that as explicit route values (rather than nested
 * conditionals in the shell) keeps the "what is on screen" decision in one place
 * and makes the resolved title derivable.
 */

export type AppRoute =
  | { name: 'DASHBOARD' }
  | { name: 'GROUPS' }
  | { name: 'GROUP_DETAIL'; groupId: string }
  | { name: 'FRIENDS' }
  | { name: 'FRIEND_DETAIL'; friendId: string }
  | { name: 'ACTIVITY' };

export interface RouteResolution {
  /** The shell tab that should read as active for this route. */
  tab: ShellTab;
  /** Heading used for the document title. */
  title: string;
}

export function routeForTab(tab: ShellTab): AppRoute {
  switch (tab) {
    case 'GROUPS':
      return { name: 'GROUPS' };
    case 'FRIENDS':
      return { name: 'FRIENDS' };
    case 'ACTIVITY':
      return { name: 'ACTIVITY' };
    case 'DASHBOARD':
    default:
      return { name: 'DASHBOARD' };
  }
}

export function resolveRoute(route: AppRoute): RouteResolution {
  switch (route.name) {
    case 'GROUPS':
      return { tab: 'GROUPS', title: 'Groups' };
    case 'GROUP_DETAIL':
      return { tab: 'GROUPS', title: 'Group ledger' };
    case 'FRIENDS':
      return { tab: 'FRIENDS', title: 'Friends' };
    case 'FRIEND_DETAIL':
      return { tab: 'FRIENDS', title: 'Shared ledger' };
    case 'ACTIVITY':
      return { tab: 'ACTIVITY', title: 'Activity' };
    case 'DASHBOARD':
    default:
      return { tab: 'DASHBOARD', title: 'Dashboard' };
  }
}

/**
 * Falls back to the list view when a drilled-into entity no longer exists.
 *
 * Without this, deleting the group you are looking at would leave the detail view
 * rendering against a missing record.
 */
export function guardRoute(
  route: AppRoute,
  context: { groupIds: Set<string>; userIds: Set<string> }
): AppRoute {
  if (route.name === 'GROUP_DETAIL' && !context.groupIds.has(route.groupId)) {
    return { name: 'GROUPS' };
  }
  if (route.name === 'FRIEND_DETAIL' && !context.userIds.has(route.friendId)) {
    return { name: 'FRIENDS' };
  }
  return route;
}

/** Groups the signed-in user belongs to, for the group list view. */
export function selectVisibleGroups(groups: Group[], currentUserId: string): Group[] {
  return groups.filter((group) => group.members.some((member) => member.userId === currentUserId));
}

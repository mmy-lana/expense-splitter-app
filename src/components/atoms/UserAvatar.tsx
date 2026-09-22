import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FC, ReactNode } from 'react';
import { Tooltip } from 'antd';
import { BALANCE_TONES, elevation, mintPalette, typography } from '../../theme';
import type { BalanceTone } from '../../theme';

/**
 * Identity atom: avatar with a deterministic fallback and an optional balance
 * status badge.
 *
 * The app is offline-first, so a remote avatar must never be a single point of
 * failure: when the image is missing, still loading, or fails to decode, the
 * component falls back to initials on a colour derived from the name. That keeps
 * a ledger readable with no network at all.
 */

export type UserAvatarSize = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: UserAvatarSize;
  /** Wraps the avatar in a tooltip carrying the full name. */
  showTooltip?: boolean;
  /** Extra tooltip line, e.g. an email or a balance summary. */
  tooltipSubtitle?: string;
  /** Renders a corner badge tinted by the member's balance direction. */
  status?: BalanceTone;
  /** Text used for the status badge tooltip. */
  statusLabel?: string;
  /** Ring in the brand mint, used for the "you" identity. */
  highlight?: boolean;
  shape?: 'circle' | 'square';
  /** Rendered instead of initials when no image is available. */
  fallbackIcon?: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

const SIZE_MAP: Record<Exclude<UserAvatarSize, number>, number> = {
  xs: 22,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

/** Neutral-to-mint palette: every fallback stays inside the design language. */
export const AVATAR_FALLBACK_COLORS = [
  mintPalette.primary,
  '#0D9488',
  '#0284C7',
  mintPalette.creditJade,
  '#16A34A',
  '#4F46E5',
  '#7C3AED',
  '#0891B2',
] as const;

/**
 * Stable string hash (djb2-xor) mapped onto the fallback palette.
 *
 * Deterministic on purpose: the same person always gets the same colour, in
 * every view and across reloads, without storing anything.
 */
export function hashStringToColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_FALLBACK_COLORS.length;
  return AVATAR_FALLBACK_COLORS[index];
}

/** First two initials, resilient to extra spaces, punctuation and emoji names. */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function resolveSize(size: UserAvatarSize): number {
  return typeof size === 'number' ? size : SIZE_MAP[size];
}

export const UserAvatar: FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  showTooltip = true,
  tooltipSubtitle,
  status,
  statusLabel,
  highlight = false,
  shape = 'circle',
  fallbackIcon,
  onClick,
  className,
  style,
}) => {
  const resolvedSize = resolveSize(size);
  const [imageFailed, setImageFailed] = useState(false);

  // A new URL deserves a fresh attempt: reset the failure latch when it changes.
  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const displayName = name.trim().length > 0 ? name.trim() : 'Unknown';
  const backgroundColor = useMemo(() => hashStringToColor(displayName), [displayName]);
  const showImage = Boolean(avatarUrl && avatarUrl.trim().length > 0) && !imageFailed;

  const initials = getInitials(displayName);
  const tone = status ? BALANCE_TONES[status] : undefined;
  const badgeSize = Math.max(8, Math.round(resolvedSize * 0.26));

  const statusBadge = tone ? (
    <span
      role="img"
      aria-label={statusLabel ?? `${displayName} status`}
      style={{
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: badgeSize,
        height: badgeSize,
        borderRadius: '50%',
        backgroundColor: tone.solid,
        border: `2px solid ${mintPalette.surface}`,
        boxSizing: 'content-box',
      }}
    />
  ) : null;

  const avatar = (
    <span
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        width: resolvedSize,
        height: resolvedSize,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <span
        aria-hidden={showImage ? undefined : true}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: shape === 'circle' ? '50%' : Math.round(resolvedSize * 0.28),
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: showImage ? mintPalette.slateDivider : backgroundColor,
          color: mintPalette.surface,
          fontWeight: typography.weights.semibold,
          fontSize: Math.max(10, Math.floor(resolvedSize * 0.4)),
          letterSpacing: typography.letterSpacing.tight,
          border: highlight
            ? `2px solid ${mintPalette.primary}`
            : `2px solid ${mintPalette.surface}`,
          boxShadow: elevation.sm,
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt={displayName}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          fallbackIcon ?? initials
        )}
      </span>

      {statusBadge && statusLabel ? (
        <Tooltip title={statusLabel} placement="right">
          {statusBadge}
        </Tooltip>
      ) : (
        statusBadge
      )}
    </span>
  );

  if (!showTooltip) return avatar;

  return (
    <Tooltip
      placement="top"
      title={
        tooltipSubtitle ? (
          <span style={{ display: 'block' }}>
            <strong style={{ display: 'block' }}>{displayName}</strong>
            <span style={{ opacity: 0.85 }}>{tooltipSubtitle}</span>
          </span>
        ) : (
          displayName
        )
      }
    >
      {avatar}
    </Tooltip>
  );
};

/** Overlapping avatar row for "paid by 3 people" style summaries. */
export interface AvatarStackProps {
  users: { id: string; name: string; avatarUrl?: string }[];
  size?: UserAvatarSize;
  /** How many avatars to render before collapsing into a `+N` chip. */
  max?: number;
  className?: string;
}

export const AvatarStack: FC<AvatarStackProps> = ({ users, size = 'sm', max = 3, className }) => {
  const resolvedSize = resolveSize(size);
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  if (users.length === 0) return null;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
      aria-label={`${users.length} people`}
    >
      {visible.map((user, index) => (
        <span
          key={user.id}
          style={{ marginLeft: index === 0 ? 0 : -Math.round(resolvedSize * 0.3), zIndex: index }}
        >
          <UserAvatar
            name={user.name}
            avatarUrl={user.avatarUrl}
            size={resolvedSize}
            showTooltip
          />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          style={{
            marginLeft: -Math.round(resolvedSize * 0.3),
            width: resolvedSize,
            height: resolvedSize,
            borderRadius: '50%',
            backgroundColor: mintPalette.slateDark,
            color: mintPalette.surface,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(9, Math.floor(resolvedSize * 0.34)),
            fontWeight: typography.weights.semibold,
            border: `2px solid ${mintPalette.surface}`,
            zIndex: visible.length,
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
};

'use client';

/** Compact Material-outlined style icon set (24px grid, currentColor strokes).
 * Kept dependency-free so the web app is fully self-contained. */

type IconName =
  | 'grid_view'
  | 'sync_alt'
  | 'corporate_fare'
  | 'analytics'
  | 'account_balance_wallet'
  | 'receipt_long'
  | 'account_balance'
  | 'notifications'
  | 'chevron_right'
  | 'chevron_down'
  | 'arrow_forward'
  | 'arrow_outward'
  | 'check'
  | 'plus'
  | 'search'
  | 'close'
  | 'visibility'
  | 'visibility_off'
  | 'upload'
  | 'download'
  | 'more_vert'
  | 'hub'
  | 'shield'
  | 'verified'
  | 'progress_activity'
  | 'attach_file'
  | 'flag'
  | 'logout'
  | 'settings'
  | 'group'
  | 'description'
  | 'filter_list'
  | 'refresh'
  | 'play_arrow'
  | 'warning'
  | 'error'
  | 'link'
  | 'folder'
  | 'cash'
  | 'event'
  | 'person'
  | 'edit'
  | 'delete'
  | 'inbox'
  | 'radio_checked'
  | 'radio_unchecked'
  | 'menu'
  | 'add';

const PATHS: Record<IconName, React.ReactNode> = {
  grid_view: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </>
  ),
  sync_alt: (
    <>
      <path d="M15 4 20 9M20 9 15 14M5 15 4 20 9 15" />
      <path d="M6 9V7a3 3 0 0 1 3-3h6" />
      <path d="M18 15v2a3 3 0 0 1-3 3H9" />
    </>
  ),
  corporate_fare: (
    <>
      <path d="M3 21V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v17" />
      <path d="M13 8h7a1 1 0 0 1 1 1v12" />
      <path d="M3 21h18" />
      <path d="M6 7h2M6 11h2M6 15h2M16 11v0M16 15v0" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 21h18" />
      <path d="M6 17v-6M11 17V7M16 17v-9M21 17v-4" />
    </>
  ),
  account_balance_wallet: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
      <path d="M3 6h4" />
    </>
  ),
  receipt_long: (
    <>
      <path d="M5 3h14v18l-2-1.5L15 21l-2-1.5L11 21l-2-1.5L7 21l-2-1.5Z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </>
  ),
  account_balance: (
    <>
      <path d="M3 9h18M5 9V19M19 9V19M9 19v-7a3 3 0 0 1 6 0v7" />
      <path d="M4 5l8-2 8 2L12 8Z" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  chevron_right: <path d="m9 6 6 6-6 6" />,
  chevron_down: <path d="m6 9 6 6 6-6" />,
  arrow_forward: (
    <>
      <path d="M4 12h15M14 6l6 6-6 6" />
    </>
  ),
  arrow_outward: (
    <>
      <path d="M7 17 17 7M8 7h9v9" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  visibility: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  visibility_off: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10.6 6.6A9.8 9.8 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a17.4 17.4 0 0 1-2.9 3.6" />
      <path d="M6.6 7A16 16 0 0 0 2.5 12s3.5 5.5 9.5 5.5a9.4 9.4 0 0 0 3.4-.6" />
      <path d="M9.5 9.4a3 3 0 0 0 4 4.2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7 9l5-5 5 5" />
      <path d="M5 19h14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 19h14" />
    </>
  ),
  more_vert: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  hub: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="4.5" cy="18" r="2" />
      <circle cx="19.5" cy="18" r="2" />
      <path d="M12 6.5 6 16M12 6.5l6 9.5M6.5 18h11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  verified: (
    <>
      <path d="m12 2.5 2.4 1.8 3-.3 1 2.8 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.8-3-.3L12 21.5 9.6 19.7l-3 .3-1-2.8-2.5-1.7.9-2.9-.9-2.9 2.5-1.7 1-2.8 3 .3Z" />
      <path d="m8.5 12 2.3 2.3 4.7-4.6" />
    </>
  ),
  progress_activity: (
    <>
      <path d="M20 12a8 8 0 1 1-8-8" />
    </>
  ),
  attach_file: (
    <>
      <path d="M16.5 6.5v11a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v11a1.5 1.5 0 0 1-3 0V6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" />
      <path d="M13 8l4 4-4 4M17 12H8" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4L9.4 5.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.8 2.5h4l.8-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />
    </>
  ),
  group: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M17 15.4c2.4.5 4 2 4 4.6" />
    </>
  ),
  description: (
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  filter_list: (
    <>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
    </>
  ),
  play_arrow: <path d="M7 5v14l11-7Z" />,
  warning: (
    <>
      <path d="M12 3 2.5 20h19Z" />
      <path d="M12 9v5M12 17.5v.5" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V13M12 16.5v.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.6.4l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
      <path d="M14 10a4 4 0 0 0-5.6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M3 9h18" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10v.1M18 14v.1" />
    </>
  ),
  event: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13h4l2 3h5l2-3h4" />
      <path d="M3.5 13V7a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v6" />
      <path d="M3.5 15v3a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-3" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  radio_checked: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  radio_unchecked: <circle cx="12" cy="12" r="8.5" />,
};

export function Icon({
  name,
  size = 18,
  className,
  filled,
}: {
  name: IconName;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
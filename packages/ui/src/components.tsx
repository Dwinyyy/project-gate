import type { ComponentProps, ReactNode } from 'react';

export type IconName =
  | 'system'
  | 'map'
  | 'activity'
  | 'community'
  | 'inventory'
  | 'body'
  | 'identity'
  | 'arrow'
  | 'lock'
  | 'refresh'
  | 'shield'
  | 'check';

const iconPaths: Record<IconName, ReactNode> = {
  system: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  map: (
    <>
      <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16" />
    </>
  ),
  activity: (
    <>
      <path d="M4 5h16M4 12h10M4 19h7M18 10l-3 5h4l-3 6" />
    </>
  ),
  community: (
    <>
      <path d="M4 4h16v12H9l-5 4V4Z" />
      <path d="M8 8h8M8 12h5" />
    </>
  ),
  inventory: (
    <>
      <path d="m4 7 8-4 8 4v13H4V7ZM4 8h16M9 12h6" />
      <path d="M9 3v5M15 3v5" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M5 10h14M12 8v7m0 0-5 6m5-6 5 6" />
    </>
  ),
  identity: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M6 15c0-3 5-3 5 0M14 10h4M14 14h3" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="M12 8v5m0 3v.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
};

export function Icon({ name, ...props }: { name: IconName } & ComponentProps<'svg'>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

export function SystemMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="36"
      height="40"
      viewBox="0 0 36 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M18 2 33 11v18L18 38 3 29V11L18 2Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="m18 8 3 9 8 3-8 3-3 9-3-9-8-3 8-3 3-9Z" fill="currentColor" />
    </svg>
  );
}

export function StatusBadge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'positive' | 'warning';
}) {
  return (
    <span className={`hw-badge hw-badge--${tone}`}>
      <span className="hw-badge-dot" />
      {children}
    </span>
  );
}

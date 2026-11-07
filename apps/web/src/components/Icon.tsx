// A handful of line icons drawn inline (no icon library to download).
export type IconName =
  | 'search'
  | 'list'
  | 'book'
  | 'bookmark'
  | 'bookmark-fill'
  | 'menu'
  | 'close'
  | 'share'
  | 'globe'
  | 'refresh'
  | 'chevron'
  | 'info'
  | 'download'
  | 'layers'
  | 'users'
  | 'copy'
  | 'print'
  | 'file'
  | 'toc';

const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zm2 14h13M8 7h7',
  bookmark: 'M6 3h12v18l-6-4-6 4V3z',
  'bookmark-fill': 'M6 3h12v18l-6-4-6 4V3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  refresh: 'M20 11a8 8 0 0 0-14-5l-2 2m0-4v4h4M4 13a8 8 0 0 0 14 5l2-2m0 4v-4h-4',
  chevron: 'M15 6l-6 6 6 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v5m0-8h.01',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 15a6 6 0 0 1 4 5v1',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  print: 'M7 9V3h10v6M7 18H4v-7h16v7h-3M7 14h10v7H7z',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h7',
  toc: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h7',
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill={name === 'bookmark-fill' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

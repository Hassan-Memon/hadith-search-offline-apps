import { type ReactNode, useEffect, useState } from 'react';

import { Link, NavLink } from 'react-router';

import { listAnnouncements, markAnnouncementSeen, stripHtml } from '@tehqeqat/core';

import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';
import { BASE } from '../config';
import { useApp } from '../sync/store';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: t.nav.search, icon: 'search', end: true },
  { to: '/all', label: t.nav.all, icon: 'list' },
  { to: '/books', label: t.nav.books, icon: 'book' },
  { to: '/saved', label: t.nav.saved, icon: 'bookmark' },
  { to: '/more', label: t.nav.more, icon: 'menu' },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label={t.appName}>
            <img src={`${BASE}icons/mark.svg`} alt="" width="28" height="28" />
            <span>{t.appName}</span>
          </Link>
          <nav className="topnav" aria-label="اہم صفحات">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/about">{t.nav.about}</NavLink>
          </nav>
          <SyncBadge />
        </div>
      </header>
      <Announcement />
      <main className="main">{children}</main>
      <nav className="tabbar" aria-label="اہم صفحات">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SyncBadge() {
  const { syncing, progress, online, lastResult } = useApp();
  let label = t.sync.badgeOk;
  let tone = 'ok';
  if (syncing) {
    const pct = progress?.fraction !== undefined ? ` ${Math.round(progress.fraction * 100)}٪` : '';
    label = t.sync.badgeSyncing + pct;
    tone = 'busy';
  } else if (!online) {
    label = t.sync.badgeOffline;
    tone = 'off';
  } else if (lastResult?.status === 'error') {
    label = t.sync.badgeError;
    tone = 'warn';
  }
  return (
    <Link to="/more" className={`badge badge--${tone}`} aria-live="polite">
      <span className="badge__dot" aria-hidden="true" />
      {label}
    </Link>
  );
}

// The website's text-banner announcement, shown once per announcement.
function Announcement() {
  const [closed, setClosed] = useState<string | null>(null);
  const { data } = useQuery(() => listAnnouncements(db), []);
  const banner = data?.find((a) => a.type === 'text-banner' && !a.seen_at);
  useEffect(() => setClosed(null), [banner?.id]);
  if (!banner || closed === banner.id) return null;
  const title = typeof banner.title === 'string' ? banner.title : '';
  const content = typeof banner.content === 'string' ? stripHtml(banner.content) : '';
  return (
    <div className="announce" role="status">
      <p>
        {title && <strong>{title} </strong>}
        {content}
      </p>
      <button
        type="button"
        className="icon-btn"
        aria-label="بند کریں"
        onClick={() => {
          setClosed(banner.id);
          void markAnnouncementSeen(db, banner.id);
        }}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="page-title">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}

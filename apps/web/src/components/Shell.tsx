import { type ReactNode, useEffect, useState } from 'react';

import { Link, NavLink, useLocation } from 'react-router';

import logo from '@assets/images/logo.svg';
import { listAnnouncements, markAnnouncementSeen, stripHtml } from '@tehqeqat/core';

import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';
import { patchApp, useApp } from '../sync/store';
import { applyUpdate } from '../update';
import { Icon, type IconName } from './Icon';

// The header's links, as on the website since 13 Nov 2026 (the app adds
// «محفوظ»). «ابواب» is not a menu entry: it is a view of «تمام احادیث», the
// switch at the top of /all and /chapters, and both light «تمام احادیث».
const TOP: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: t.nav.home, end: true },
  { to: '/search', label: t.nav.search },
  { to: '/all', label: t.nav.all },
  { to: '/narrators', label: t.nav.narrators },
  { to: '/books', label: t.nav.books },
  { to: '/about', label: t.nav.about },
  { to: '/saved', label: t.nav.saved },
];

// The bottom bar on phones: the website's صفحۂ اول، تلاش، احادیث، روات, with
// the app's «مزید» (محفوظ، کتب خانہ، تعارف, settings and data) where the
// website has کتب.
const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: t.nav.tab.home, icon: 'home', end: true },
  { to: '/search', label: t.nav.tab.search, icon: 'search' },
  { to: '/all', label: t.nav.tab.all, icon: 'book-open' },
  { to: '/narrators', label: t.nav.tab.narrators, icon: 'users' },
  { to: '/more', label: t.nav.tab.more, icon: 'menu' },
];

/** «/chapters» is the by-chapter view of «تمام احادیث», so it lights that entry. */
function useActive() {
  const { pathname } = useLocation();
  return (to: string, isActive: boolean) =>
    isActive || (to === '/all' && pathname.startsWith('/chapters')) ? 'active' : undefined;
}

/**
 * The website's lockup: the calligraphy is the book's name, «غیر معتبر روایات
 * کا فنی جائزہ», with the site's name, «تحقیقاتِ حدیث», in a small line under it.
 */
export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={`logo ${className ?? ''}`}>
      <img src={logo} alt={t.bookTitle} width="211" height="54" />
      {withName && <span className="logo__name">{t.appName}</span>}
    </span>
  );
}

/** «اوپر جائیں»: a round button once the reader is far down a long page. */
function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => setShown(window.scrollY > 1200);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <button
      type="button"
      className={`back-to-top no-print ${shown ? 'back-to-top--shown' : ''}`}
      aria-label={t.nav.backToTop}
      title={t.nav.backToTop}
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <Icon name="up" />
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const active = useActive();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label={t.appName}>
            <Logo />
          </Link>
          <nav className="topnav" aria-label={t.nav.menu}>
            {TOP.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => active(n.to, isActive)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <SyncBadge />
          <Link to="/more" className="icon-btn topbar__menu" aria-label={t.nav.more}>
            <Icon name="menu" />
          </Link>
        </div>
      </header>
      <UpdateBanner />
      <Announcement />
      <main className="main">{children}</main>
      <BackToTop />
      <nav className="tabbar" aria-label={t.nav.menu}>
        <ul>
          {TABS.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => active(n.to, isActive)}>
                <span className="tabbar__icon">
                  <Icon name={n.icon} />
                </span>
                <span>{n.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** The website's dark footer: what it is, the main pages and how to reach the author. */
export function SiteFooter() {
  const links: [string, string][] = [
    ['/search', t.nav.search],
    ['/all', t.nav.all],
    ['/narrators', t.nav.narrators],
    ['/books', t.nav.books],
    ['/about', t.nav.about],
  ];
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__about">
          <Logo />
          <p>{t.heroDescription}</p>
        </div>
        <nav aria-label={t.footer.heading}>
          <p className="site-footer__heading">{t.footer.heading}</p>
          <ul className="site-footer__links">
            {links.map(([to, label]) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="site-footer__heading">{t.footer.contact}</p>
          <ul className="site-footer__contact">
            <li>
              <a href={t.footer.phoneLink}>
                <Icon name="phone" />
                <span>
                  {t.footer.mufti}: <span dir="ltr">{t.footer.phone}</span>
                </span>
              </a>
            </li>
            <li>
              <a href={`mailto:${t.footer.emailAddress}`}>
                <Icon name="mail" />
                <span>
                  {t.footer.email}: <span dir="ltr">{t.footer.emailAddress}</span>
                </span>
              </a>
            </li>
            <li>
              <a href={t.footer.feedbackLink} target="_blank" rel="noreferrer" className="site-footer__feedback">
                <Icon name="message" />
                <span>{t.footer.feedback}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="site-footer__rights">{t.footer.rights}</p>
    </footer>
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

// A new app version is waiting (it also applies by itself when the app goes
// to the background), or the app just updated itself.
function UpdateBanner() {
  const { updateReady, updatedTo } = useApp();
  if (updateReady) {
    return (
      <div className="announce" role="status">
        <p>{t.update.ready}</p>
        <button type="button" className="btn btn--primary" onClick={() => void applyUpdate()}>
          {t.update.apply}
        </button>
      </div>
    );
  }
  if (!updatedTo) return null;
  return (
    <div className="announce" role="status">
      <p>{t.update.done(updatedTo)}</p>
      <button type="button" className="icon-btn" aria-label="بند کریں" onClick={() => patchApp({ updatedTo: null })}>
        <Icon name="close" />
      </button>
    </div>
  );
}

// The website's text-banner announcement (its yellow bar), shown once per announcement.
function Announcement() {
  const [closed, setClosed] = useState<string | null>(null);
  const { data } = useQuery(() => listAnnouncements(db), []);
  const banner = data?.find((a) => a.type === 'text-banner' && !a.seen_at);
  useEffect(() => setClosed(null), [banner?.id]);
  if (!banner || closed === banner.id) return null;
  const title = typeof banner.title === 'string' ? banner.title : '';
  const content = typeof banner.content === 'string' ? stripHtml(banner.content) : '';
  const text = (
    <>
      {title && <strong>{title} </strong>}
      {content}
    </>
  );
  return (
    <div className="announce announce--site" role="status">
      <div className="ticker" aria-label={`${title} ${content}`}>
        <p className="ticker__track" aria-hidden="true">
          <span>{text}</span>
          <span>{text}</span>
        </p>
      </div>
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

/**
 * A page's heading in the website's tinted box: title, description and an
 * optional line under it (a count, a date).
 */
export function PageTitle({ title, sub, note, children }: { title: string; sub?: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-title">
      <h1>{title}</h1>
      {sub && <div className="page-title__sub">{sub}</div>}
      {note && <p className="page-title__note">{note}</p>}
      {children}
    </header>
  );
}

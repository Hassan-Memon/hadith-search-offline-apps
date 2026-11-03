import { useEffect, useState } from 'react';

import { Link } from 'react-router';

import { getSetting, listFiles } from '@tehqeqat/core';

import { Icon } from '../components/Icon';
import { PageTitle } from '../components/Shell';
import { APP_VERSION, WEBSITE } from '../config';
import { db } from '../db/client';
import { usePref, useQuery } from '../hooks';
import { fmtDate, t } from '../strings';
import { resetData, runSync, useApp } from '../sync/store';

// Chrome/Edge fire this when the app can be installed; Safari never does.
type InstallPrompt = Event & { prompt: () => Promise<void> };
let deferred: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
});

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function MorePage() {
  const app = useApp();
  const [font, setFont] = usePref<'mehr' | 'jameel'>('font', 'mehr');
  const [size, setSize] = usePref<'s' | 'm' | 'l' | 'xl'>('size', 'm');
  const [theme, setTheme] = usePref<'system' | 'light' | 'dark'>('theme', 'system');
  const [canInstall, setCanInstall] = useState(Boolean(deferred));
  const [confirmReset, setConfirmReset] = useState(false);
  const [storage, setStorage] = useState<string>('');
  const published = useQuery(() => getSetting(db, 'data_generated_at'), []);

  useEffect(() => {
    const onPrompt = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage && setStorage(`${Math.round(e.usage / 1e6)} MB`))
      .catch(() => undefined);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [app.dataVersion]);

  const result = app.lastResult;
  return (
    <div className="page more">
      <PageTitle title={t.more.title} />

      <section className="card panel">
        <h2>{t.more.syncTitle}</h2>
        <p>{t.more.stored(app.hadithCount)}</p>
        <p className="muted">
          {t.sync.last} {fmtDate(app.lastSyncAt)}
        </p>
        {published.data && (
          <p className="muted small">
            {t.sync.published} {fmtDate(published.data)}
          </p>
        )}
        {result?.status === 'error' && (
          <p className="warn">
            {t.sync.error} {result.error}
          </p>
        )}
        {result?.status === 'update-required' && <p className="warn">{t.sync.updateRequired}</p>}
        {!app.persistent && <p className="warn">{t.sync.notPersistent}</p>}
        <button type="button" className="btn" disabled={app.syncing || !app.online} onClick={() => void runSync()}>
          <Icon name="refresh" />
          {app.syncing ? t.sync.badgeSyncing : app.online ? t.sync.now : t.sync.badgeOffline}
        </button>
        {storage && (
          <p className="muted small">
            {t.more.storage}: {storage}
          </p>
        )}
      </section>

      <section className="card panel">
        <h2>{t.more.appearance}</h2>
        <fieldset>
          <legend>{t.more.font}</legend>
          <label>
            <input type="radio" name="font" checked={font === 'mehr'} onChange={() => setFont('mehr')} />
            {t.more.fontMehr}
          </label>
          <label>
            <input type="radio" name="font" checked={font === 'jameel'} onChange={() => setFont('jameel')} />
            {t.more.fontJameel}
          </label>
        </fieldset>
        <fieldset>
          <legend>{t.more.textSize}</legend>
          <div className="seg">
            {(['s', 'm', 'l', 'xl'] as const).map((s, i) => (
              <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>
                <span style={{ fontSize: `${0.85 + i * 0.15}em` }}>ا</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t.more.theme}</legend>
          <div className="seg">
            {(
              [
                ['system', t.more.themeSystem],
                ['light', t.more.themeLight],
                ['dark', t.more.themeDark],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={theme === v} onClick={() => setTheme(v)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card panel">
        <h2>{t.more.install}</h2>
        {isStandalone() ? (
          <p>{t.more.installed}</p>
        ) : (
          <>
            {canInstall && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={async () => {
                  await deferred?.prompt();
                  deferred = null;
                  setCanInstall(false);
                }}
              >
                <Icon name="download" />
                {t.more.installButton}
              </button>
            )}
            <dl className="install-help">
              {t.more.installHelp.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <section className="card panel links">
        <Link to="/about">
          <Icon name="info" />
          {t.nav.about}
        </Link>
        <Link to="/library">
          <Icon name="book" />
          {t.more.library}
        </Link>
        <a href={WEBSITE} target="_blank" rel="noreferrer">
          <Icon name="globe" />
          {t.more.website}
        </a>
        <p className="muted small">
          {t.more.version} {APP_VERSION}
        </p>
      </section>

      <section className="card panel">
        {confirmReset ? (
          <>
            <p className="warn">{t.more.resetConfirm}</p>
            <div className="row">
              <button
                type="button"
                className="btn btn--danger"
                onClick={async () => {
                  setConfirmReset(false);
                  await resetData();
                }}
              >
                {t.more.yes}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                {t.more.no}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmReset(true)}>
            {t.more.reset}
          </button>
        )}
      </section>
    </div>
  );
}

export function LibraryPage() {
  const files = useQuery(() => listFiles(db), []);
  return (
    <div className="page">
      <PageTitle title={t.library.title} sub={t.library.note} />
      {files.data && files.data.length === 0 && <p className="empty">{t.library.empty}</p>}
      <ul className="files">
        {files.data?.map((f) => (
          <li key={f.id} className="card file">
            <span className="urdu">{f.name.replace(/\.pdf$/i, '')}</span>
            <a className="btn" href={f.url} target="_blank" rel="noreferrer">
              {t.library.open}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

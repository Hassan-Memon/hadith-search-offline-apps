import { lazy, Suspense } from 'react';

import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router';

import { Logo, Shell } from './components/Shell';
import { BASE } from './config';
import { HadithPage } from './pages/Hadith';
import { AllPage, BookPage, BooksPage, ChapterPage, ChaptersPage } from './pages/Lists';
import { LibraryPage, MorePage } from './pages/More';
import { SavedPage } from './pages/Saved';
import { HomePage, SearchPage } from './pages/Search';
import { t } from './strings';
import { retryOpen, runSync, useApp } from './sync/store';

// The تعارف page carries long texts and the scans' URLs: its own chunk, so
// the app starts without it (the service worker still caches it on install).
const AboutPage = lazy(() => import('./pages/About').then((m) => ({ default: m.AboutPage })));
const NarratorsPage = lazy(() => import('./pages/Narrators').then((m) => ({ default: m.NarratorsPage })));
const NarratorPage = lazy(() => import('./pages/Narrators').then((m) => ({ default: m.NarratorPage })));

// Website URLs map onto app URLs, so a shared /hadees-detail/<slug> link
// opened in the app lands on the same narration.
function LegacyDetail() {
  const { slug = '' } = useParams();
  return <Navigate to={`/hadith/${slug}`} replace />;
}

function LegacySearch() {
  const { search } = useLocation();
  return <Navigate to={`/search${search}`} replace />;
}

function FirstRun() {
  const { syncing, progress, lastResult, online, fatal } = useApp();
  const pct = progress?.fraction !== undefined ? Math.round(progress.fraction * 100) : null;
  return (
    <div className="firstrun">
      <span className="firstrun__logo">
        <Logo />
      </span>
      <h1>{t.appName}</h1>
      <h2>{t.sync.firstTitle}</h2>
      <p>{t.sync.firstBody}</p>
      <p className="muted small">{t.sync.size}</p>
      {fatal && <p className="warn">{fatal}</p>}
      {syncing && (
        <div className="progress" aria-live="polite">
          <div className="progress__bar">
            <span style={{ width: `${pct ?? 5}%` }} />
          </div>
          <p>
            {t.sync.phase[progress?.phase ?? 'manifest']} {pct !== null && <span dir="ltr">{pct}%</span>}
          </p>
        </div>
      )}
      {!syncing && !online && <p className="warn">{t.sync.offlineFirst}</p>}
      {!syncing && online && lastResult?.status === 'error' && (
        <>
          <p className="warn">
            {t.sync.error} {lastResult.error}
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void runSync()}>
            {t.sync.retry}
          </button>
        </>
      )}
      {lastResult?.status === 'update-required' && <p className="warn">{t.sync.updateRequired}</p>}
    </div>
  );
}

/** Shown for the moment it takes to open the database on a normal start. */
function Opening() {
  return (
    <div className="firstrun" aria-busy="true">
      <span className="firstrun__logo">
        <Logo />
      </span>
      <h1>{t.appName}</h1>
      <p className="muted small">{t.sync.opening}</p>
    </div>
  );
}

/** Another window or tab of the app kept the database. */
function Busy() {
  return (
    <div className="firstrun">
      <span className="firstrun__logo">
        <Logo />
      </span>
      <h1>{t.appName}</h1>
      <p>{t.sync.busy}</p>
      <button type="button" className="btn btn--primary" onClick={retryOpen}>
        {t.sync.retry}
      </button>
    </div>
  );
}

export function App() {
  const { dbReady, dbBusy, hadithCount, fatal } = useApp();
  if (dbBusy) return <Busy />;
  if (fatal || (dbReady && hadithCount === 0)) return <FirstRun />;
  if (!dbReady) return <Opening />;
  return (
    <BrowserRouter basename={BASE.replace(/\/$/, '') || '/'}>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/all" element={<AllPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/books/:book" element={<BookPage />} />
          <Route path="/hadith/:slug" element={<HadithPage />} />
          <Route path="/hadees-detail/:slug" element={<LegacyDetail />} />
          <Route path="/chapters" element={<ChaptersPage />} />
          <Route path="/chapters/:slug" element={<ChapterPage />} />
          <Route
            path="/narrators"
            element={
              <Suspense fallback={null}>
                <NarratorsPage />
              </Suspense>
            }
          />
          <Route
            path="/narrators/:slug"
            element={
              <Suspense fallback={null}>
                <NarratorPage />
              </Suspense>
            }
          />
          {/* The website's paths, for links shared from it. */}
          <Route path="/all-hadees" element={<Navigate to="/all" replace />} />
          <Route path="/search-hadees" element={<LegacySearch />} />
          <Route path="/topics" element={<Navigate to="/chapters" replace />} />
          <Route
            path="/about"
            element={
              <Suspense fallback={null}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';

import { Shell } from './components/Shell';
import { AboutPage } from './pages/About';
import { HadithPage } from './pages/Hadith';
import { AllPage, BookPage, BooksPage } from './pages/Lists';
import { LibraryPage, MorePage } from './pages/More';
import { SavedPage } from './pages/Saved';
import { HomePage, SearchPage } from './pages/Search';
import { t } from './strings';
import { runSync, useApp } from './sync/store';

// Website URLs map onto app URLs, so a shared /hadees-detail/<slug> link
// opened in the app lands on the same narration.
function LegacyDetail() {
  const { slug = '' } = useParams();
  return <Navigate to={`/hadith/${slug}`} replace />;
}

function FirstRun() {
  const { syncing, progress, lastResult, online, fatal } = useApp();
  const pct = progress?.fraction !== undefined ? Math.round(progress.fraction * 100) : null;
  return (
    <div className="firstrun">
      <img src="/icons/mark.svg" alt="" width="72" height="72" />
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

export function App() {
  const { dbReady, hadithCount, fatal } = useApp();
  if (!dbReady || hadithCount === 0 || fatal) return <FirstRun />;
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/all" element={<AllPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/books/:book" element={<BookPage />} />
          <Route path="/hadith/:slug" element={<HadithPage />} />
          <Route path="/hadees-detail/:slug" element={<LegacyDetail />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

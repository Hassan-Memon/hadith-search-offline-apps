import { type CSSProperties, type FormEvent, useEffect, useState } from 'react';

import { Link, useNavigate, useSearchParams } from 'react-router';

import {
  groupBooks,
  listBooks,
  listChapters,
  listHadith,
  listHistory,
  searchHadith,
  type SearchHit,
  type SearchResult,
} from '@tehqeqat/core';

import heroImage from '@assets/images/hero.webp';

import { HadithCard, HadithList } from '../components/HadithCard';
import { Icon, type IconName } from '../components/Icon';
import { PageTitle, SiteFooter } from '../components/Shell';
import { PAGE_SIZE } from '../config';
import { db } from '../db/client';
import { useChapterNames, useQuery } from '../hooks';
import { t } from '../strings';
import { useApp } from '../sync/store';

/** Search URL that keeps the current filters. */
function searchHref(q: string, book: string, chapter: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (book) params.set('book', book);
  if (chapter) params.set('chapter', chapter);
  const query = params.toString();
  return `/search${query ? `?${query}` : ''}`;
}

export function SearchBox({
  initial = '',
  autoFocus = false,
  book = '',
  chapter = '',
  hero = false,
}: {
  initial?: string;
  autoFocus?: boolean;
  book?: string;
  chapter?: string;
  /** The home page's box on the dark picture: the button stands apart, as on the website. */
  hero?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const navigate = useNavigate();
  useEffect(() => setValue(initial), [initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q || book || chapter) navigate(searchHref(q, book, chapter));
  };
  return (
    <form className={`searchbox ${hero ? 'searchbox--hero' : ''}`} role="search" onSubmit={submit}>
      <label htmlFor="q" className="sr-only">
        {t.search.placeholder}
      </label>
      <input
        id="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={t.search.placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" aria-label={t.search.button}>
        <Icon name="search" />
      </button>
    </form>
  );
}

// «یہاں کیا ہے؟»: the website's six cards (the app's «محفوظ» is in the bottom bar).
const CARDS: { to: string; icon: IconName; label: string; text: string }[] = [
  { to: '/search', icon: 'search', label: t.search.title, text: t.home.cards.search },
  { to: '/all', icon: 'book-open', label: t.nav.all, text: t.home.cards.all },
  { to: '/chapters', icon: 'grid', label: t.nav.chapters, text: t.home.cards.chapters },
  { to: '/narrators', icon: 'users', label: t.nav.narrators, text: t.home.cards.narrators },
  { to: '/books', icon: 'library', label: t.nav.books, text: t.home.cards.books },
  { to: '/about', icon: 'info', label: t.nav.about, text: t.home.cards.about },
];

export function HomePage() {
  const { hadithCount } = useApp();
  const history = useQuery(() => listHistory(db, 5), []);
  const books = useQuery(() => listBooks(db), []);
  // Two stored spellings of one volume are one volume.
  const volumes = books.data ? new Set(groupBooks(books.data).series.map((s) => s.volume)).size : 0;
  return (
    <div className="home">
      <section className="hero" style={{ '--hero-image': `url(${heroImage})` } as CSSProperties}>
        <div className="hero__inner">
          <h1>{t.appTagline}</h1>
          <p className="hero__text">{t.heroDescription}</p>
          <SearchBox hero />
          {hadithCount > 0 && (
            <p className="hero__meta">
              {t.home.stats(hadithCount, volumes)} · {t.search.hint}
            </p>
          )}
        </div>
      </section>

      <section className="explore">
        <h2>{t.home.explore}</h2>
        <ul className="nav-cards">
          {CARDS.map((c) => (
            <li key={c.to}>
              <Link to={c.to} className="nav-card">
                <span className="nav-card__icon">
                  <Icon name={c.icon} />
                </span>
                <span className="nav-card__body">
                  <span className="nav-card__title">{c.label}</span>
                  <span className="nav-card__text">{c.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {history.data && history.data.length > 0 && (
        <section className="section home__recent">
          <h2 className="section-title">{t.home.recent}</h2>
          <HadithList items={history.data} />
        </section>
      )}
      <SiteFooter />
    </div>
  );
}

function Filters({ q, book, chapter }: { q: string; book: string; chapter: string }) {
  const navigate = useNavigate();
  const books = useQuery(() => listBooks(db), []);
  const chapters = useQuery(() => listChapters(db), []);
  const usedChapters = (chapters.data ?? []).filter((c) => c.count > 0);
  return (
    <div className="filters">
      <label>
        <span>{t.search.filterBook}:</span>
        <select value={book} onChange={(e) => navigate(searchHref(q, e.target.value, chapter), { replace: true })}>
          <option value="">{t.search.allBooks}</option>
          {(books.data ?? []).map((b) => (
            <option key={b.book} value={b.book}>
              {b.book}
            </option>
          ))}
        </select>
      </label>
      {usedChapters.length > 0 && (
        <label>
          <span>{t.search.filterChapter}:</span>
          <select
            value={chapter}
            onChange={(e) => navigate(searchHref(q, book, e.target.value), { replace: true })}
          >
            <option value="">{t.search.allChapters}</option>
            {usedChapters.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(book || chapter) && (
        <button type="button" className="btn btn--small" onClick={() => navigate(searchHref(q, '', ''), { replace: true })}>
          {t.search.clearFilters}
        </button>
      )}
    </div>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const book = params.get('book') ?? '';
  const chapter = params.get('chapter') ?? '';
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [q, book, chapter]);
  const filtered = Boolean(book || chapter);
  const result = useQuery<SearchResult | null>(async () => {
    const size = PAGE_SIZE * pages;
    if (q.trim()) return searchHadith(db, q, { page: 1, pageSize: size, book, chapter });
    // A filter with no words lists that book or باب, like the website.
    if (!filtered) return null;
    const list = await listHadith(db, { page: 1, pageSize: size, book, chapter });
    return { total: list.total, page: 1, pageSize: size, hits: list.items.map((i) => ({ ...i, tier: 0, snippet: '' })) };
  }, [q, book, chapter, pages]);
  const chapterNames = useChapterNames();
  const hits: SearchHit[] = result.data?.hits ?? [];
  const shown = (q.trim() || filtered) && result.data;
  useEffect(() => {
    document.title = `${q.trim() ? `${q.trim()} | ` : ''}${t.search.title} | ${t.appName}`;
  }, [q]);
  return (
    <div className="page">
      <PageTitle title={t.search.title} sub={t.search.description}>
        <SearchBox initial={q} book={book} chapter={chapter} autoFocus={!q && !filtered} />
        <Filters q={q} book={book} chapter={chapter} />
        {!q.trim() && (
          <ul className="examples" aria-label={t.search.examples}>
            <li className="examples__label">{t.search.examples}</li>
            {t.search.exampleWords.map((word) => (
              <li key={word}>
                <Link to={searchHref(word, book, chapter)} className="example">
                  {word}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageTitle>
      {shown && (
        <p className="result-count" aria-live="polite">
          {t.search.results(result.data!.total)}
        </p>
      )}
      {shown && result.data!.relaxed && <p className="note">{t.search.relaxed}</p>}
      {shown && result.data!.total === 0 && (
        <div className="empty">
          <p className="empty__title">{t.search.none}</p>
          <p>{t.search.noneHint}</p>
        </div>
      )}
      {hits.length > 0 && (
        <ol className="hadith-list">
          {hits.map((h) => (
            <li key={h.id}>
              <HadithCard
                item={h}
                query={q || undefined}
                snippet={h.snippet || undefined}
                chapterName={!chapter && h.chapter ? chapterNames?.get(h.chapter) : undefined}
              />
            </li>
          ))}
        </ol>
      )}
      {result.data && hits.length < result.data.total && (
        <button type="button" className="btn btn--wide" onClick={() => setPages((p) => p + 1)}>
          {t.list.loadMore}
        </button>
      )}
    </div>
  );
}

import { type FormEvent, useEffect, useState } from 'react';

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

import { HadithCard, HadithList } from '../components/HadithCard';
import { Icon, type IconName } from '../components/Icon';
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
}: {
  initial?: string;
  autoFocus?: boolean;
  book?: string;
  chapter?: string;
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
    <form className="searchbox" role="search" onSubmit={submit}>
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

const CARDS: { to: string; icon: IconName; label: string; text: string }[] = [
  { to: '/all', icon: 'list', label: t.nav.all, text: t.home.cards.all },
  { to: '/chapters', icon: 'layers', label: t.nav.chapters, text: t.home.cards.chapters },
  { to: '/narrators', icon: 'users', label: t.nav.narrators, text: t.home.cards.narrators },
  { to: '/books', icon: 'book', label: t.nav.books, text: t.home.cards.books },
  { to: '/about', icon: 'info', label: t.nav.about, text: t.home.cards.about },
  { to: '/saved', icon: 'bookmark', label: t.nav.saved, text: t.home.cards.saved },
];

export function HomePage() {
  const { hadithCount } = useApp();
  const history = useQuery(() => listHistory(db, 5), []);
  const books = useQuery(() => listBooks(db), []);
  // Two stored spellings of one volume are one volume.
  const volumes = books.data ? new Set(groupBooks(books.data).series.map((s) => s.volume)).size : 0;
  return (
    <div className="home">
      <section className="hero">
        <h1>{t.appTagline}</h1>
        <SearchBox />
        <p className="hero__meta">
          {hadithCount > 0 && t.home.stats(hadithCount, volumes)} · {t.search.hint}
        </p>
      </section>

      <section className="tiles" aria-label={t.home.explore}>
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="tile">
            <Icon name={c.icon} />
            <span className="tile__label">{c.label}</span>
            <span className="tile__text">{c.text}</span>
          </Link>
        ))}
      </section>

      {history.data && history.data.length > 0 && (
        <section className="section">
          <h2>{t.home.recent}</h2>
          <HadithList items={history.data} />
        </section>
      )}
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
        <span>{t.search.filterBook}</span>
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
          <span>{t.search.filterChapter}</span>
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
  return (
    <div className="page">
      <SearchBox initial={q} book={book} chapter={chapter} />
      <Filters q={q} book={book} chapter={chapter} />
      {shown && (
        <p className="result-count" aria-live="polite">
          {t.search.results(result.data!.total)}
        </p>
      )}
      {shown && result.data!.total === 0 && <p className="empty">{t.search.none}</p>}
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

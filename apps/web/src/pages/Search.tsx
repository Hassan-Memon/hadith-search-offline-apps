import { type FormEvent, useEffect, useState } from 'react';

import { Link, useNavigate, useSearchParams } from 'react-router';

import { groupBooks, listBooks, listHistory, searchHadith, type SearchHit } from '@tehqeqat/core';

import { HadithCard, HadithList } from '../components/HadithCard';
import { Icon } from '../components/Icon';
import { PAGE_SIZE } from '../config';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';
import { useApp } from '../sync/store';

export function SearchBox({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  const navigate = useNavigate();
  useEffect(() => setValue(initial), [initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
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
        <Link to="/all" className="tile">
          <Icon name="list" />
          <span>{t.nav.all}</span>
        </Link>
        <Link to="/books" className="tile">
          <Icon name="book" />
          <span>{t.nav.books}</span>
        </Link>
        <Link to="/about" className="tile">
          <Icon name="info" />
          <span>{t.nav.about}</span>
        </Link>
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

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [q]);
  const result = useQuery(() => searchHadith(db, q, { page: 1, pageSize: PAGE_SIZE * pages }), [q, pages]);
  const hits: SearchHit[] = result.data?.hits ?? [];
  const snippets = new Map(hits.map((h) => [h.id, h.snippet]));
  return (
    <div className="page">
      <SearchBox initial={q} />
      {q && result.data && (
        <p className="result-count" aria-live="polite">
          {t.search.results(result.data.total)}
        </p>
      )}
      {q && result.data && result.data.total === 0 && <p className="empty">{t.search.none}</p>}
      {hits.length > 0 && (
        <ol className="hadith-list">
          {hits.map((h) => (
            <li key={h.id}>
              <HadithCard item={h} query={q} snippet={snippets.get(h.id)} />
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

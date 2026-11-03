import { useState } from 'react';

import { Link, useParams } from 'react-router';

import { groupBooks, listBooks, listHadith } from '@tehqeqat/core';

import { bookPath, HadithList } from '../components/HadithCard';
import { PageTitle } from '../components/Shell';
import { PAGE_SIZE } from '../config';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { fmt, t } from '../strings';

function PagedList({ book }: { book?: string }) {
  const [pages, setPages] = useState(1);
  const list = useQuery(() => listHadith(db, { book, page: 1, pageSize: PAGE_SIZE * pages }), [book, pages]);
  if (!list.data) return null;
  return (
    <>
      <p className="result-count">{t.list.count(list.data.total)}</p>
      <HadithList items={list.data.items} showBook={!book} />
      {list.data.items.length < list.data.total && (
        <button type="button" className="btn btn--wide" onClick={() => setPages((p) => p + 1)}>
          {t.list.loadMore}
        </button>
      )}
    </>
  );
}

export function AllPage() {
  return (
    <div className="page">
      <PageTitle title={t.nav.all} />
      <PagedList />
    </div>
  );
}

export function BookPage() {
  const book = decodeURIComponent(useParams().book ?? '');
  return (
    <div className="page">
      <nav className="crumbs">
        <Link to="/books">{t.books.title}</Link>
      </nav>
      <PageTitle title={book} />
      <PagedList book={book} />
    </div>
  );
}

export function BooksPage() {
  const books = useQuery(() => listBooks(db), []);
  if (!books.data) return null;
  const { series, others } = groupBooks(books.data);
  const sameVolume = new Map<number, number>();
  for (const s of series) sameVolume.set(s.volume, (sameVolume.get(s.volume) ?? 0) + 1);
  return (
    <div className="page">
      <PageTitle title={t.books.title} />
      <section className="section">
        <h2>{t.books.series}</h2>
        <p className="muted">{t.books.seriesNote}</p>
        <ul className="volumes">
          {series.map((s) => (
            <li key={s.book}>
              <Link to={bookPath(s.book)} className="volume">
                <span className="volume__no">{fmt(s.volume)}</span>
                <span className="volume__label">{s.label}</span>
                {(sameVolume.get(s.volume) ?? 0) > 1 && <span className="volume__full">{s.book}</span>}
                <span className="volume__count">{t.list.count(s.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {others.length > 0 && (
        <section className="section">
          <h2>{t.books.others}</h2>
          <ul className="others">
            {others.map((b) => (
              <li key={b.book}>
                <Link to={bookPath(b.book)} className="card other">
                  <span className="urdu">{b.book}</span>
                  <span className="muted">{t.list.count(b.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';

import { Link, useParams } from 'react-router';

import {
  chapterSamples,
  type ChapterCount,
  getBook,
  getChapter,
  groupBooks,
  listBooks,
  listChapters,
  listHadith,
} from '@tehqeqat/core';

import { bookPath, chapterPath, HadithCard, HadithList } from '../components/HadithCard';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/Shell';
import { PAGE_SIZE, WEBSITE } from '../config';
import { db } from '../db/client';
import { useChapterNames, useQuery } from '../hooks';
import { fmt, fmtDay, t } from '../strings';

function PagedList({ book, chapter }: { book?: string; chapter?: string }) {
  const [pages, setPages] = useState(1);
  const list = useQuery(
    () => listHadith(db, { book, chapter, page: 1, pageSize: PAGE_SIZE * pages }),
    [book, chapter, pages],
  );
  if (!list.data) return null;
  return (
    <>
      <p className="result-count">{t.list.count(list.data.total)}</p>
      <HadithList items={list.data.items} showBook={!book} showChapter={!chapter} />
      {list.data.items.length < list.data.total && (
        <button type="button" className="btn btn--wide" onClick={() => setPages((p) => p + 1)}>
          {t.list.loadMore}
        </button>
      )}
    </>
  );
}

const SAMPLES_SHOWN = 6;

/** «ہر باب سے ایک روایت»: a new pick every hour, like the website. */
function ChapterSamples() {
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 3_600_000));
  const [shown, setShown] = useState(SAMPLES_SHOWN);
  const samples = useQuery(() => chapterSamples(db, seed), [seed]);
  const items = samples.data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="section">
      <div className="section__head">
        <h2 className="section-title">{t.chapters.samples}</h2>
        <Link to="/chapters" className="link-strong">
          {t.chapters.allChapters} ←
        </Link>
      </div>
      <p className="muted small">{t.chapters.samplesNote(items.length)}</p>
      <ol className="hadith-list">
        {items.slice(0, shown).map((item) => (
          <li key={item.id}>
            <HadithCard item={item} chapterName={item.chapter_name} />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn--wide"
        onClick={() => {
          if (shown < items.length) setShown((n) => n + SAMPLES_SHOWN);
          else {
            setSeed((s) => s + 1);
            setShown(SAMPLES_SHOWN);
          }
        }}
      >
        {t.chapters.samplesMore}
      </button>
    </section>
  );
}

export function AllPage() {
  const books = useQuery(() => listBooks(db), []);
  const series = books.data ? groupBooks(books.data).series : [];
  return (
    <div className="page">
      <PageTitle title={t.nav.all} sub={t.allPage.description} />
      {series.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t.chapters.chooseBook}</h2>
          <p className="muted small">{t.books.series}</p>
          <ul className="volume-pills" aria-label={t.books.series}>
            {series.map((s) => (
              <li key={s.book}>
                <Link to={bookPath(s.book)} className="volume-pill">
                  <span className="volume-pill__label">{s.label}</span>
                  <span className="volume-pill__count">{fmt(s.count)}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link to="/books" className="volume-pill volume-pill--more">
                {t.books.others} ←
              </Link>
            </li>
          </ul>
        </section>
      )}
      <ChapterSamples />
      <section className="section">
        <h2 className="section-title">{t.nav.all}</h2>
        <PagedList />
      </section>
    </div>
  );
}

export function BookPage() {
  const book = decodeURIComponent(useParams().book ?? '');
  const info = useQuery(() => getBook(db, book), [book]);
  const name = info.data?.book ?? book;
  useEffect(() => {
    document.title = `${name} | ${t.appName}`;
  }, [name]);
  return (
    <div className="page">
      <nav className="crumbs">
        <Link to="/">{t.hadith.home}</Link>
        <Link to="/books">{t.books.title}</Link>
      </nav>
      <PageTitle
        title={name}
        sub={t.books.intro}
        note={info.data?.published_at ? t.books.published(fmtDay(info.data.published_at)) : undefined}
      />
      <PagedList book={name} />
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
      <PageTitle title={t.books.title} sub={t.books.description} />
      <aside className="download-note">
        <Icon name="download" />
        <p>
          {t.books.downloadNote}{' '}
          <a href={`${WEBSITE}/books`} target="_blank" rel="noreferrer" className="link-strong">
            {t.books.downloadLink} ←
          </a>
          <span className="muted small block">{t.books.downloadOnline}</span>
        </p>
      </aside>
      <section className="section">
        <h2 className="section-title">{t.books.series}</h2>
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
          <h2 className="section-title">{t.books.others}</h2>
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

/** Chapters grouped under their headings («عقائد», «عبادات» …), in the website's order. */
function groupChapters(chapters: ChapterCount[]): { parent: string; chapters: ChapterCount[] }[] {
  const groups = new Map<string, ChapterCount[]>();
  for (const c of chapters) {
    if (c.count === 0) continue;
    const key = c.parent ?? t.chapters.other;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([parent, list]) => ({ parent, chapters: list }));
}

export function ChaptersPage() {
  const chapters = useQuery(() => listChapters(db), []);
  const groups = useMemo(() => groupChapters(chapters.data ?? []), [chapters.data]);
  useEffect(() => {
    document.title = `${t.chapters.title} | ${t.appName}`;
  }, []);
  return (
    <div className="page">
      <PageTitle
        title={t.chapters.title}
        sub={t.chapters.intro}
        note={chapters.data ? t.chapters.count(chapters.data.filter((c) => c.count > 0).length) : undefined}
      />
      {chapters.data && groups.length === 0 && <p className="empty">{t.list.empty}</p>}
      {groups.map((g) => (
        <section key={g.parent} className="section">
          <h2 className="group-title">{g.parent}</h2>
          <ul className="chapter-grid">
            {g.chapters.map((c) => (
              <li key={c.slug}>
                <Link to={chapterPath(c.slug)} className="card chapter-card">
                  <span className="chapter-card__name">{c.name}</span>
                  {c.description && <span className="chapter-card__desc">{c.description}</span>}
                  <span className="chapter-card__foot">
                    <span>{t.list.count(c.count)}</span>
                    <Icon name="arrow" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ChapterPage() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const chapter = useQuery(() => getChapter(db, slug), [slug]);
  // Warm the names other cards on this page may need.
  useChapterNames();
  useEffect(() => {
    if (chapter.data) document.title = `${chapter.data.name} | ${t.appName}`;
  }, [chapter.data]);
  if (chapter.loading && !chapter.data) return null;
  if (!chapter.data) return <p className="empty page">{t.chapters.notFound}</p>;
  return (
    <div className="page">
      <nav className="crumbs">
        <Link to="/">{t.hadith.home}</Link>
        <Link to="/chapters">{t.chapters.title}</Link>
        {chapter.data.parent && <span>{chapter.data.parent}</span>}
      </nav>
      <PageTitle title={chapter.data.name} sub={chapter.data.description ?? undefined} />
      <PagedList chapter={slug} />
    </div>
  );
}

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
  listFiles,
  listHadith,
} from '@tehqeqat/core';

import { bookPath, chapterPath, HadithCard, HadithList } from '../components/HadithCard';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/Shell';
import { PAGE_SIZE } from '../config';
import { db } from '../db/client';
import { useChapterNames, useQuery } from '../hooks';
import { fmt, fmtDay, t } from '../strings';
import { useApp } from '../sync/store';

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

/**
 * «ہر باب سے ایک روایت»: a new pick every hour, like the website. On the
 * home page (`few`) it is «چند ابواب سے روایات»: six (three on a phone) and a
 * link to the chapters instead of «اور دکھائیں». Prefaces are never picked.
 */
export function ChapterSamples({ few = false }: { few?: boolean }) {
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 3_600_000));
  const [shown, setShown] = useState(SAMPLES_SHOWN);
  const samples = useQuery(() => chapterSamples(db, seed), [seed]);
  const items = samples.data ?? [];
  if (items.length === 0) return null;
  return (
    <section className={`section ${few ? 'samples--few' : ''}`}>
      <div className="section__head">
        <h2 className="section-title">{few ? t.chapters.samplesFew : t.chapters.samples}</h2>
        <Link to="/chapters" className="link-strong">
          {t.chapters.allChapters} ←
        </Link>
      </div>
      {!few && <p className="muted small">{t.chapters.samplesNote(items.length)}</p>}
      <ol className="hadith-list">
        {items.slice(0, shown).map((item) => (
          <li key={item.id}>
            <HadithCard item={item} chapterName={item.chapter_name} />
          </li>
        ))}
      </ol>
      {!few && (
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
      )}
    </section>
  );
}

/**
 * «تمام احادیث» has two ways to read (the website since 13 Nov 2026): by
 * chapter (/chapters) or everything in one list (/all). Both pages show this
 * switch at the top, and both light «تمام احادیث» in the menus.
 */
function HadithViewSwitch({ current }: { current: 'chapters' | 'list' }) {
  const options = [
    { key: 'chapters', to: '/chapters', label: t.allPage.byChapter, icon: 'grid' },
    { key: 'list', to: '/all', label: t.allPage.asList, icon: 'list' },
  ] as const;
  return (
    <nav aria-label={t.allPage.views} className="view-switch">
      <ul>
        {options.map((o) => (
          <li key={o.key}>
            <Link to={o.to} aria-current={o.key === current ? 'page' : undefined}>
              <Icon name={o.icon} />
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * «کتاب منتخب کریں», as on the website's /all-hadees since 13 Nov 2026: a card
 * per part of the series with its number in a square box, its name and its
 * count, then the other books as rows.
 */
function BookChooser() {
  const books = useQuery(() => listBooks(db), []);
  if (!books.data) return null;
  const { series, others } = groupBooks(books.data);
  if (series.length === 0 && others.length === 0) return null;
  const sameVolume = new Map<number, number>();
  for (const s of series) sameVolume.set(s.volume, (sameVolume.get(s.volume) ?? 0) + 1);
  return (
    <nav aria-labelledby="book-chooser" className="section">
      <h2 id="book-chooser" className="section-title">
        {t.chapters.chooseBook}
      </h2>
      {series.length > 0 && (
        <>
          <h3 className="subsection-title">{t.books.series}</h3>
          <ul className="volumes">
            {series.map((s) => (
              <li key={s.book}>
                <Link to={bookPath(s.book)} className="volume" title={s.book}>
                  <span className="volume__no">{fmt(s.volume)}</span>
                  <span className="volume__label">{s.label}</span>
                  {(sameVolume.get(s.volume) ?? 0) > 1 && <span className="volume__full">{s.book}</span>}
                  <span className="volume__count">{t.list.count(s.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <h3 className="subsection-title">{t.books.others}</h3>
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
        </>
      )}
    </nav>
  );
}

export function AllPage() {
  useEffect(() => {
    document.title = `${t.nav.all} | ${t.appName}`;
  }, []);
  return (
    <div className="page">
      <HadithViewSwitch current="list" />
      <PageTitle title={t.nav.all} sub={t.allPage.description} />
      <BookChooser />
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
        <Link to="/all">{t.nav.all}</Link>
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

/**
 * «کتب خانہ»: the printed books themselves, as on the website's /books (a
 * cover, the name and «دیکھیں»). The books open from the website; each book's
 * narrations are in the app under «تمام احادیث».
 */
export function BooksPage() {
  const files = useQuery(() => listFiles(db), []);
  const books = useQuery(() => listBooks(db), []);
  const { online } = useApp();
  // A file the registry links to a book carries the book's name: its narrations are in the app.
  const bookNames = new Set((books.data ?? []).map((b) => b.book));
  useEffect(() => {
    document.title = `${t.library.title} | ${t.appName}`;
  }, []);
  const list = files.data ?? [];
  return (
    <div className="page">
      <PageTitle title={t.library.title} sub={t.library.description} />
      <aside className="download-note">
        <Icon name="download" />
        <p>
          {t.library.note}{' '}
          <Link to="/all" className="link-strong">
            {t.library.narrations} ←
          </Link>
        </p>
      </aside>
      {files.data && list.length === 0 && <p className="empty">{t.library.empty}</p>}
      {list.length > 0 && (
        <section className="section">
          <h2 className="section-title section-title--rule">{t.library.count(list.length)}</h2>
          <ul className="library">
            {list.map((f) => (
              <li key={f.id} className="card book">
                {f.image_url && online && (
                  <img
                    className="book__cover"
                    src={f.image_url}
                    alt=""
                    loading="lazy"
                    width="120"
                    height="170"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}
                <div className="book__body">
                  <span className="book__name urdu">{f.name.replace(/\.pdf$/i, '')}</span>
                  <span className="muted small">PDF</span>
                  <span className="book__actions">
                    <a className="btn btn--primary" href={f.url} target="_blank" rel="noreferrer">
                      <Icon name="book-open" />
                      {t.library.open}
                    </a>
                    {bookNames.has(f.name) && (
                      <Link to={bookPath(f.name)} className="btn">
                        {t.library.inApp}
                      </Link>
                    )}
                  </span>
                </div>
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
      <HadithViewSwitch current="chapters" />
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
        <Link to="/all">{t.nav.all}</Link>
        <Link to="/chapters">{t.chapters.title}</Link>
        {chapter.data.parent && <span>{chapter.data.parent}</span>}
      </nav>
      <PageTitle title={chapter.data.name} sub={chapter.data.description ?? undefined} />
      <PagedList chapter={slug} />
    </div>
  );
}

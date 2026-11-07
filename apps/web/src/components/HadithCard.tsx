import { Link } from 'react-router';

import type { HadithListItem } from '@tehqeqat/core';

import { useChapterNames } from '../hooks';
import { t } from '../strings';
import { Html, Marked } from './Html';

export const hadithPath = (slug: string) => `/hadith/${encodeURIComponent(slug)}`;
export const bookPath = (book: string) => `/books/${encodeURIComponent(book)}`;
export const chapterPath = (slug: string) => `/chapters/${encodeURIComponent(slug)}`;
export const narratorPath = (slug: string) => `/narrators/${encodeURIComponent(slug)}`;

export function HadithCard({
  item,
  query,
  snippet,
  showBook = true,
  chapterName,
}: {
  item: HadithListItem;
  query?: string;
  snippet?: string;
  showBook?: boolean;
  /** Shown as a link to the باب when given. */
  chapterName?: string;
}) {
  const to = query ? `${hadithPath(item.slug)}?q=${encodeURIComponent(query)}` : hadithPath(item.slug);
  return (
    <article className="card hadith-card">
      <Link to={to} className="hadith-card__title">
        <Html html={item.title_html} query={query} className="urdu" />
      </Link>
      {snippet && (
        <p className="hadith-card__snippet urdu">
          <Marked text={snippet} query={query} />
        </p>
      )}
      <div className="hadith-card__foot">
        <span className="hadith-card__chips">
          {showBook && item.book && (
            <Link to={bookPath(item.book)} className="chip">
              {item.book}
            </Link>
          )}
          {chapterName && item.chapter && (
            <Link to={chapterPath(item.chapter)} className="chip chip--soft">
              {chapterName}
            </Link>
          )}
        </span>
        <Link to={to} className="link-strong">
          {t.list.readMore} ←
        </Link>
      </div>
    </article>
  );
}

export function HadithList({
  items,
  query,
  snippets,
  showBook,
  showChapter = true,
}: {
  items: HadithListItem[];
  query?: string;
  snippets?: Map<string, string>;
  showBook?: boolean;
  showChapter?: boolean;
}) {
  const chapters = useChapterNames();
  if (items.length === 0) return <p className="empty">{t.list.empty}</p>;
  return (
    <ol className="hadith-list">
      {items.map((item) => (
        <li key={item.id}>
          <HadithCard
            item={item}
            query={query}
            snippet={snippets?.get(item.id)}
            showBook={showBook}
            chapterName={showChapter && item.chapter ? chapters?.get(item.chapter) : undefined}
          />
        </li>
      ))}
    </ol>
  );
}

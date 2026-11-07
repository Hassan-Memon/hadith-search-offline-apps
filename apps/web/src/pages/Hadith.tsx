import { useEffect, useMemo, useState } from 'react';

import { Link, useLocation, useParams, useSearchParams } from 'react-router';

import {
  getBook,
  getChapter,
  getHadithBySlug,
  hadithNarrators,
  hadithWebUrl,
  type HadithRow,
  isBookmarked,
  normalize,
  parseSections,
  queryTokens,
  recordVisit,
  relatedHadith,
  stripHtml,
  toggleBookmark,
} from '@tehqeqat/core';

import { bookPath, chapterPath, HadithList, narratorPath } from '../components/HadithCard';
import { Html } from '../components/Html';
import { Icon } from '../components/Icon';
import { WEBSITE } from '../config';
import { db } from '../db/client';
import { usePref, useQuery } from '../hooks';
import { fmt, fmtDay, t } from '../strings';
import { useApp } from '../sync/store';

const SIZES = ['s', 'm', 'l', 'xl'] as const;
type Size = (typeof SIZES)[number];

/** A section heading as one line of text for the contents list. */
const label = (html: string | undefined) =>
  stripHtml(html)
    .replace(/\[\s*[\d۰-۹٠-٩]+\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[:：]\s*$/, '')
    .trim();

export function HadithPage() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const { hash } = useLocation();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { online } = useApp();
  const row = useQuery(() => getHadithBySlug(db, slug), [slug]);
  const hadith = row.data;
  const related = useQuery(
    () => (hadith ? relatedHadith(db, hadith.id, hadith.book, 5, hadith.chapter) : Promise.resolve([])),
    [hadith?.id, hadith?.chapter],
  );
  const chapter = useQuery(
    () => (hadith?.chapter ? getChapter(db, hadith.chapter) : Promise.resolve(undefined)),
    [hadith?.chapter],
  );
  const book = useQuery(() => (hadith ? getBook(db, hadith.book) : Promise.resolve(undefined)), [hadith?.book]);
  const narrators = useQuery(() => hadithNarrators(db, hadith?.narrators_json), [hadith?.narrators_json]);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = usePref<Size>('size', 'm');

  useEffect(() => {
    if (!hadith) return;
    void recordVisit(db, hadith.id);
    void isBookmarked(db, hadith.id).then(setSaved);
    document.title = `${hadith.title_text.slice(0, 60)} | ${t.appName}`;
  }, [hadith]);

  const sections = useMemo(() => parseSections(hadith?.html_content), [hadith?.html_content]);
  // With a search query, open only the sections that contain it (like the website's bird's-eye view).
  const tokens = useMemo(() => queryTokens(q), [q]);
  const matches = useMemo(
    () =>
      sections.map((s) => {
        if (tokens.length === 0) return true;
        const text = normalize(`${stripHtml(s.heading)} ${stripHtml(s.content)}`);
        return tokens.some((tok) => text.includes(tok));
      }),
    [sections, tokens],
  );
  const [open, setOpen] = useState<boolean[]>([]);
  useEffect(() => setOpen(matches), [matches]);

  // Headings that can be folded, for the contents list.
  const contents = useMemo(
    () =>
      sections
        .map((s, i) => ({ i, text: s.heading?.trim() && s.content?.trim() ? label(s.heading) : '' }))
        .filter((c) => c.text),
    [sections],
  );
  const studyAt = useMemo(() => new Map((narrators.data ?? []).map((n) => [n.start, n])), [narrators.data]);

  const goTo = (i: number) => {
    setOpen((o) => o.map((v, j) => (j === i ? true : v)));
    requestAnimationFrame(() => document.getElementById(`s-${i}`)?.scrollIntoView({ block: 'start' }));
  };

  // Arriving from a narrator's page (#s-<n>): open that section and go to it.
  useEffect(() => {
    const m = /^#s-(\d+)$/.exec(hash);
    if (m && sections.length) goTo(Number(m[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, sections.length]);

  // Closed sections are not printed: open everything for the printer.
  useEffect(() => {
    const before = () => setOpen(sections.map(() => true));
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [sections]);

  if (row.loading && !hadith) return null;
  if (!hadith) return <p className="empty page">{t.hadith.notFound}</p>;

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const share = async () => {
    const url = hadithWebUrl(hadith.slug);
    try {
      if (navigator.share) {
        await navigator.share({ title: hadith.title_text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      say(t.hadith.copied);
    } catch {
      // user cancelled the share sheet
    }
  };

  const exportMeta = (r: HadithRow) => ({
    title: r.title_text,
    meta: [
      `${t.hadith.book}: ${r.book}`,
      chapter.data ? t.chapters.chapter(chapter.data.name) : '',
      r.authored_at ? t.hadith.published(fmtDay(r.authored_at)) : '',
      t.hadith.reviewedBy,
    ],
    url: hadithWebUrl(r.slug),
    labels: { references: t.hadith.references, source: t.hadith.source, creator: t.appName },
  });

  // The export code is its own small file, loaded the first time it is used.
  const copyText = async () => {
    try {
      const { copyHadith } = await import('../export');
      await copyHadith(hadith, exportMeta(hadith));
      say(t.hadith.textCopied);
    } catch {
      say(t.hadith.copyFailed);
    }
  };
  const word = async () => {
    setBusy(true);
    try {
      const { downloadWord } = await import('../export');
      downloadWord(hadith, exportMeta(hadith));
      say(t.hadith.wordReady);
    } catch {
      say(t.hadith.wordFailed);
    } finally {
      setBusy(false);
    }
  };

  const sizeIndex = Math.max(0, SIZES.indexOf(size));
  const allOpen = open.length > 0 && open.every(Boolean);

  return (
    <article className="page reader">
      <nav className="crumbs">
        <Link to={bookPath(book.data?.book ?? hadith.book)}>{book.data?.book ?? hadith.book}</Link>
        {chapter.data && <Link to={chapterPath(chapter.data.slug)}>{t.chapters.chapter(chapter.data.name)}</Link>}
      </nav>
      <Html as="h1" html={hadith.title_html} query={q} className="reader__title urdu" />
      <p className="muted reader__by">
        {t.hadith.reviewedBy}
        {hadith.authored_at && <span className="block small">{t.hadith.published(fmtDay(hadith.authored_at))}</span>}
      </p>

      {hadith.hukm_html && (
        <section className="hukm" aria-label={t.hadith.hukm}>
          {/* The stored text already starts with «حکم:», so the label is for screen readers only. */}
          <h2 className="sr-only">{t.hadith.hukm}</h2>
          <Html html={hadith.hukm_html} query={q} className="urdu" />
        </section>
      )}

      <div className="toolbar no-print">
        <button
          type="button"
          className={`btn ${saved ? 'btn--on' : ''}`}
          aria-pressed={saved}
          onClick={async () => setSaved(await toggleBookmark(db, hadith.id))}
        >
          <Icon name={saved ? 'bookmark-fill' : 'bookmark'} />
          {saved ? t.hadith.bookmarked : t.hadith.bookmark}
        </button>
        <button type="button" className="btn" onClick={share}>
          <Icon name="share" />
          {t.hadith.share}
        </button>
        <button type="button" className="btn" onClick={() => void copyText()}>
          <Icon name="copy" />
          {t.hadith.copyText}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void word()}>
          <Icon name="file" />
          {busy ? t.hadith.preparing : t.hadith.word}
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon name="print" />
          {t.hadith.print}
        </button>
        {book.data?.pdf_pages ? (
          online ? (
            <a className="btn" href={`${WEBSITE}/api/hadith-pages/${encodeURIComponent(hadith.id)}`} target="_blank" rel="noreferrer">
              <Icon name="download" />
              {t.hadith.pdf}
            </a>
          ) : (
            <button type="button" className="btn" onClick={() => say(t.hadith.pdfOffline)}>
              <Icon name="download" />
              {t.hadith.pdf}
            </button>
          )
        ) : null}
        <a className="btn" href={hadithWebUrl(hadith.slug)} target="_blank" rel="noreferrer">
          <Icon name="globe" />
          {t.hadith.openWeb}
        </a>
        <span className="seg seg--small" role="group" aria-label={t.more.textSize}>
          <button type="button" aria-label="−" disabled={sizeIndex === 0} onClick={() => setSize(SIZES[sizeIndex - 1]!)}>
            ا−
          </button>
          <button
            type="button"
            aria-label="+"
            disabled={sizeIndex === SIZES.length - 1}
            onClick={() => setSize(SIZES[sizeIndex + 1]!)}
          >
            ا+
          </button>
        </span>
        {toast && (
          <span className="toast" role="status">
            {toast}
          </span>
        )}
      </div>

      {contents.length > 2 && (
        <details className="toc card no-print">
          <summary>
            <Icon name="toc" /> {t.hadith.contents}{' '}
            <span className="muted small">({t.hadith.contentsCount(contents.length)})</span>
          </summary>
          <ol>
            {contents.map((c, n) => (
              <li key={c.i}>
                <a
                  href={`#s-${c.i}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(c.i);
                  }}
                >
                  <span className="toc__n">{fmt(n + 1)}</span>
                  {c.text}
                  {studyAt.has(c.i) && <span className="chip chip--soft">{t.nav.narrators}</span>}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="section__head">
        <h2 className="reader__h2">{t.hadith.details}</h2>
        {contents.length > 1 && (
          <button
            type="button"
            className="btn btn--small no-print"
            onClick={() => setOpen(sections.map(() => !allOpen))}
          >
            {allOpen ? t.hadith.collapseAll : t.hadith.expandAll}
          </button>
        )}
      </div>
      <div className="sections">
        {sections.map((s, i) => {
          const heading = s.heading?.trim();
          const content = s.content?.trim();
          const study = studyAt.get(i);
          if (heading && content) {
            return (
              <details
                key={i}
                id={`s-${i}`}
                className="section-fold"
                open={open[i] ?? matches[i]}
                onToggle={(e) => {
                  const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                  setOpen((o) => (o[i] === isOpen ? o : o.map((v, j) => (j === i ? isOpen : v))));
                }}
              >
                <summary>
                  <Html as="span" html={heading} query={q} className="urdu" />
                </summary>
                {study && (
                  <p className="study-link no-print">
                    <Link to={narratorPath(study.slug)} className="chip chip--soft">
                      {t.narrators.page}: {study.name} ←
                    </Link>
                  </p>
                )}
                <Html html={content} query={q} className="urdu prose" />
              </details>
            );
          }
          return <Html key={i} html={heading || content} query={q} className="urdu prose" />;
        })}
      </div>

      {hadith.references_html && (
        <section className="refs">
          <h2>{t.hadith.references}</h2>
          <Html html={hadith.references_html} className="urdu prose prose--small" />
        </section>
      )}

      {narrators.data && narrators.data.length > 0 && (
        <section className="section no-print">
          <h2>{t.narrators.inNarration}</h2>
          <ul className="chips">
            {narrators.data.map((n) => (
              <li key={`${n.slug}-${n.start}`}>
                <Link to={narratorPath(n.slug)} className="chip chip--link">
                  {n.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.data && related.data.length > 0 && (
        <section className="section no-print">
          <h2>{t.hadith.related}</h2>
          <HadithList items={related.data} />
        </section>
      )}
    </article>
  );
}

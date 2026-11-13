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
  parseSections,
  recordVisit,
  relatedHadith,
  toggleBookmark,
} from '@tehqeqat/core';

import { bookPath, chapterPath, hadithPath, narratorPath } from '../components/HadithCard';
import { Html } from '../components/Html';
import { Icon } from '../components/Icon';
import { NarratorName } from '../components/Narrator';
import {
  Contents,
  type ReaderAction,
  ReaderToolbar,
  ReferencesBox,
  ResearchSections,
  SectionTitle,
  type StudyMark,
  useSections,
} from '../components/Reader';
import { WEBSITE } from '../config';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { fmtDay, t } from '../strings';
import { useApp } from '../sync/store';

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

  useEffect(() => {
    if (!hadith) return;
    void recordVisit(db, hadith.id);
    void isBookmarked(db, hadith.id).then(setSaved);
    document.title = `${hadith.title_text.slice(0, 60)} | ${t.appName}`;
  }, [hadith]);

  const sections = useMemo(() => parseSections(hadith?.html_content), [hadith?.html_content]);
  const state = useSections(sections, q, hash);
  const studyAt = useMemo(
    () =>
      new Map<number, StudyMark>(
        (narrators.data ?? []).map((n) => [n.start, { slug: n.slug, name: n.arabic_name || n.name, start: n.start }]),
      ),
    [narrators.data],
  );

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

  const bookName = book.data?.book ?? hadith.book;
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

  const actions: ReaderAction[] = [
    { icon: 'copy', label: t.hadith.copyText, hint: 'عنوان، حکم، پوری تحقیق اور حوالہ جات', onClick: () => void copyText() },
    {
      icon: 'file',
      label: busy ? t.hadith.preparing : t.hadith.word,
      hint: 'Word اور Google Docs دونوں میں کھلتی ہے',
      onClick: () => void word(),
      disabled: busy,
    },
    { icon: 'print', label: t.hadith.print, onClick: () => window.print() },
    { icon: 'share', label: t.hadith.share, onClick: () => void share() },
  ];
  if (book.data?.pdf_pages) {
    actions.push(
      online
        ? {
            icon: 'download',
            label: t.hadith.pdf,
            hint: 'مطبوعہ کتاب کے وہی صفحات جن پر یہ روایت ہے',
            href: `${WEBSITE}/api/hadith-pages/${encodeURIComponent(hadith.id)}`,
          }
        : { icon: 'download', label: t.hadith.pdf, onClick: () => say(t.hadith.pdfOffline) },
    );
  }
  actions.push({ icon: 'globe', label: t.hadith.openWeb, href: hadithWebUrl(hadith.slug) });

  return (
    <article className="page reader">
      <div className="reader-head card">
        <nav className="crumbs" aria-label="breadcrumb">
          <Link to="/">{t.hadith.home}</Link>
          <Link to={bookPath(bookName)}>{bookName}</Link>
          {chapter.data && <Link to={chapterPath(chapter.data.slug)}>{t.chapters.chapter(chapter.data.name)}</Link>}
        </nav>
        <header className="reader-head__title">
          <Link to={bookPath(bookName)} className="book-pill">
            <Icon name="book-open" />
            <span>{bookName}</span>
          </Link>
          <Html as="h1" html={hadith.title_html} query={q} className="reader__title urdu" />
          <p className="reader__by">
            <span>{t.hadith.reviewedBy}</span>
            {hadith.authored_at && <span>{t.hadith.published(fmtDay(hadith.authored_at))}</span>}
          </p>
        </header>

        {hadith.hukm_html && (
          <section className="hukm" aria-label={t.hadith.hukm}>
            {/* The stored text already starts with «حکم:», so the label is for screen readers only. */}
            <h2 className="sr-only">{t.hadith.hukm}</h2>
            <Html html={hadith.hukm_html} query={q} className="urdu" />
          </section>
        )}

        <ReaderToolbar
          state={state}
          actions={actions}
          toast={toast}
          extra={
            <button
              type="button"
              className={`btn ${saved ? 'btn--on' : ''}`}
              aria-pressed={saved}
              onClick={async () => setSaved(await toggleBookmark(db, hadith.id))}
            >
              <Icon name={saved ? 'bookmark-fill' : 'bookmark'} />
              {saved ? t.hadith.bookmarked : t.hadith.bookmark}
            </button>
          }
        />
      </div>

      <Contents state={state} studies={studyAt} />

      <SectionTitle>{t.hadith.details}</SectionTitle>
      <ResearchSections sections={sections} state={state} q={q} studies={studyAt} />

      {hadith.references_html && <ReferencesBox html={hadith.references_html} />}

      {narrators.data && narrators.data.length > 0 && (
        <section className="section no-print">
          <SectionTitle>{t.narrators.inNarration}</SectionTitle>
          <ul className="chips">
            {narrators.data.map((n) => (
              <li key={`${n.slug}-${n.start}`}>
                <Link to={narratorPath(n.slug)} className="narrator-chip">
                  <Icon name="user" />
                  <NarratorName n={n} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.data && related.data.length > 0 && (
        <section className="section no-print">
          <SectionTitle>{t.hadith.related}</SectionTitle>
          <ul className="related">
            {related.data.map((r) => (
              <li key={r.id}>
                <Link to={hadithPath(r.slug)}>
                  <Html as="span" html={r.title_html} className="urdu" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

import { useEffect, useMemo, useState } from 'react';

import { Link, useParams, useSearchParams } from 'react-router';

import {
  getHadithBySlug,
  hadithWebUrl,
  isBookmarked,
  normalize,
  parseSections,
  queryTokens,
  recordVisit,
  relatedHadith,
  stripHtml,
  toggleBookmark,
} from '@tehqeqat/core';

import { bookPath, HadithList } from '../components/HadithCard';
import { Html } from '../components/Html';
import { Icon } from '../components/Icon';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';

export function HadithPage() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const row = useQuery(() => getHadithBySlug(db, slug), [slug]);
  const hadith = row.data;
  const related = useQuery(
    () => (hadith ? relatedHadith(db, hadith.id, hadith.book, 5) : Promise.resolve([])),
    [hadith?.id],
  );
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');

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

  if (row.loading && !hadith) return null;
  if (!hadith) return <p className="empty page">{t.hadith.notFound}</p>;

  const share = async () => {
    const url = hadithWebUrl(hadith.slug);
    try {
      if (navigator.share) {
        await navigator.share({ title: hadith.title_text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast(t.hadith.copied);
      setTimeout(() => setToast(''), 2000);
    } catch {
      // user cancelled the share sheet
    }
  };

  return (
    <article className="page reader">
      <nav className="crumbs">
        <Link to={bookPath(hadith.book)}>{hadith.book}</Link>
      </nav>
      <Html as="h1" html={hadith.title_html} query={q} className="reader__title urdu" />
      <p className="muted reader__by">{t.hadith.reviewedBy}</p>

      {hadith.hukm_html && (
        <section className="hukm" aria-label={t.hadith.hukm}>
          {/* The stored text already starts with «حکم:», so the label is for screen readers only. */}
          <h2 className="sr-only">{t.hadith.hukm}</h2>
          <Html html={hadith.hukm_html} query={q} className="urdu" />
        </section>
      )}

      <div className="toolbar">
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
        <a className="btn" href={hadithWebUrl(hadith.slug)} target="_blank" rel="noreferrer">
          <Icon name="globe" />
          {t.hadith.openWeb}
        </a>
        {toast && (
          <span className="toast" role="status">
            {toast}
          </span>
        )}
      </div>

      <h2 className="reader__h2">{t.hadith.details}</h2>
      <div className="sections">
        {sections.map((s, i) => {
          const heading = s.heading?.trim();
          const content = s.content?.trim();
          if (heading && content) {
            return (
              <details key={i} className="section-fold" open={matches[i]}>
                <summary>
                  <Html as="span" html={heading} query={q} className="urdu" />
                </summary>
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

      {related.data && related.data.length > 0 && (
        <section className="section">
          <h2>{t.hadith.related}</h2>
          <HadithList items={related.data} showBook={false} />
        </section>
      )}
    </article>
  );
}

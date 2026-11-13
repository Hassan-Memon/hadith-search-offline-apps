// «روات حدیث»: the narrators whose study is in the research, as on the
// website's /narrators pages. Nothing here is downloaded: the list is the
// narrator registry and each study is a range of sections of a narration
// already on the device. Since 9 Nov 2026 the website shows names in Arabic
// (sorted as the book's «فہرستِ رُوات»), and a narrator's page shows the
// study from his latest volume, laid out like a narration, with his other
// studies listed under it.
import { useEffect, useMemo, useState } from 'react';

import { Link, useLocation, useParams } from 'react-router';

import {
  getNarrator,
  type HadithRow,
  latestFirst,
  listNarrators,
  type Narrator,
  type NarratorListItem,
  narratorSortKey,
  narratorStudies,
  normalize,
  relatedNarrators,
  parseSections,
  stripHtml,
} from '@tehqeqat/core';

import { bookPath, hadithPath, narratorPath } from '../components/HadithCard';
import { Html } from '../components/Html';
import { Icon } from '../components/Icon';
import {
  Contents,
  type ReaderAction,
  ReaderToolbar,
  ReferencesBox,
  ResearchSections,
  SectionTitle,
  useSections,
} from '../components/Reader';
import { db } from '../db/client';
import type { ExportMeta } from '../export';
import { useQuery } from '../hooks';
import { fmt, t } from '../strings';
import { NarratorCard, NarratorName, shuffled, StatTiles } from '../components/Narrator';

const SHOWN = 60;
const SUGGESTED = 6;

type Sort = 'name' | 'death' | 'studies';

const sorters: Record<Sort, (a: NarratorListItem, b: NarratorListItem) => number> = {
  // The list already comes in the order of the Arabic names.
  name: () => 0,
  death: (a, b) => (a.death_year ?? Infinity) - (b.death_year ?? Infinity),
  studies: (a, b) => b.study_count - a.study_count,
};

export function NarratorsPage() {
  const all = useQuery(() => listNarrators(db), []);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<number | 'unknown' | null>(null);
  const [sort, setSort] = useState<Sort>('name');
  const [shown, setShown] = useState(SHOWN);
  const [round, setRound] = useState(0);
  useEffect(() => {
    document.title = `${t.narrators.title} | ${t.appName}`;
  }, []);
  useEffect(() => setShown(SHOWN), [query, period, sort]);

  const narrators = all.data ?? [];
  // Names only (Arabic, Urdu and other spellings), without harakat and with
  // the Arabic/Urdu letter forms folded: «أبان» and «ابان» both find him.
  const keys = useMemo(
    () => new Map(narrators.map((n) => [n.slug, normalize([n.arabic_name ?? '', n.name, ...n.aliases].join(' '))])),
    [narrators],
  );
  const centuries = useMemo(
    () => [...new Set(narrators.map((n) => n.century).filter((c): c is number => c != null))].sort((a, b) => a - b),
    [narrators],
  );
  const needle = normalize(query);
  const filtered = narrators
    .filter(
      (n) =>
        (!needle || keys.get(n.slug)?.includes(needle)) &&
        (period === null || (period === 'unknown' ? n.century == null : n.century === period)),
    )
    .sort(sorters[sort]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestions = useMemo(() => shuffled(narrators, SUGGESTED), [narrators, round]);
  // In name order the list is grouped by first letter, with a strip of the
  // letters to jump (the website since 13 Nov 2026); every name is shown then.
  const byLetter = sort === 'name';
  const groups = useMemo(() => {
    if (!byLetter) return [];
    const out: { letter: string; items: NarratorListItem[] }[] = [];
    for (const n of filtered) {
      const letter = [...narratorSortKey(n)][0] ?? '؟';
      if (out[out.length - 1]?.letter !== letter) out.push({ letter, items: [] });
      out[out.length - 1]!.items.push(n);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byLetter, filtered.map((n) => n.slug).join()]);
  const centuryCount = centuries.length;

  if (all.data && narrators.length === 0) {
    return (
      <div className="page">
        <header className="page-title page-title--plain">
          <h1>{t.narrators.title}</h1>
        </header>
        <p className="empty">{t.narrators.empty}</p>
      </div>
    );
  }

  return (
    <div className="page narrators">
      <header className="page-title page-title--plain">
        <h1>{t.narrators.title}</h1>
        <p>{t.narrators.description}</p>
      </header>
      <StatTiles
        label={t.stats.label}
        tiles={[
          { value: narrators.length, label: t.stats.narrators, note: t.stats.narratorsNote },
          ...(centuryCount > 0 ? [{ value: centuryCount, label: t.stats.centuries, note: t.stats.centuriesNote }] : []),
        ]}
      />

      <div className="searchbox searchbox--small">
        <span className="searchbox__icon" aria-hidden="true">
          <Icon name="search" />
        </span>
        <label htmlFor="nq" className="sr-only">
          {t.narrators.searchLabel}
        </label>
        <input
          id="nq"
          type="search"
          autoComplete="off"
          placeholder={t.narrators.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {centuries.length > 0 && (
        <div className="chips chips--scroll" role="group" aria-label={t.narrators.period}>
          <button type="button" className="chip chip--link" aria-pressed={period === null} onClick={() => setPeriod(null)}>
            {t.narrators.periodAll}
          </button>
          {centuries.map((c) => (
            <button
              key={c}
              type="button"
              className="chip chip--link"
              aria-pressed={period === c}
              onClick={() => setPeriod(c)}
            >
              {t.narrators.century(c)}
            </button>
          ))}
          {narrators.some((n) => n.century == null) && (
            <button
              type="button"
              className="chip chip--link"
              aria-pressed={period === 'unknown'}
              onClick={() => setPeriod('unknown')}
            >
              {t.narrators.unknown}
            </button>
          )}
        </div>
      )}
      <label className="sort">
        <span>{t.narrators.sort}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="name">{t.narrators.sortName}</option>
          <option value="death">{t.narrators.sortDeath}</option>
          <option value="studies">{t.narrators.sortStudies}</option>
        </select>
      </label>

      {suggestions.length > 0 && !needle && period === null && (
        <section className="section">
          <h2 className="section-title">{t.narrators.suggestions}</h2>
          <div className="section__head">
            <p className="muted small">{t.narrators.suggestionsNote}</p>
            <button type="button" className="btn btn--small" onClick={() => setRound((r) => r + 1)}>
              <Icon name="shuffle" />
              {t.narrators.more}
            </button>
          </div>
          <ul className="narrator-grid">
            {suggestions.map((n) => (
              <li key={n.slug}>
                <NarratorCard n={n} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{t.narrators.all}</h2>
        <p className="result-count" aria-live="polite">
          {filtered.length === narrators.length
            ? t.narrators.count(narrators.length)
            : t.narrators.countOf(filtered.length, narrators.length)}
        </p>
        {filtered.length === 0 && narrators.length > 0 && <p className="empty">{t.narrators.noMatch}</p>}
        {byLetter ? (
          <>
            {groups.length > 1 && (
              <nav className="letters" aria-label={t.narrators.letters}>
                {groups.map((g) => (
                  <a
                    key={g.letter}
                    href={`#letter-${g.letter}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(`letter-${g.letter}`)?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {g.letter}
                  </a>
                ))}
              </nav>
            )}
            {groups.map((g) => (
              <div key={g.letter} className="letter-group">
                <h3 id={`letter-${g.letter}`} className="letter-group__letter">
                  {g.letter}
                </h3>
                <ul className="narrator-grid">
                  {g.items.map((n) => (
                    <li key={n.slug}>
                      <NarratorCard n={n} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <ul className="narrator-grid">
            {filtered.slice(0, shown).map((n) => (
              <li key={n.slug}>
                <NarratorCard n={n} />
              </li>
            ))}
          </ul>
        )}
        {!byLetter && filtered.length > shown && (
          <button type="button" className="btn btn--wide" onClick={() => setShown((s) => s + SHOWN)}>
            {t.list.loadMore}
          </button>
        )}
      </section>
    </div>
  );
}

const MARKER = /\[\s*([\d۰-۹٠-٩]+)\s*\]/g;

/**
 * The footnotes a study cites, as the website picks them: a narration keeps
 * all its footnotes in one list, one paragraph each opening with its marker
 * («[13] …»); a narrator's study cites only some of them.
 */
function citedReferences(referencesHtml: string | null, sectionHtml: string[]): string {
  if (!referencesHtml) return '';
  const cited = new Set<string>();
  for (const html of sectionHtml) {
    for (const m of stripHtml(html).matchAll(MARKER)) cited.add(normalize(m[1]!));
  }
  if (cited.size === 0) return '';
  const paragraphs = referencesHtml.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return paragraphs
    .filter((p) => {
      const first = MARKER.exec(stripHtml(p));
      MARKER.lastIndex = 0;
      return first ? cited.has(normalize(first[1]!)) : false;
    })
    .join('');
}

const studyLength = (s: { hadith: { html_content: string }; start: number; end: number }) =>
  parseSections(s.hadith.html_content)
    .slice(s.start, s.end + 1)
    .reduce((n, sec) => n + stripHtml(sec.heading).length + stripHtml(sec.content).length, 0);

export function NarratorPage() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const { hash } = useLocation();
  const narrator = useQuery(() => getNarrator(db, slug), [slug]);
  const n = narrator.data;
  const studies = useQuery(() => (n ? narratorStudies(db, n.slug) : Promise.resolve([])), [n?.slug]);
  const related = useQuery(() => (n ? relatedNarrators(db, n.slug) : Promise.resolve([])), [n?.slug]);
  const ordered = useMemo(() => latestFirst(studies.data ?? [], studyLength), [studies.data]);
  const shown = ordered[0];
  const sections = useMemo(
    () => (shown ? parseSections(shown.hadith.html_content).slice(shown.start, shown.end + 1) : []),
    [shown],
  );
  const references = useMemo(
    () =>
      shown
        ? citedReferences(
            shown.hadith.references_html,
            sections.map((s) => `${s.heading ?? ''} ${s.content ?? ''}`),
          )
        : '',
    [shown, sections],
  );
  const state = useSections(sections, '', hash, shown?.start ?? 0, true);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (n) document.title = `${n.arabic_name || n.name} | ${t.appName}`;
  }, [n]);

  if (narrator.loading && !n) return null;
  if (!n) return <p className="empty page">{t.narrators.notFound}</p>;
  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const exportArgs = (who: Narrator): [HadithRow, ExportMeta] => {
    const row = {
      ...shown!.hadith,
      hukm_html: null,
      html_content: JSON.stringify(sections),
      references_html: references || null,
    } as unknown as HadithRow;
    return [
      row,
      {
        title: who.arabic_name || who.name,
        meta: [
          who.arabic_name ? who.name : '',
          who.death_note ?? '',
          `${t.hadith.book}: ${shown!.hadith.book}`,
          t.hadith.reviewedBy,
        ],
        url: `https://tehqeqatehadees.com/narrators/${encodeURIComponent(who.slug)}`,
        labels: { references: t.hadith.references, source: t.hadith.source, creator: t.appName },
      },
    ];
  };
  const actions: ReaderAction[] = shown
    ? [
        {
          icon: 'copy',
          label: t.hadith.copyText,
          onClick: async () => {
            try {
              const { copyHadith } = await import('../export');
              await copyHadith(...exportArgs(n));
              say(t.hadith.textCopied);
            } catch {
              say(t.hadith.copyFailed);
            }
          },
        },
        {
          icon: 'file',
          label: t.hadith.word,
          onClick: async () => {
            try {
              const { downloadWord } = await import('../export');
              downloadWord(...exportArgs(n));
              say(t.hadith.wordReady);
            } catch {
              say(t.hadith.wordFailed);
            }
          },
        },
        { icon: 'print', label: t.hadith.print, onClick: () => window.print() },
      ]
    : [];

  return (
    <article className="page reader narrator">
      <div className="reader-head card">
        <nav className="crumbs" aria-label="breadcrumb">
          <Link to="/">{t.hadith.home}</Link>
          <Link to="/narrators">{t.narrators.title}</Link>
        </nav>
        <header className="reader-head__title">
          {shown && (
            <Link to={bookPath(shown.hadith.book)} className="book-pill">
              <Icon name="book-open" />
              <span>{shown.hadith.book}</span>
            </Link>
          )}
          <h1 className="reader__title narrator__title">
            <NarratorName n={n} />
          </h1>
          {n.arabic_name && (
            <p className="narrator__urdu urdu">
              <span className="sr-only">{t.narrators.urduName}: </span>
              {n.name}
            </p>
          )}
          <p className="reader__by">
            {n.death_note && <span>{n.death_note}</span>}
            <span>{t.hadith.reviewedBy}</span>
          </p>
          {n.aliases.length > 0 && (
            <p className="muted small">
              {t.narrators.alsoKnown}: {n.aliases.join('، ')}
            </p>
          )}
        </header>
        {shown && <ReaderToolbar state={state} actions={actions} toast={toast} />}
      </div>

      {shown && (
        <>
          <SectionTitle>{t.narrators.studiesHeading}</SectionTitle>
          <p className="muted">{t.narrators.intro(n.arabic_name || n.name)}</p>
          <Contents state={state} />
          <ResearchSections sections={sections} state={state} />
          {references && <ReferencesBox html={references} />}
          <div className="study-source card">
            <p className="muted small">{t.narrators.fromNarration}</p>
            <Link to={hadithPath(shown.hadith.slug)} className="study__title">
              <Html html={shown.hadith.title_html} className="urdu" />
            </Link>
            <Link to={`${hadithPath(shown.hadith.slug)}#s-${shown.start}`} className="link-strong">
              {t.narrators.openNarration} ←
            </Link>
          </div>
        </>
      )}

      {ordered.length > 1 && (
        <section className="section">
          <SectionTitle>{t.narrators.otherStudies}</SectionTitle>
          <p className="muted small">{t.narrators.otherStudiesNote}</p>
          <ul className="related">
            {ordered.slice(1).map((s) => (
              <li key={`${s.hadith.id}-${s.start}`}>
                <Link to={`${hadithPath(s.hadith.slug)}#s-${s.start}`}>
                  <Html as="span" html={s.hadith.title_html} className="urdu" />
                  <span className="related__book">{s.hadith.book}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {related.data && related.data.length > 0 && (
        <section className="section no-print">
          <SectionTitle>{t.narrators.related(new Set(ordered.map((s) => s.hadith.id)).size)}</SectionTitle>
          <ul className="narrator-grid">
            {related.data.map((other) => (
              <li key={other.slug}>
                <NarratorCard n={other} excerpt={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">{t.narrators.note}</p>
      <p>
        <Link to="/narrators" className="link-strong">
          {t.narrators.all} ←
        </Link>
      </p>
      {ordered.length > 0 && (
        <p className="muted small">
          {t.narrators.inNarrations(new Set(ordered.map((s) => s.hadith.id)).size)} · {fmt(ordered.length)} تراجم
        </p>
      )}
    </article>
  );
}

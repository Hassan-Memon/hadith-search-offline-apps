// «رواۃ»: the narrators whose study is in the research, as on the website's
// /narrators pages. Nothing here is downloaded: the list is the narrator
// registry and each study is a range of sections of a narration already on
// the device.
import { useEffect, useMemo, useState } from 'react';

import { Link, useParams } from 'react-router';

import {
  getNarrator,
  listNarrators,
  narratorStudies,
  narratorTotals,
  type NarratorListItem,
  normalize,
  parseSections,
} from '@tehqeqat/core';

import { hadithPath, narratorPath } from '../components/HadithCard';
import { Html } from '../components/Html';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/Shell';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';

const SHOWN = 60;
const SUGGESTED = 6;

function shuffled<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

function NarratorCard({ n }: { n: NarratorListItem }) {
  return (
    <Link to={narratorPath(n.slug)} className="card narrator-card">
      <span className="narrator-card__name urdu">{n.name}</span>
      {n.death_note && <span className="muted small">{t.narrators.died(n.death_note)}</span>}
      <span className="muted small">{t.narrators.inNarrations(n.hadith_count)}</span>
    </Link>
  );
}

export function NarratorsPage() {
  const all = useQuery(() => listNarrators(db), []);
  const totals = useQuery(() => narratorTotals(db), []);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<number | 'unknown' | null>(null);
  const [shown, setShown] = useState(SHOWN);
  const [round, setRound] = useState(0);
  useEffect(() => {
    document.title = `${t.narrators.title} | ${t.appName}`;
  }, []);
  useEffect(() => setShown(SHOWN), [query, period]);

  const narrators = all.data ?? [];
  // Names are matched without harakat and with the Arabic/Urdu letter forms folded.
  const keys = useMemo(
    () => new Map(narrators.map((n) => [n.slug, normalize([n.name, ...n.aliases].join(' '))])),
    [narrators],
  );
  const centuries = useMemo(
    () => [...new Set(narrators.map((n) => n.century).filter((c): c is number => c != null))].sort((a, b) => a - b),
    [narrators],
  );
  const needle = normalize(query);
  const filtered = narrators.filter(
    (n) =>
      (!needle || keys.get(n.slug)?.includes(needle)) &&
      (period === null || (period === 'unknown' ? n.century == null : n.century === period)),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestions = useMemo(() => shuffled(narrators, SUGGESTED), [narrators, round]);

  if (all.data && narrators.length === 0) {
    return (
      <div className="page">
        <PageTitle title={t.narrators.title} />
        <p className="empty">{t.narrators.empty}</p>
      </div>
    );
  }

  return (
    <div className="page narrators">
      <header className="page-title">
        <p className="eyebrow">{t.narrators.eyebrow}</p>
        <h1>{t.narrators.title}</h1>
        <p>{t.narrators.description}</p>
        {narrators.length > 0 && totals.data && (
          <p className="muted small">{t.narrators.stats(narrators.length, totals.data.studies, totals.data.hadith)}</p>
        )}
      </header>

      {suggestions.length > 0 && !needle && period === null && (
        <section className="section">
          <div className="section__head">
            <h2>{t.narrators.suggestions}</h2>
            <button type="button" className="btn btn--small" onClick={() => setRound((r) => r + 1)}>
              <Icon name="refresh" />
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
        <h2>{t.narrators.all}</h2>
        <div className="searchbox searchbox--small">
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
          <div className="chips" role="group" aria-label={t.narrators.period}>
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
        <p className="result-count" aria-live="polite">
          {filtered.length === narrators.length
            ? t.narrators.count(narrators.length)
            : t.narrators.countOf(filtered.length, narrators.length)}
        </p>
        {filtered.length === 0 && narrators.length > 0 && <p className="empty">{t.narrators.noMatch}</p>}
        <ul className="narrator-grid">
          {filtered.slice(0, shown).map((n) => (
            <li key={n.slug}>
              <NarratorCard n={n} />
            </li>
          ))}
        </ul>
        {filtered.length > shown && (
          <button type="button" className="btn btn--wide" onClick={() => setShown((s) => s + SHOWN)}>
            {t.list.loadMore}
          </button>
        )}
      </section>
    </div>
  );
}

export function NarratorPage() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const narrator = useQuery(() => getNarrator(db, slug), [slug]);
  const studies = useQuery(() => narratorStudies(db, slug), [slug]);
  const n = narrator.data;
  useEffect(() => {
    if (n) document.title = `${n.name} | ${t.appName}`;
  }, [n]);
  if (narrator.loading && !n) return null;
  if (!n) return <p className="empty page">{t.narrators.notFound}</p>;
  const list = studies.data ?? [];
  return (
    <article className="page reader narrator">
      <nav className="crumbs">
        <Link to="/narrators">{t.narrators.title}</Link>
      </nav>
      <p className="eyebrow">{t.narrators.detailEyebrow}</p>
      <h1 className="reader__title urdu">{n.name}</h1>
      {n.death_note && <p className="muted">{t.narrators.died(n.death_note)}</p>}
      {n.aliases.length > 0 && (
        <p className="muted small">
          {t.narrators.alsoKnown}: {n.aliases.join('، ')}
        </p>
      )}

      <h2 className="reader__h2">{t.narrators.studiesHeading}</h2>
      <p className="muted">{t.narrators.intro(n.name)}</p>
      <ol className="studies">
        {list.map((s, i) => {
          const sections = parseSections(s.hadith.html_content).slice(s.start, s.end + 1);
          return (
            <li key={`${s.hadith.id}-${s.start}`} className="card study">
              <p className="eyebrow">
                {t.narrators.fromNarration}
                {list.length > 1 && <span className="muted"> · {t.narrators.studyOf(i + 1, list.length)}</span>}
              </p>
              <Link to={hadithPath(s.hadith.slug)} className="study__title">
                <Html html={s.hadith.title_html} className="urdu" />
              </Link>
              <div className="study__body">
                {sections.map((sec, j) => (
                  <div key={j}>
                    {sec.heading?.trim() && <Html as="h3" html={sec.heading} className="urdu study__heading" />}
                    {sec.content?.trim() && <Html html={sec.content} className="urdu prose" />}
                  </div>
                ))}
              </div>
              <Link to={`${hadithPath(s.hadith.slug)}#s-${s.start}`} className="link-strong">
                {t.narrators.openNarration} ←
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="muted small">{t.narrators.note}</p>
      <p>
        <Link to="/narrators" className="link-strong">
          {t.narrators.all} ←
        </Link>
      </p>
    </article>
  );
}

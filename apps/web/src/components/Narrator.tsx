// A narrator's name and card, shared by «روات حدیث», a narrator's page and
// the home page's «چند روات» (kept out of the narrators' own chunk so the
// home page does not load it).
import { Link } from 'react-router';

import type { NarratorListItem } from '@tehqeqat/core';

import { fmt, t } from '../strings';
import { narratorPath } from './HadithCard';

/** A narrator's name as the book's «فہرستِ رُوات» writes it: in Arabic, Urdu until he has one. */
export function NarratorName({ n }: { n: { name: string; arabic_name?: string | null } }) {
  return n.arabic_name ? (
    <span lang="ar" className="narrator-arabic">
      {n.arabic_name}
    </span>
  ) : (
    <span>{n.name}</span>
  );
}

export function NarratorCard({ n, excerpt = true }: { n: NarratorListItem; excerpt?: boolean }) {
  return (
    <Link to={narratorPath(n.slug)} className="card narrator-card">
      <span className="narrator-card__name">
        <NarratorName n={n} />
      </span>
      {n.death_note && <span className="death-pill">{n.death_note}</span>}
      {excerpt && n.excerpt && <span className="narrator-card__excerpt urdu">{n.excerpt}</span>}
      <span className="narrator-card__foot">
        <span>{n.hadith_count === 1 ? 'ایک روایت میں تذکرہ' : t.narrators.inNarrations(n.hadith_count)}</span>
        <span className="link-strong">{t.narrators.read} ←</span>
      </span>
    </Link>
  );
}

/** A few narrators, new each time: the website's «چند روات» list. */
export function shuffled<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

/** The website's number tiles (/about, /narrators, the home page). */
export function StatTiles({ tiles, label }: { tiles: { value: number; label: string; note?: string }[]; label: string }) {
  if (tiles.length === 0) return null;
  return (
    <ul className="stat-tiles" aria-label={label}>
      {tiles.map((tile) => (
        <li key={tile.label} className="stat-tile">
          <span className="stat-tile__value">{fmt(tile.value)}</span>
          <span className="stat-tile__label">{tile.label}</span>
          {tile.note && <span className="stat-tile__note">{tile.note}</span>}
        </li>
      ))}
    </ul>
  );
}

// The research reader shared by a narration and a narrator's page, as on the
// website: a contents list, the sections (folded or open), «صرف عنوانات /
// مکمل تحقیق», text size, and one «کاپی / محفوظ» menu.
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Link } from 'react-router';

import { type HadithSection, isRulingHeading, normalize, queryTokens, stripHtml } from '@tehqeqat/core';

import { usePref } from '../hooks';
import { fmt, t } from '../strings';
import { narratorPath } from './HadithCard';
import { Html } from './Html';
import { Icon, type IconName } from './Icon';

const SIZES = ['s', 'm', 'l', 'xl'] as const;
type Size = (typeof SIZES)[number];

/** A section heading as one line of text for the contents list. */
const label = (html: string | undefined) =>
  stripHtml(html)
    .replace(/\[\s*[\d۰-۹٠-٩]+\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[:：]\s*$/, '')
    .trim();

/** A narrator's study inside the text: sections start…end. */
export interface StudyMark {
  slug: string;
  name: string;
  start: number;
}

/**
 * Which sections are open, as on the website (13 Nov 2026). A narration
 * opens with its ruling (a heading that ends in «حکم») and any section
 * holding the searched words; «صرف عنوانات» goes back to that, «مکمل تحقیق»
 * opens everything. A narrator's page (`openAll`) opens with every section.
 * `#s-<n>` in the address opens that section and scrolls to it; printing
 * opens everything.
 */
export function useSections(sections: HadithSection[], q: string, hash: string, offset = 0, openAll = false) {
  const tokens = useMemo(() => queryTokens(q), [q]);
  const matches = useMemo(
    () =>
      sections.map((s) => {
        if (openAll) return true;
        if (isRulingHeading(s.heading)) return true;
        if (tokens.length === 0) return false;
        const text = normalize(`${stripHtml(s.heading)} ${stripHtml(s.content)}`);
        return tokens.some((tok) => text.includes(tok));
      }),
    [sections, tokens, openAll],
  );
  const [open, setOpen] = useState<boolean[]>([]);
  useEffect(() => setOpen(matches), [matches]);
  // Only a heading with text folds; a lone paragraph is always shown.
  const folds = useMemo(() => sections.map((s) => Boolean(s.heading?.trim() && s.content?.trim())), [sections]);

  const contents = useMemo(
    () =>
      sections
        .map((s, i) => ({ i, text: s.heading?.trim() && s.content?.trim() ? label(s.heading) : '' }))
        .filter((c) => c.text),
    [sections],
  );

  const goTo = (i: number) => {
    setOpen((o) => o.map((v, j) => (j === i ? true : v)));
    requestAnimationFrame(() => document.getElementById(`s-${i + offset}`)?.scrollIntoView({ block: 'start' }));
  };

  useEffect(() => {
    const m = /^#s-(\d+)$/.exec(hash);
    if (m && sections.length && Number(m[1]) - offset < sections.length) goTo(Number(m[1]) - offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, sections.length]);

  useEffect(() => {
    const before = () => setOpen(sections.map(() => true));
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [sections]);

  const foldable = contents.length > 1;
  const allOpen = open.length > 0 && folds.every((f, i) => !f || open[i]);
  /** «مکمل تحقیق» (true) or «صرف عنوانات» (false: the ruling and search matches, or nothing on a narrator's page). */
  const setAll = (value: boolean) => setOpen(value ? sections.map(() => true) : openAll ? sections.map(() => false) : matches);
  return { matches, open, setOpen, contents, goTo, foldable, allOpen, setAll, offset };
}

export type SectionsState = ReturnType<typeof useSections>;

export interface ReaderAction {
  icon: IconName;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

/**
 * «صرف عنوانات / مکمل تحقیق», text size, and the «کاپی / محفوظ» menu, as the
 * website lays them out under the title.
 */
export function ReaderToolbar({
  state,
  actions,
  toast,
  extra,
}: {
  state: SectionsState;
  actions: ReaderAction[];
  toast?: string;
  extra?: ReactNode;
}) {
  const [size, setSize] = usePref<Size>('size', 'm');
  const sizeIndex = Math.max(0, SIZES.indexOf(size));
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute('open');
  return (
    <div className="reader-tools no-print">
      <div className="reader-tools__row">
        {state.foldable && (
          <span className="seg" role="group" aria-label={t.hadith.viewMode}>
            <button type="button" aria-pressed={!state.allOpen} onClick={() => state.setAll(false)}>
              {t.hadith.headingsOnly}
            </button>
            <button type="button" aria-pressed={state.allOpen} onClick={() => state.setAll(true)}>
              {t.hadith.fullResearch}
            </button>
          </span>
        )}
        <span className="seg seg--icons" role="group" aria-label={t.more.textSize}>
          <button
            type="button"
            aria-label={t.hadith.smaller}
            title={t.hadith.smaller}
            disabled={sizeIndex === 0}
            onClick={() => setSize(SIZES[sizeIndex - 1]!)}
          >
            <span aria-hidden="true">A↓</span>
          </button>
          <button
            type="button"
            aria-label={t.hadith.larger}
            title={t.hadith.larger}
            disabled={sizeIndex === SIZES.length - 1}
            onClick={() => setSize(SIZES[sizeIndex + 1]!)}
          >
            <span aria-hidden="true">A↑</span>
          </button>
        </span>
      </div>
      <div className="reader-tools__row">
        {extra}
        <details className="menu" ref={menu}>
          <summary className="btn">
            <Icon name="download" />
            کاپی / محفوظ
          </summary>
          <ul className="menu__list">
            {actions.map((a) => (
              <li key={a.label}>
                {a.href ? (
                  <a className="menu__item" href={a.href} target="_blank" rel="noreferrer" onClick={close}>
                    <Icon name={a.icon} />
                    <span>
                      {a.label}
                      {a.hint && <small>{a.hint}</small>}
                    </span>
                  </a>
                ) : (
                  <button
                    type="button"
                    className="menu__item"
                    disabled={a.disabled}
                    onClick={() => {
                      close();
                      a.onClick?.();
                    }}
                  >
                    <Icon name={a.icon} />
                    <span>
                      {a.label}
                      {a.hint && <small>{a.hint}</small>}
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}

/** «فہرستِ مضامین»: every foldable heading, numbered, with the narrators' studies marked. */
export function Contents({ state, studies }: { state: SectionsState; studies?: Map<number, StudyMark> }) {
  if (state.contents.length <= 2) return null;
  return (
    <details className="toc card no-print">
      <summary>
        <Icon name="toc" /> {t.hadith.contents}{' '}
        <span className="muted small">({t.hadith.contentsCount(state.contents.length)})</span>
      </summary>
      <ol>
        {state.contents.map((c, n) => (
          <li key={c.i}>
            <a
              href={`#s-${c.i + state.offset}`}
              onClick={(e) => {
                e.preventDefault();
                state.goTo(c.i);
              }}
            >
              <span className="toc__n">{fmt(n + 1)}</span>
              <span className="toc__text">{c.text}</span>
              {studies?.has(c.i + state.offset) && <span className="chip chip--soft">راوی</span>}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The sections: a heading with text folds; a lone paragraph is shown as is.
 * Ids follow the whole narration's numbering (`useSections`' offset: a
 * narrator's study is a slice of it).
 */
export function ResearchSections({
  sections,
  state,
  q,
  studies,
}: {
  sections: HadithSection[];
  state: SectionsState;
  q?: string;
  studies?: Map<number, StudyMark>;
}) {
  return (
    <div className="sections">
      {sections.map((s, j) => {
        const i = j + state.offset;
        const heading = s.heading?.trim();
        const content = s.content?.trim();
        const study = studies?.get(i);
        if (heading && content) {
          return (
            <details
              key={i}
              id={`s-${i}`}
              className="section-fold"
              open={state.open[j] ?? state.matches[j]}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                state.setOpen((o) => (o[j] === isOpen ? o : o.map((v, k) => (k === j ? isOpen : v))));
              }}
            >
              <summary>
                <Html as="span" html={heading} query={q} className="urdu" />
              </summary>
              {study && (
                <p className="study-link no-print">
                  <Link to={narratorPath(study.slug)} className="narrator-chip">
                    <Icon name="user" />
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
  );
}

const MARK = /^\s*\[\s*([0-9۰-۹٠-٩]+)\s*\]\s*$/;
const NOTE = /^\s*\[\s*([0-9۰-۹٠-٩]+)\s*\]/;

/**
 * «حوالہ جات», closed until the reader asks for it (the website since 13 Nov
 * 2026). It opens by itself when it is needed: a footnote mark in the text
 * («[1]») is tapped, which then goes to its note; the address ends in
 * `#references`; or the page is printed.
 */
export function ReferencesBox({ html }: { html: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const open = () => {
      box.open = true;
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || box.contains(target) || !target.closest?.('.sections')) return;
      // The mark is plain text in its own span: «[1]» (Word's dead link was removed).
      let number: string | null = null;
      for (let el: Element | null = target, i = 0; el && i < 3 && !number; el = el.parentElement, i++) {
        number = MARK.exec(el.textContent ?? '')?.[1] ?? null;
      }
      if (!number) return;
      const wanted = normalize(number);
      const note = [...box.querySelectorAll('p')].find((p) => normalize(NOTE.exec(p.textContent ?? '')?.[1] ?? '') === wanted);
      if (!note) return;
      event.preventDefault();
      open();
      note.classList.add('note--hit');
      setTimeout(() => note.classList.remove('note--hit'), 2500);
      requestAnimationFrame(() => note.scrollIntoView({ block: 'center' }));
    };
    const onHash = () => {
      if (location.hash === '#references') open();
    };
    onHash();
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeprint', open);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('beforeprint', open);
    };
  }, [html]);
  return (
    <details ref={ref} id="references" className="refs refs-box">
      <summary>
        <h2 className="section-title section-title--rule">{t.hadith.references}</h2>
      </summary>
      <Html html={html} className="urdu prose prose--small card" />
    </details>
  );
}

/** «تحقیق کی تفصیل» and the other headings of the reader: a title with a rule beside it. */
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className="section-title section-title--rule" id={id}>
      {children}
    </h2>
  );
}

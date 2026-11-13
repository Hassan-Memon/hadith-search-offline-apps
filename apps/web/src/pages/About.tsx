import { useEffect, useMemo, useState } from 'react';

import { getHadithBySlug, parseSections, stripHtml } from '@tehqeqat/core';

import cover from '@assets/images/about/cover.jpg';
import nb1 from '@assets/images/about/taqriz-noor-ul-bashar-1.jpg';
import nb2 from '@assets/images/about/taqriz-noor-ul-bashar-2.jpg';
import sk from '@assets/images/about/taqriz-saleemullah-khan.jpg';

import { Html } from '../components/Html';
import { Volume2Preface } from './about/Volume2Preface';
import { TAWZIH_TITLE } from './about/volume2Text';
import { Icon } from '../components/Icon';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { fmt, t } from '../strings';

const MUQADDIMA_SLUG = 'مقدمہ';

const TAQARIZ = [
  {
    key: 'sk',
    name: 'حضرت مولانا سلیم اللہ خان صاحب رحمہ اللہ',
    role: 'جامعہ فاروقیہ کراچی',
    date: '۵ جمادی الثانیہ ۱۴۳۴ھ / ۱۶ اپریل ۲۰۱۳ء',
    pages: [sk],
  },
  {
    key: 'nb',
    name: 'حضرت مولانا نور البشر محمد نور الحق صاحب',
    role: 'استاذ الحدیث جامعہ فاروقیہ کراچی؛ مہتمم معہد عثمان بن عفان کراچی',
    date: '۱۷ ربیع الاول ۱۴۳۴ھ / ۳۰ جنوری ۲۰۱۳ء',
    pages: [nb1, nb2],
  },
];

const ALL_PAGES = TAQARIZ.flatMap((x) => x.pages.map((src, i) => ({ src, name: x.name, n: i + 1, of: x.pages.length })));

export function AboutPage() {
  const muqaddima = useQuery(() => getHadithBySlug(db, MUQADDIMA_SLUG), []);
  const sections = useMemo(
    () => parseSections(muqaddima.data?.html_content).filter((s) => s.heading?.trim() || s.content?.trim()),
    [muqaddima.data?.html_content],
  );
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    document.title = `${t.about.title} | ${t.appName}`;
  }, []);

  return (
    <div className="page about">
      <section className="about-hero">
        <img src={cover} alt="غیر معتبر روایات کا فنی جائزہ، حصہ اول کا سرورق" className="about-hero__cover" />
        <div>
          <p className="eyebrow">{t.about.eyebrow}</p>
          <h1>{t.about.title}</h1>
          <p className="lead">{t.about.intro}</p>
          <p className="strong">{t.about.author}</p>
          <nav className="jump">
            <a href="#taqariz">{t.about.taqariz}</a>
            <a href="#muqaddima">{t.about.muqaddima}</a>
            <a href="#volume2">{t.about.volume2Short}</a>
          </nav>
        </div>
      </section>

      <section id="taqariz" className="section">
        <h2>{t.about.taqariz}</h2>
        <p className="muted">{t.about.taqarizNote}</p>
        <ul className="taqariz">
          {TAQARIZ.map((x) => (
            <li key={x.key} className="card taqriz">
              <h3 className="urdu">{x.name}</h3>
              <p className="muted">{x.role}</p>
              <p className="muted small">{x.date}</p>
              <div className={`taqriz__pages ${x.pages.length > 1 ? 'two' : ''}`}>
                {x.pages.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className="paper"
                    onClick={() => setViewer(ALL_PAGES.findIndex((p) => p.src === src))}
                  >
                    <img src={src} alt={`${x.name} — ${t.about.page(i + 1)}`} loading="lazy" />
                    {x.pages.length > 1 && <span className="paper__n">{t.about.page(i + 1)}</span>}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="muqaddima" className="section">
        <h2>{t.about.muqaddima}</h2>
        {sections.length === 0 ? (
          <p className="empty">{t.about.muqaddimaMissing}</p>
        ) : (
          <>
            <details className="toc card">
              <summary>{t.about.contents}</summary>
              <ol>
                {sections.map((s, i) => (
                  <li key={i}>
                    <a href={`#m-${i + 1}`}>
                      <span className="toc__n">{fmt(i + 1)}</span>
                      {s.heading?.trim() ? stripHtml(s.heading) : t.about.opening}
                    </a>
                  </li>
                ))}
                {/* Part 2 is in the contents too (the website since 13 Nov 2026). */}
                {[
                  ['#muqaddima-2', t.about.volume2Preface],
                  ['#tawzih', TAWZIH_TITLE],
                ].map(([href, label], j) => (
                  <li key={href}>
                    <a href={href}>
                      <span className="toc__n">{fmt(sections.length + j + 1)}</span>
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
            <div className="card prose-card">
              {sections.map((s, i) => (
                <section key={i} id={`m-${i + 1}`} className="m-section">
                  {s.heading?.trim() && <h3 className="urdu">{stripHtml(s.heading)}</h3>}
                  {s.content?.trim() && <Html html={s.content} className="urdu prose" />}
                </section>
              ))}
              {muqaddima.data?.references_html && (
                <footer className="refs">
                  <h3>{t.hadith.references}</h3>
                  <Html html={muqaddima.data.references_html} className="urdu prose prose--small" />
                </footer>
              )}
            </div>
          </>
        )}
      </section>

      <section id="volume2" className="section">
        <h2>{t.about.volume2Title}</h2>
        <p className="muted">{t.about.volume2Intro}</p>
        <Volume2Preface />
      </section>

      {viewer !== null && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={ALL_PAGES[viewer]!.name}>
          <div className="viewer__bar">
            <span>
              {ALL_PAGES[viewer]!.name}
              {ALL_PAGES[viewer]!.of > 1 && ` — ${t.about.page(ALL_PAGES[viewer]!.n)}`}
            </span>
            <button type="button" className="icon-btn" aria-label={t.about.close} onClick={() => setViewer(null)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="viewer__img">
            <img src={ALL_PAGES[viewer]!.src} alt="" />
          </div>
          <div className="viewer__nav">
            <button type="button" className="btn" onClick={() => setViewer((v) => ((v ?? 0) - 1 + ALL_PAGES.length) % ALL_PAGES.length)}>
              پچھلا
            </button>
            <span dir="ltr">
              {viewer + 1} / {ALL_PAGES.length}
            </span>
            <button type="button" className="btn" onClick={() => setViewer((v) => ((v ?? 0) + 1) % ALL_PAGES.length)}>
              اگلا
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

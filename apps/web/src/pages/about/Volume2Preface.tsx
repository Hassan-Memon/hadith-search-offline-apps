// Preface of part 2 and «بعض تعبیرات کی توضیح» (what the recurring wordings
// of the rulings mean), as on the website's تعارف page. Text from
// volume2Text.ts, copied unchanged from the website.
import { fmt, t } from '../../strings';
import {
  type PrefacePoint,
  TAWZIH_POINTS,
  TAWZIH_TITLE,
  VOLUME2_BOOK,
  VOLUME2_OPENING,
  VOLUME2_PAGES,
  VOLUME2_POINTS,
  VOLUME2_SIGNATURE,
} from './volume2Text';

function Points({ points }: { points: PrefacePoint[] }) {
  return (
    <ol className="points">
      {points.map((point, index) => (
        <li key={index}>
          <span className="points__n" aria-hidden="true">
            {fmt(index + 1)}
          </span>
          <div>
            {point.paragraphs.map((paragraph, i) => (
              <div key={i}>
                <p>{paragraph}</p>
                {i === 0 && point.quote && <blockquote>{point.quote}</blockquote>}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Volume2Preface() {
  return (
    <>
      <article id="muqaddima-2" className="card prose-card preface">
        <h3>{t.about.volume2Preface}</h3>
        <div className="urdu prose">
          <p className="center" lang="ar">
            {VOLUME2_OPENING.hamd}
          </p>
          <p className="center verse" lang="ar">
            {VOLUME2_OPENING.verse.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
          {VOLUME2_OPENING.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <Points points={VOLUME2_POINTS} />
        </div>
      </article>

      <article id="tawzih" className="card prose-card preface preface--tinted">
        <h3>{TAWZIH_TITLE}</h3>
        <div className="urdu prose">
          <Points points={TAWZIH_POINTS} />
        </div>
        <footer className="preface__sign">
          <p className="strong">{VOLUME2_SIGNATURE.name}</p>
          <p className="muted">{VOLUME2_SIGNATURE.role}</p>
        </footer>
      </article>
      <p className="muted small center">{t.about.volume2Source(VOLUME2_BOOK, VOLUME2_PAGES)}</p>
    </>
  );
}

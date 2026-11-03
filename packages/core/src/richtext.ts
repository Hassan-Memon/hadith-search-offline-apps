// Converts the Word-exported hadith HTML into a small block model that React
// Native can render with <Text> (no WebView, no HTML renderer dependency).
// The content only uses p/span/b/strong/i/em/u/br/a/sup/sub and the
// `font-class-*` span classes the website maps to fonts; everything else is
// treated as an inline container or a block boundary.
import { decodeEntities } from './html.js';

export type FontClass =
  | 'nastaleeq' // Jameel Noori Nastaleeq / Mehr Nastaliq (Urdu)
  | 'naskh' // Bashar (Arabic quotations)
  | 'arbo' // ARBO symbol fonts (ﷺ, رضی اللہ عنہ glyphs encoded as letters)
  | 'arbo-uw'
  | 'gulzar'
  | 'default';

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  font: FontClass;
  /** Present for <a href> with a navigable URL. */
  href?: string;
}

export interface Block {
  /** 'p' for paragraphs, 'heading' for h1–h4, 'quote' for blockquote, 'li' for list items. */
  kind: 'p' | 'heading' | 'quote' | 'li';
  align?: 'start' | 'center' | 'end';
  /** The paragraph's own font class (Word puts `class="Arbic"` on <p>). */
  font: FontClass;
  runs: InlineRun[];
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'tr', 'table', 'ul', 'ol']);

function fontFromClass(className: string | undefined): FontClass | undefined {
  if (!className) return undefined;
  const c = className.toLowerCase();
  if (c.includes('arbo-uw') || c.includes('arbo-1') || c.includes('arbo-number')) return 'arbo-uw';
  if (c.includes('arbo')) return 'arbo';
  if (c.includes('bashar') || c === 'arbic' || c.includes('arbic') || c.includes('traditional-arabic') || c.includes('uthman') || c.includes('naskh') || c.includes('sakkal') || c.includes('lotus') || c.includes('al-bsher') || c.includes('typesetting') || c.includes('simplified-arabic')) return 'naskh';
  if (c.includes('gulzar')) return 'gulzar';
  if (c.includes('nastaleeq') || c.includes('nastaliq') || c.includes('jameel') || c.includes('alvi') || c.includes('faiz')) return 'nastaleeq';
  return undefined;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

const ALLOWED_HREF = /^(?:https?:\/\/|mailto:|tel:)/i;

interface Frame {
  tag: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  font?: FontClass;
  href?: string;
}

/** Parse HTML into blocks. Tolerant: unknown tags are ignored, never thrown on. */
export function htmlToBlocks(html: string | null | undefined): Block[] {
  if (!html) return [];
  const blocks: Block[] = [];
  const stack: Frame[] = [];
  let current: Block | null = null;

  const openBlock = (kind: Block['kind'], tag: string) => {
    const align = (attr(tag, 'align') ?? '').toLowerCase();
    const style = attr(tag, 'style') ?? '';
    const styleAlign = /text-align\s*:\s*(center|left|right|start|end)/i.exec(style)?.[1]?.toLowerCase();
    const a = align || styleAlign;
    current = {
      kind,
      align: a === 'center' ? 'center' : a === 'left' || a === 'start' ? 'start' : a === 'right' || a === 'end' ? 'end' : undefined,
      font: fontFromClass(attr(tag, 'class')) ?? 'default',
      runs: [],
    };
  };
  const closeBlock = () => {
    if (current && current.runs.some((r) => r.text.trim().length > 0)) {
      // Trim leading/trailing whitespace of the paragraph as a whole.
      const runs = current.runs;
      runs[0]!.text = runs[0]!.text.replace(/^\s+/, '');
      runs[runs.length - 1]!.text = runs[runs.length - 1]!.text.replace(/\s+$/, '');
      blocks.push({ ...current, runs: runs.filter((r) => r.text.length > 0) });
    }
    current = null;
  };
  const pushText = (raw: string) => {
    const text = decodeEntities(raw).replace(/\s+/g, ' ');
    if (!text) return;
    if (!current) openBlock('p', '');
    const state = stack.reduce<Frame>((acc, f) => ({ ...acc, ...stripUndefined(f) }), { tag: '' });
    const run: InlineRun = {
      text,
      font: state.font ?? current!.font,
      ...(state.bold ? { bold: true } : {}),
      ...(state.italic ? { italic: true } : {}),
      ...(state.underline ? { underline: true } : {}),
      ...(state.superscript ? { superscript: true } : {}),
      ...(state.href ? { href: state.href } : {}),
    };
    const last = current!.runs[current!.runs.length - 1];
    if (last && sameStyle(last, run)) last.text += text;
    else current!.runs.push(run);
  };

  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?o:p>/gi, '');
  const tokens = cleaned.split(/(<[^>]+>)/g);
  for (const token of tokens) {
    if (!token) continue;
    if (token[0] !== '<') {
      pushText(token);
      continue;
    }
    const isClose = token[1] === '/';
    const name = /^<\/?\s*([a-zA-Z0-9:]+)/.exec(token)?.[1]?.toLowerCase() ?? '';
    if (!name) continue;
    if (name === 'br') {
      // `current` is assigned inside closures above, so TS narrows it to never here.
      const cur = current as Block | null;
      if (cur) cur.runs.push({ text: '\n', font: cur.font });
      continue;
    }
    if (BLOCK_TAGS.has(name)) {
      if (isClose) {
        closeBlock();
      } else {
        closeBlock();
        const kind: Block['kind'] = /^h[1-6]$/.test(name) ? 'heading' : name === 'blockquote' ? 'quote' : name === 'li' ? 'li' : 'p';
        if (name !== 'table' && name !== 'ul' && name !== 'ol' && name !== 'tr') openBlock(kind, token);
      }
      continue;
    }
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === name) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }
    const frame: Frame = { tag: name };
    if (name === 'b' || name === 'strong') frame.bold = true;
    if (name === 'i' || name === 'em') frame.italic = true;
    if (name === 'u') frame.underline = true;
    if (name === 'sup') frame.superscript = true;
    const font = fontFromClass(attr(token, 'class'));
    if (font) frame.font = font;
    if (name === 'a') {
      const href = attr(token, 'href');
      if (href && ALLOWED_HREF.test(href)) frame.href = href;
    }
    if (!token.endsWith('/>')) stack.push(frame);
  }
  closeBlock();
  return blocks;
}

function stripUndefined(f: Frame): Partial<Frame> {
  const out: Partial<Frame> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && k !== 'tag') (out as Record<string, unknown>)[k] = v;
  return out;
}

function sameStyle(a: InlineRun, b: InlineRun): boolean {
  return (
    a.font === b.font &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.superscript === !!b.superscript &&
    a.href === b.href
  );
}

/** Plain text of a block list (for previews and accessibility labels). */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => b.runs.map((r) => r.text).join(''))
    .join('\n')
    .trim();
}

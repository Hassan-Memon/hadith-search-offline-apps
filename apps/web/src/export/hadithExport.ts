// Ported unchanged from the website (frontend-next/src/lib), so a copied or
// downloaded narration is the same from the app and from tehqeqatehadees.com.

// Turns a narration (or a narrator's study) into something that can leave the
// page: plain text, formatted text for the clipboard, or a Word file.
//
// All three are made from one list of blocks, read from the stored HTML with
// the browser's own parser. The text is never rewritten; only the things
// that do not survive outside the page are changed: honorifics and circled
// numbers typed in a symbol font become words and digits (see hadithText.ts),
// and Word's font classes become two real font names.
import { type Block, type BlockKind, buildDocx, type Run, type Script } from './docx';
import { mendMixedDigits } from '@tehqeqat/core';

import { spellSymbol, symbolKind } from './hadithText';

const ARABIC_CLASS =
  /(?:^|\s)(?:Arbic|font-class-(?:Bashar|BasharBold|Traditional-Arabic|KFGQPC|Uthman|Arabic-Typesetting|Simplified-Arabic|Sakkal-Majalla|Lotus-Linotype|mylotus|AL-Bsher|QCF))/;
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'TR',
]);
const LATIN_ONLY = /^[\s\d\p{P}\p{S}A-Za-z]*[A-Za-z][\s\d\p{P}\p{S}A-Za-z]*$/u;
const NBSP = String.fromCharCode(0xa0);

interface Inherited {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sup?: boolean;
  script: Script;
}

function collectRuns(node: Node, inherited: Inherited, runs: Run[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    // A newline inside stored HTML is a space to the browser, not a line break
    // (only <br> breaks a line).
    const text = (node.textContent ?? '').replaceAll(NBSP, ' ').replace(/[\r\n\t]+/g, ' ');
    if (text) {
      const script =
        inherited.script === 'ur' && LATIN_ONLY.test(text) ? 'latin' : inherited.script;
      runs.push({ ...inherited, script, text });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as HTMLElement;
  const tag = element.tagName;
  if (tag === 'BR') {
    runs.push({ ...inherited, text: '\n' });
    return;
  }
  // Words added for screen readers next to a symbol: the symbol itself is
  // spelled out below, so these would come twice.
  if (element.hasAttribute('data-symbol-words')) return;
  const kind = symbolKind(element.getAttribute('class'), tag);
  if (kind) {
    const spelled = spellSymbol(kind, element.textContent ?? '');
    if (spelled) runs.push({ ...inherited, script: 'ur', text: ` ${spelled} ` });
    return;
  }
  const next: Inherited = {
    ...inherited,
    bold: inherited.bold || tag === 'B' || tag === 'STRONG',
    italic: inherited.italic || tag === 'I' || tag === 'EM',
    underline: inherited.underline || tag === 'U',
    sup: inherited.sup || tag === 'SUP',
    script: ARABIC_CLASS.test(element.getAttribute('class') ?? '') ? 'ar' : inherited.script,
  };
  element.childNodes.forEach((child) => collectRuns(child, next, runs));
}

// Adjacent runs with the same formatting are one run; spaces are tidied the
// way a browser shows them.
function tidy(runs: Run[]): Run[] {
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.script === run.script &&
      !!last.bold === !!run.bold &&
      !!last.italic === !!run.italic &&
      !!last.underline === !!run.underline &&
      !!last.sup === !!run.sup
    ) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  merged.forEach((run) => {
    run.text = run.text.replace(/[ \t\r\f]+/g, ' ').replace(/ ?\n ?/g, '\n');
  });
  if (merged.length) {
    merged[0]!.text = merged[0]!.text.replace(/^\s+/, '');
    merged[merged.length - 1]!.text = merged[merged.length - 1]!.text.replace(/\s+$/, '');
  }
  return merged.filter((run) => run.text !== '');
}

/** The paragraphs of a fragment of stored HTML, as blocks of `kind`. */
export function htmlToBlocks(html: string | undefined | null, kind: BlockKind): Block[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  const body = new DOMParser().parseFromString(mendMixedDigits(html), 'text/html').body;
  const blocks: Block[] = [];
  let loose: Run[] = [];
  const flush = (center = false) => {
    const runs = tidy(loose);
    loose = [];
    if (runs.length) blocks.push({ kind, center, runs });
  };
  const walk = (parent: Node, inherited: Inherited) => {
    parent.childNodes.forEach((child) => {
      const element = child.nodeType === Node.ELEMENT_NODE ? (child as HTMLElement) : null;
      if (element && BLOCK_TAGS.has(element.tagName)) {
        flush();
        const script = ARABIC_CLASS.test(element.getAttribute('class') ?? '')
          ? 'ar'
          : inherited.script;
        // A block may hold blocks (a div of paragraphs).
        if (element.querySelector('p,div,li,h1,h2,h3,h4,h5,h6')) {
          walk(element, { ...inherited, script });
          flush();
        } else {
          collectRuns(element, { ...inherited, script }, loose);
          flush(element.getAttribute('align') === 'center');
        }
      } else {
        collectRuns(child, inherited, loose);
      }
    });
  };
  walk(body, { script: 'ur' });
  flush();
  return blocks;
}

export const textBlock = (kind: BlockKind, text: string, script: Script = 'ur'): Block => ({
  kind,
  runs: text ? [{ text, script }] : [],
});

export interface ExportSection {
  heading?: string;
  content?: string;
}

export interface ExportInput {
  // Plain text already (page title, labels); the rest is stored HTML.
  title: string;
  meta: string[];
  hukm?: string;
  sections: ExportSection[];
  references?: string;
  referencesLabel: string;
  // «ماخذ: تحقیقاتِ حدیث» and the page's address.
  sourceLabel: string;
  url: string;
}

export function buildExportBlocks(input: ExportInput): Block[] {
  const blocks: Block[] = [textBlock('title', input.title)];
  input.meta.filter(Boolean).forEach((line) => blocks.push(textBlock('meta', line)));
  blocks.push(...htmlToBlocks(input.hukm, 'hukm'));
  for (const section of input.sections) {
    const heading = section.heading?.trim();
    const content = section.content?.trim();
    if (heading && content) {
      blocks.push(...htmlToBlocks(heading, 'heading'), ...htmlToBlocks(content, 'paragraph'));
    } else {
      // A remark that stands on its own («اہم نوٹ: …»).
      blocks.push(...htmlToBlocks(heading || content, 'paragraph'));
    }
  }
  const references = htmlToBlocks(input.references, 'reference');
  if (references.length) {
    blocks.push(textBlock('label', input.referencesLabel), ...references);
  }
  blocks.push({
    kind: 'source',
    runs: [
      { text: `${input.sourceLabel} `, script: 'ur' },
      { text: input.url, script: 'latin' },
    ],
  });
  return blocks.filter((block) => block.runs.length > 0);
}

const blockText = (block: Block) => block.runs.map((run) => run.text).join('');

export function blocksToText(blocks: Block[]): string {
  const lines: string[] = [];
  blocks.forEach((block, index) => {
    const spaced = block.kind === 'heading' || block.kind === 'label' || block.kind === 'source';
    if (spaced && index > 0) lines.push('');
    lines.push(blockText(block));
    if (block.kind === 'title' || block.kind === 'hukm') lines.push('');
  });
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const URDU_FONT = "'Jameel Noori Nastaleeq','Noto Nastaliq Urdu','Urdu Typesetting',serif";
const ARABIC_FONT = "'Traditional Arabic','Amiri','Scheherazade New','Noto Naskh Arabic',serif";

function runHtml(run: Run): string {
  let html = escapeHtml(run.text).replace(/\n/g, '<br>');
  if (run.sup) html = `<sup>${html}</sup>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<i>${html}</i>`;
  if (run.bold) html = `<b>${html}</b>`;
  if (run.script === 'ar')
    return `<span lang="ar" style="font-family:${ARABIC_FONT}">${html}</span>`;
  if (run.script === 'latin') return `<span lang="en" dir="ltr">${html}</span>`;
  return html;
}

const HTML_TAG: Record<BlockKind, [string, string]> = {
  title: ['h1', 'font-size:20pt;text-align:center;line-height:2;margin:0 0 8pt'],
  meta: ['p', 'font-size:12pt;text-align:center;color:#555;margin:0 0 3pt'],
  hukm: ['p', 'font-size:15pt;font-weight:bold;margin:8pt 0 12pt'],
  heading: ['h2', 'font-size:15pt;color:#0b4f6c;line-height:2;margin:16pt 0 4pt'],
  paragraph: ['p', 'font-size:14pt;text-align:justify;margin:0 0 8pt'],
  label: ['h2', 'font-size:15pt;color:#0b4f6c;line-height:2;margin:20pt 0 6pt'],
  reference: ['p', 'font-size:11pt;margin:0 0 3pt'],
  source: ['p', 'font-size:10pt;color:#555;margin:20pt 0 0'],
};

/** Formatted text for the clipboard: pastes into Word, Docs and mail as is. */
export function blocksToHtml(blocks: Block[]): string {
  const body = blocks
    .map((block) => {
      const [tag, style] = HTML_TAG[block.kind];
      const align = block.center && tag === 'p' ? ';text-align:center' : '';
      return `<${tag} dir="rtl" style="${style}${align}">${block.runs.map(runHtml).join('')}</${tag}>`;
    })
    .join('');
  return `<div dir="rtl" lang="ur" style="font-family:${URDU_FONT};line-height:2.1">${body}</div>`;
}

export const blocksToDocx = (blocks: Block[], title: string, creator: string) =>
  buildDocx(blocks, title, creator);

/** Both forms at once, so pasting into Word keeps the formatting and pasting
 *  into a chat gives clean text. Falls back to text alone on old browsers. */
export async function copyBlocks(blocks: Block[]): Promise<void> {
  const text = blocksToText(blocks);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([blocksToHtml(blocks)], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // Some browsers refuse text/html; plain text below still works.
    }
  }
  await navigator.clipboard.writeText(text);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A file name from a title: its first words, without characters Windows forbids. */
export function exportFileName(title: string, extension: string): string {
  const words = [...title]
    // Control characters are not allowed in file names either.
    .filter((ch) => ch.charCodeAt(0) >= 0x20)
    .join('')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
  return `${words || 'tehqeqat-e-hadees'}.${extension}`;
}

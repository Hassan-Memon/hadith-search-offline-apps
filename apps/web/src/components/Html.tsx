import { createElement, useEffect, useMemo, useRef } from 'react';

import { sanitizeHadithHtml, splitForHighlight } from '@tehqeqat/core';

/**
 * Stored hadith HTML, sanitised, with search words marked. Highlighting walks
 * the text nodes after render and wraps matches in <mark>, using the core's
 * normaliser so «نماز» also marks «نَمَازِ».
 */
export function Html({
  html,
  query,
  className,
  as = 'div',
}: {
  html: string | null | undefined;
  query?: string;
  className?: string;
  as?: 'div' | 'h1' | 'h2' | 'h3' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const safe = useMemo(() => sanitizeHadithHtml(html), [html]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !query?.trim()) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const node of nodes) {
      const parts = splitForHighlight(node.data, query);
      if (parts.length === 1) continue;
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (part.highlight) {
          const mark = document.createElement('mark');
          mark.textContent = part.text;
          frag.appendChild(mark);
        } else {
          frag.appendChild(document.createTextNode(part.text));
        }
      }
      node.replaceWith(frag);
    }
  }, [safe, query]);

  return createElement(as, { ref, className, dangerouslySetInnerHTML: { __html: safe } });
}

/** Plain text with highlighted words (for snippets). */
export function Marked({ text, query }: { text: string; query?: string }) {
  const parts = query ? splitForHighlight(text, query) : [{ text, highlight: false }];
  return (
    <>
      {parts.map((p, i) => (p.highlight ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

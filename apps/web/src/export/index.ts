// Copy as text, Word file and the narrator's study, the website's way.
// Loaded only when the reader asks for one of them (import() in Hadith.tsx),
// so it adds nothing to the app's start.
import { parseSections, type HadithRow, type HadithSection } from '@tehqeqat/core';

import {
  blocksToDocx,
  buildExportBlocks,
  copyBlocks,
  downloadBlob,
  exportFileName,
  type ExportInput,
} from './hadithExport';

export interface ExportMeta {
  title: string;
  /** «کتاب: …», «باب: …», date, reviewer: one line each. */
  meta: string[];
  url: string;
  labels: { references: string; source: string; creator: string };
}

function input(row: HadithRow, m: ExportMeta, sections?: HadithSection[]): ExportInput {
  return {
    title: m.title,
    meta: m.meta,
    hukm: row.hukm_html ?? undefined,
    sections: sections ?? parseSections(row.html_content),
    references: row.references_html ?? undefined,
    referencesLabel: m.labels.references,
    sourceLabel: m.labels.source,
    url: m.url,
  };
}

/** Title, hukm, the whole research and the references, formatted and as plain text. */
export async function copyHadith(row: HadithRow, m: ExportMeta): Promise<void> {
  await copyBlocks(buildExportBlocks(input(row, m)));
}

/** The same as a Word file (opens in Word and Google Docs). */
export function downloadWord(row: HadithRow, m: ExportMeta): void {
  const blob = blocksToDocx(buildExportBlocks(input(row, m)), m.title, m.labels.creator);
  downloadBlob(blob, exportFileName(m.title, 'docx'));
}

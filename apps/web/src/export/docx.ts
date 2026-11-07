// Ported unchanged from the website (frontend-next/src/lib), so a copied or
// downloaded narration is the same from the app and from tehqeqatehadees.com.

// A small Word (.docx) writer that runs in the browser.
//
// A .docx is a zip of XML files. The research is paragraphs of right-to-left
// text with bold, superscript footnote marks and two fonts, which is a small
// part of the format, so it is written here directly rather than loading a
// general library (the smallest is several hundred KB) or sending the text
// to the server. The file opens in Word and, uploaded to Drive, in Google
// Docs.

export type Script = 'ur' | 'ar' | 'latin';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sup?: boolean;
  script: Script;
}

export type BlockKind =
  | 'title'
  | 'meta'
  | 'hukm'
  | 'heading'
  | 'paragraph'
  | 'label'
  | 'reference'
  | 'source';

export interface Block {
  kind: BlockKind;
  center?: boolean;
  runs: Run[];
}

// The fonts a reader of Urdu or Arabic is most likely to have in Word. Word
// (and Google Docs) substitute their own Nastaliq or Naskh when one is
// missing; the text itself is plain Unicode either way.
const FONT: Record<Script, string> = {
  ur: 'Jameel Noori Nastaleeq',
  ar: 'Traditional Arabic',
  latin: 'Calibri',
};

// Sizes in half-points (28 = 14 pt).
const STYLE: Record<
  BlockKind,
  { size: number; bold?: boolean; color?: string; after: number; before?: number }
> = {
  title: { size: 40, bold: true, after: 160 },
  meta: { size: 24, color: '555555', after: 60 },
  hukm: { size: 30, bold: true, after: 200, before: 120 },
  heading: { size: 30, bold: true, color: '0B4F6C', after: 80, before: 280 },
  paragraph: { size: 28, after: 140 },
  label: { size: 30, bold: true, color: '0B4F6C', after: 100, before: 360 },
  reference: { size: 22, after: 60 },
  source: { size: 20, color: '555555', after: 0, before: 360 },
};

// Characters XML 1.0 does not allow at all (control codes other than tab,
// line feed and carriage return, and the two non-characters).
const isXmlChar = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0;
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code !== 0xfffe && code !== 0xffff)
  );
};

const escapeXml = (text: string) =>
  [...text]
    .filter(isXmlChar)
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function runXml(run: Run, kind: BlockKind): string {
  const style = STYLE[kind];
  const font = FONT[run.script];
  const size = run.script === 'ar' ? style.size + 2 : style.size;
  const bold = run.bold || style.bold;
  const props = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`,
    bold ? '<w:b/><w:bCs/>' : '',
    run.italic ? '<w:i/><w:iCs/>' : '',
    style.color ? `<w:color w:val="${style.color}"/>` : '',
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    run.underline ? '<w:u w:val="single"/>' : '',
    run.sup ? '<w:vertAlign w:val="superscript"/>' : '',
    // Complex-script runs must be marked right-to-left or Word orders the
    // words of a line the wrong way round.
    run.script === 'latin' ? '' : '<w:rtl/>',
    run.script === 'latin' ? '' : `<w:lang w:bidi="${run.script === 'ar' ? 'ar-SA' : 'ur-PK'}"/>`,
  ].join('');
  return run.text
    .split('\n')
    .map(
      (line, index) =>
        `<w:r><w:rPr>${props}</w:rPr>${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join('');
}

function paragraphXml(block: Block): string {
  const style = STYLE[block.kind];
  const centered = block.center || block.kind === 'title' || block.kind === 'meta';
  // No <w:jc> means the start of the line, which is the right edge in a
  // right-to-left paragraph; "start" itself is not understood by every Word.
  const justify = centered ? 'center' : block.kind === 'paragraph' ? 'both' : '';
  // Elements must follow the schema's order (keepNext, bidi, spacing, jc) or
  // Word reports the file as unreadable.
  const props =
    (block.kind === 'heading' || block.kind === 'label' ? '<w:keepNext/>' : '') +
    '<w:bidi/>' +
    `<w:spacing w:before="${style.before ?? 0}" w:after="${style.after}" w:line="360" w:lineRule="auto"/>` +
    (justify ? `<w:jc w:val="${justify}"/>` : '');
  return `<w:p><w:pPr>${props}</w:pPr>${block.runs.map((run) => runXml(run, block.kind)).join('')}</w:p>`;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function documentXml(blocks: Block[]): string {
  // A4, 2.2 cm margins, a right-to-left section.
  const section =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/>' +
    '<w:bidi/></w:sectPr>';
  return `${XML}<w:document ${W}><w:body>${blocks.map(paragraphXml).join('')}${section}</w:body></w:document>`;
}

const STYLES_XML = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT.latin}" w:hAnsi="${FONT.latin}" w:cs="${FONT.ur}"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="en-US" w:bidi="ur-PK"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

const CONTENT_TYPES_XML = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const ROOT_RELS_XML = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const DOCUMENT_RELS_XML = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const coreXml = (title: string, creator: string) =>
  `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(creator)}</dc:creator><dc:language>ur-PK</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`;

// ---- zip (stored, no compression: the files are small text) ----

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; text: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, 0x0800, true); // names are UTF-8
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, 0, true); // time
    header.setUint16(12, 0x21, true); // date: 1980-01-01
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true);
    parts.push(new Uint8Array(header.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function buildDocx(blocks: Block[], title: string, creator: string): Blob {
  return zip([
    // The content types part must come first in the package.
    { name: '[Content_Types].xml', text: CONTENT_TYPES_XML },
    { name: '_rels/.rels', text: ROOT_RELS_XML },
    { name: 'docProps/core.xml', text: coreXml(title, creator) },
    { name: 'word/document.xml', text: documentXml(blocks) },
    { name: 'word/styles.xml', text: STYLES_XML },
    { name: 'word/_rels/document.xml.rels', text: DOCUMENT_RELS_XML },
  ]);
}

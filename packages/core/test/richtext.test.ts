import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blocksToText, htmlToBlocks } from '../src/richtext.js';

const SAMPLE = `<p class="MsoNormal" align="center" dir="RTL"><span class="font-class-Bashar">بسم ﷲ الرحمن الرحیم</span><span dir="LTR"></span></p>
<p class="Arbic" dir="RTL"><span>الحَمْدُ لله</span><span class="font-class-Jameel-Noori-Nastaleeq">’’</span><span>إنّ کِذْباً</span></p>
<p class="MsoNormal" dir="RTL"><b><span class="font-class-Jameel-Noori-Nastaleeq">ترجمہ:</span></b> ’’جس نے مجھ پر جھوٹ بولا‘‘<a href="file:///D:/x.docx#_ftn1" name="_ftn1"><span class="MsoFootnoteReference">[1]</span></a><o:p></o:p></p>
<p>line one<br>line two</p>
<p>   </p>`;

test('htmlToBlocks builds paragraphs with fonts, bold and alignment', () => {
  const blocks = htmlToBlocks(SAMPLE);
  assert.equal(blocks.length, 4); // the blank paragraph is dropped
  assert.equal(blocks[0]!.align, 'center');
  assert.equal(blocks[0]!.runs[0]!.font, 'naskh');
  assert.equal(blocks[0]!.runs[0]!.text, 'بسم ﷲ الرحمن الرحیم');

  // Paragraph-level class="Arbic" gives its plain spans the naskh font;
  // the Jameel span keeps nastaleeq.
  assert.equal(blocks[1]!.font, 'naskh');
  assert.deepEqual(
    blocks[1]!.runs.map((r) => r.font),
    ['naskh', 'nastaleeq', 'naskh'],
  );

  const third = blocks[2]!;
  assert.equal(third.runs[0]!.bold, true);
  assert.equal(third.runs[0]!.text, 'ترجمہ:');
  // Dead file:// footnote link carries no href; the marker text survives.
  const marker = third.runs.find((r) => r.text.includes('[1]'));
  assert.ok(marker);
  assert.equal(marker!.href, undefined);

  assert.equal(blocksToText([blocks[3]!]), 'line one\nline two');
});

test('htmlToBlocks never throws on junk', () => {
  assert.deepEqual(htmlToBlocks(''), []);
  assert.deepEqual(htmlToBlocks(null), []);
  const blocks = htmlToBlocks('<div><span>unclosed <b>bold</div> tail </p> <<>> &amp; &nbsp;');
  assert.ok(blocks.length >= 1);
  assert.match(blocksToText(blocks), /unclosed bold/);
});

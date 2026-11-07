// Urdu interface strings. The website's wording is reused where it exists
// (navigation, book and detail labels) so both read the same.
export const t = {
  appName: 'تحقیقاتِ حدیث',
  appTagline: 'غیر معتبر روایات اور علومِ حدیث کا تحقیقی سرچ انجن',
  nav: {
    search: 'تلاش',
    all: 'تمام احادیث',
    books: 'کتب',
    saved: 'محفوظ',
    more: 'مزید',
    about: 'تعارف',
    chapters: 'ابواب',
    narrators: 'رواۃ',
  },
  search: {
    placeholder: 'حدیث، لفظ یا موضوع لکھیں…',
    button: 'تلاش کریں',
    results: (n: number) => `${fmt(n)} نتائج`,
    none: 'اس تلاش کا کوئی نتیجہ نہیں ملا۔ کوئی دوسرا لفظ آزمائیں۔',
    hint: 'تلاش آپ کے آلے پر ہوتی ہے، انٹرنیٹ کے بغیر بھی۔',
    filterBook: 'کتاب',
    allBooks: 'تمام کتب',
    filterChapter: 'باب',
    allChapters: 'تمام ابواب',
    clearFilters: 'فلٹر ہٹائیں',
    phrase: 'پورا جملہ',
    allWords: 'تمام الفاظ',
    anyWord: 'کچھ الفاظ',
  },
  list: {
    loadMore: 'مزید دکھائیں',
    readMore: 'مکمل تحقیق پڑھیں',
    count: (n: number) => `${fmt(n)} روایات`,
    empty: 'یہاں ابھی کچھ نہیں۔',
  },
  books: {
    title: 'کتب',
    series: 'غیر معتبر روایات کا فنی جائزہ',
    seriesNote: 'تحقیقی سلسلے کے تمام حصے، ترتیب وار۔',
    others: 'دیگر کتب',
    published: (date: string) => `تاریخِ اشاعت: ${date}`,
    intro: 'اس کتاب کی تمام تحقیق شدہ روایات۔ کسی روایت پر کلک کر کے اس کی مکمل تحقیق پڑھیں۔',
  },
  chapters: {
    title: 'ابواب',
    intro: 'موضوع کے لحاظ سے روایات: عقائد، عبادات، سیرت، فضائل اور دیگر۔',
    other: 'دیگر',
    chapter: (name: string) => `باب: ${name}`,
    samples: 'ہر باب سے ایک روایت',
    samplesMore: 'اور دکھائیں',
    chooseBook: 'کتاب منتخب کریں',
    allChapters: 'تمام ابواب',
    notFound: 'یہ باب آپ کے آلے پر موجود نہیں۔',
  },
  narrators: {
    title: 'رواۃِ حدیث',
    eyebrow: 'ائمۂ جرح و تعدیل کا کلام',
    description:
      'ان کتب کی روایات کی اسناد میں آنے والے وہ راوی جن پر تحقیق کے دوران ائمۂ جرح و تعدیل کے اقوال نقل کیے گئے ہیں۔ کسی راوی کا نام منتخب کریں اور اس کے بارے میں ائمہ کا کلام پڑھیں۔',
    stats: (narrators: number, studies: number, hadith: number) =>
      `${fmt(narrators)} رواۃ · ${fmt(studies)} تراجم · ${fmt(hadith)} روایات`,
    suggestions: 'چند رواۃ',
    suggestionsNote: 'ہر بار نئے نام۔',
    more: 'اور دکھائیں',
    all: 'تمام رواۃ',
    searchLabel: 'راوی کا نام تلاش کریں',
    searchPlaceholder: 'نام، کنیت یا نسبت لکھیں، مثلاً: ہیثم، ابو جعفر، بصری',
    count: (n: number) => `${fmt(n)} رواۃ`,
    countOf: (n: number, total: number) => `${fmt(total)} میں سے ${fmt(n)} رواۃ`,
    noMatch: 'اس نام کا کوئی راوی نہیں ملا۔ نام کا کوئی ایک حصہ لکھ کر دیکھیں۔',
    period: 'زمانہ',
    periodAll: 'سب',
    century: (n: number) => `${CENTURIES[n] ?? fmt(n)} صدی ہجری`,
    unknown: 'سنِ وفات درج نہیں',
    empty: 'رواۃ کی فہرست ابھی آلے پر نہیں آئی۔ انٹرنیٹ سے جڑ کر تازہ کریں۔',
    died: (note: string) => `وفات: ${note}`,
    inNarrations: (n: number) => (n === 1 ? 'ایک روایت میں تذکرہ' : `${fmt(n)} روایات میں تذکرہ`),
    detailEyebrow: 'راوی',
    alsoKnown: 'دوسرے نام',
    studiesHeading: 'ائمۂ جرح و تعدیل کا کلام',
    intro: (name: string) =>
      `${name} کے بارے میں ائمۂ جرح و تعدیل کے اقوال، جیسے وہ ذیل کی روایات کی تحقیق میں نقل کیے گئے ہیں۔`,
    fromNarration: 'اس روایت کی تحقیق سے',
    studyOf: (i: number, n: number) => `${fmt(n)} میں سے ${fmt(i)}`,
    openNarration: 'پوری روایت اور اس کا حکم دیکھیں',
    note: 'یہ متن کتاب کی تحقیق کا حصہ ہے اور بعینہٖ نقل کیا گیا ہے؛ روایت کا حکم جاننے کے لیے پوری تحقیق دیکھیں۔',
    notFound: 'یہ راوی آپ کے آلے پر موجود نہیں۔',
    inNarration: 'اس تحقیق میں مذکور رواۃ',
    page: 'اس راوی کا الگ صفحہ',
  },
  hadith: {
    book: 'کتاب',
    hukm: 'حکم',
    details: 'تفصیل',
    references: 'حوالہ جات',
    related: 'متعلقہ روایات',
    published: (date: string) => `تاریخِ اشاعت: ${date}`,
    contents: 'فہرستِ مضامین',
    contentsCount: (n: number) => `${fmt(n)} عنوانات`,
    copyText: 'مکمل متن کاپی کریں',
    textCopied: 'مکمل متن کاپی ہو گیا',
    copyFailed: 'کاپی نہیں ہو سکا۔ متن منتخب کر کے خود کاپی کریں۔',
    word: 'Word فائل',
    wordReady: 'Word فائل تیار ہے',
    wordFailed: 'Word فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔',
    print: 'پرنٹ کریں',
    pdf: 'کتاب کے اصل صفحات (PDF)',
    pdfOffline: 'کتاب کے صفحات کے لیے انٹرنیٹ درکار ہے۔',
    preparing: 'تیار ہو رہا ہے …',
    source: 'ماخذ: تحقیقاتِ حدیث',
    bookmark: 'محفوظ کریں',
    bookmarked: 'محفوظ ہے',
    share: 'شیئر کریں',
    copied: 'لنک کاپی ہو گیا',
    openWeb: 'ویب سائٹ پر کھولیں',
    expandAll: 'سب کھولیں',
    collapseAll: 'سب بند کریں',
    notFound: 'یہ روایت آپ کے آلے پر موجود نہیں۔ تازہ کرنے کے بعد دوبارہ دیکھیں۔',
    reviewedBy: 'تحقیق و نظر ثانی: مفتی طارق امیر خان صاحب',
  },
  saved: {
    bookmarks: 'محفوظ روایات',
    history: 'حال ہی میں پڑھی گئیں',
    noBookmarks: 'آپ نے ابھی کوئی روایت محفوظ نہیں کی۔ کسی روایت پر «محفوظ کریں» دبائیں۔',
    noHistory: 'آپ نے ابھی کوئی روایت نہیں پڑھی۔',
  },
  sync: {
    firstTitle: 'پورا ذخیرہ آپ کے آلے پر',
    firstBody:
      'ایک بار ڈاؤن لوڈ کے بعد تمام روایات، تلاش اور تعارف انٹرنیٹ کے بغیر چلیں گے۔ نئی اور تبدیل شدہ روایات خود بخود آتی رہیں گی۔',
    size: 'ڈاؤن لوڈ تقریباً ۱۰ ایم بی۔ وائی فائی بہتر ہے۔',
    phase: {
      manifest: 'معلومات لی جا رہی ہیں…',
      'snapshot-download': 'ڈاؤن لوڈ ہو رہا ہے…',
      'snapshot-install': 'محفوظ کیا جا رہا ہے…',
      delta: 'نئی روایات آ رہی ہیں…',
      extras: 'اعلانات اور کتب خانہ…',
      done: 'مکمل',
    } as Record<string, string>,
    retry: 'دوبارہ کوشش کریں',
    offlineFirst: 'پہلی بار ڈیٹا لینے کے لیے انٹرنیٹ درکار ہے۔ انٹرنیٹ سے جڑتے ہی ڈاؤن لوڈ خود شروع ہو جائے گا۔',
    error: 'ڈیٹا نہیں آ سکا:',
    updateRequired: 'ایپ کا نیا ورژن درکار ہے، وہ خود بخود لوڈ ہو رہا ہے۔ نہ ہو تو ایپ بند کر کے دوبارہ کھولیں۔',
    opening: 'کھل رہا ہے…',
    busy: 'یہ ایپ کسی اور ونڈو یا ٹیب میں کھلی ہے۔ وہاں سے بند کر کے «دوبارہ کوشش کریں» دبائیں۔',
    badgeSyncing: 'تازہ ہو رہا ہے',
    badgeOffline: 'آف لائن',
    badgeOk: 'تازہ',
    badgeError: 'تازہ نہیں ہو سکا',
    now: 'ابھی تازہ کریں',
    last: 'آخری بار تازہ:',
    published: 'ڈیٹا کی آخری اشاعت:',
    never: 'ابھی نہیں',
    notPersistent:
      'یہ براؤزر ڈیٹا مستقل محفوظ نہیں کرتا، اس لیے ہر بار دوبارہ ڈاؤن لوڈ ہوگا۔ کروم، ایج یا سفاری کا نیا ورژن استعمال کریں۔',
  },
  update: {
    ready: 'ایپ کا نیا ورژن تیار ہے۔',
    apply: 'ابھی اپ ڈیٹ کریں',
    done: (v: string) => `ایپ نئے ورژن ${v} پر اپ ڈیٹ ہو گئی۔`,
  },
  more: {
    title: 'مزید',
    syncTitle: 'ڈیٹا',
    stored: (n: number) => `${fmt(n)} روایات آلے پر محفوظ`,
    appearance: 'ظاہری انداز',
    font: 'رسم الخط',
    fontMehr: 'مہر نستعلیق (ہلکا)',
    fontJameel: 'جمیل نوری نستعلیق (۵ ایم بی، ایک بار)',
    textSize: 'متن کا سائز',
    theme: 'رنگ',
    themeSystem: 'آلے کے مطابق',
    themeLight: 'روشن',
    themeDark: 'تاریک',
    install: 'ایپ انسٹال کریں',
    installButton: 'ابھی انسٹال کریں',
    installed: 'ایپ انسٹال ہے۔',
    installHelp: [
      ['اینڈرائیڈ (کروم)', 'مینو ⋮ ← «ایپ انسٹال کریں» یا «ہوم اسکرین میں شامل کریں»'],
      ['آئی فون (سفاری)', 'شیئر بٹن ← «ہوم اسکرین میں شامل کریں»'],
      ['ونڈوز / میک (کروم یا ایج)', 'ایڈریس بار میں انسٹال کا نشان ← «انسٹال»'],
    ] as [string, string][],
    library: 'کتب خانہ (پی ڈی ایف)',
    website: 'ویب سائٹ',
    version: 'ورژن',
    storage: 'آلے پر جگہ',
    reset: 'ڈاؤن لوڈ شدہ ڈیٹا حذف کریں',
    resetConfirm: 'یقینی طور پر حذف کریں؟ محفوظ روایات بھی ختم ہو جائیں گی۔',
    yes: 'ہاں، حذف کریں',
    no: 'نہیں',
  },
  library: {
    title: 'کتب خانہ',
    note: 'پی ڈی ایف کتابیں ویب سائٹ سے کھلتی ہیں، اس کے لیے انٹرنیٹ درکار ہے۔',
    open: 'کھولیں',
    empty: 'کتب خانے کی فہرست ابھی نہیں آئی۔ انٹرنیٹ سے جڑ کر تازہ کریں۔',
  },
  about: {
    title: 'تعارف',
    eyebrow: 'غیر معتبر روایات کا فنی جائزہ — مقدمہ و تقاریظ',
    intro:
      'کتاب «غیر معتبر روایات کا فنی جائزہ» کے حصہ اول سے مصنف کا مقدمہ اور اکابر علماء کی تقاریظ، تاکہ قاری اس تحقیقی کام کی غرض و غایت، منہج اور طریقۂ کار سے واقف ہو سکے۔',
    author: 'تحقیق: مفتی طارق امیر خان',
    taqariz: 'تقاریظ',
    taqarizNote: 'حصہ اول میں شامل اکابر علماء کی تقاریظ کے اصل عکس۔ پڑھنے کے لیے صفحے پر ٹیپ کریں۔',
    muqaddima: 'مقدمہ',
    contents: 'فہرست مضامین',
    opening: 'آغاز',
    page: (n: number) => `صفحہ ${fmt(n)}`,
    close: 'بند کریں',
    muqaddimaMissing: 'مقدمہ ابھی آلے پر نہیں آیا۔ ڈاؤن لوڈ مکمل ہونے کے بعد یہاں دکھائی دے گا۔',
    volume2Title: 'حصہ دوم کا مقدمہ اور بعض تعبیرات کی توضیح',
    volume2Intro:
      'تحقیق میں بار بار آنے والی عبارات — «بیان نہیں کر سکتے»، «مختصر نوع»، «بے اصل»، «اسرائیلی روایت»، «اکتفاء» — کا مطلب مصنف کے الفاظ میں۔',
    volume2Preface: 'مقدمہ (حصہ دوم)',
    volume2Short: 'توضیح تعبیرات',
    volume2Source: (book: string, pages: string) => `ماخذ: ${book}، صفحات ${pages}`,
  },
  home: {
    recent: 'حال ہی میں پڑھی گئیں',
    explore: 'دیکھیں',
    stats: (n: number, v: number) => `${fmt(n)} تحقیق شدہ روایات · ${fmt(v)} حصے`,
    cards: {
      all: 'تمام تحقیق شدہ روایات، کتاب اور باب کے لحاظ سے۔',
      books: 'سلسلے کے تمام حصے اور دیگر کتب، ترتیب وار۔',
      chapters: 'موضوع کے لحاظ سے روایات: عقائد، عبادات، سیرت، فضائل اور دیگر۔',
      narrators: 'اسناد کے راویوں پر ائمۂ جرح و تعدیل کے اقوال، ہر راوی کا الگ صفحہ۔',
      about: 'مقدمہ، اکابر کی تقاریظ اور تحقیق کا طریقۂ کار۔',
      saved: 'آپ کی محفوظ اور حال ہی میں پڑھی گئی روایات۔',
    },
  },
  back: 'واپس',
};

const CENTURIES: Record<number, string> = {
  1: 'پہلی',
  2: 'دوسری',
  3: 'تیسری',
  4: 'چوتھی',
  5: 'پانچویں',
  6: 'چھٹی',
  7: 'ساتویں',
  8: 'آٹھویں',
  9: 'نویں',
  10: 'دسویں',
};

/** A calendar date («2020-03-01») the way the website writes it. */
export function fmtDay(day: string | null | undefined): string {
  if (!day) return '';
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  try {
    return new Intl.DateTimeFormat('ur-PK', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  } catch {
    return day.slice(0, 10);
  }
}

export function fmt(n: number): string {
  return new Intl.NumberFormat('ur-PK').format(n);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return t.sync.never;
  try {
    return new Intl.DateTimeFormat('ur-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

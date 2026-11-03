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
  },
  search: {
    placeholder: 'حدیث، لفظ یا موضوع لکھیں…',
    button: 'تلاش کریں',
    results: (n: number) => `${fmt(n)} نتائج`,
    none: 'اس تلاش کا کوئی نتیجہ نہیں ملا۔ کوئی دوسرا لفظ آزمائیں۔',
    hint: 'تلاش آپ کے آلے پر ہوتی ہے، انٹرنیٹ کے بغیر بھی۔',
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
  },
  hadith: {
    book: 'کتاب',
    hukm: 'حکم',
    details: 'تفصیل',
    references: 'حوالہ جات',
    related: 'اسی کتاب سے',
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
    updateRequired: 'ایپ کا نیا ورژن درکار ہے۔ صفحہ دوبارہ کھولیں تاکہ نیا ورژن لوڈ ہو۔',
    badgeSyncing: 'تازہ ہو رہا ہے',
    badgeOffline: 'آف لائن',
    badgeOk: 'تازہ',
    badgeError: 'تازہ نہیں ہو سکا',
    now: 'ابھی تازہ کریں',
    last: 'آخری بار تازہ:',
    never: 'ابھی نہیں',
    notPersistent:
      'یہ براؤزر ڈیٹا مستقل محفوظ نہیں کرتا، اس لیے ہر بار دوبارہ ڈاؤن لوڈ ہوگا۔ کروم، ایج یا سفاری کا نیا ورژن استعمال کریں۔',
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
  },
  home: {
    recent: 'حال ہی میں پڑھی گئیں',
    explore: 'دیکھیں',
    stats: (n: number, v: number) => `${fmt(n)} تحقیق شدہ روایات · ${fmt(v)} حصے`,
  },
  back: 'واپس',
};

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

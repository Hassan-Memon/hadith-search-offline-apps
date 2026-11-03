export type Locale = 'ur' | 'en' | 'ar';
export declare const locales: readonly Locale[];
export declare const defaultLocale: Locale;
export declare const messages: Record<Locale, Record<string, unknown>>;
export declare function isRtl(locale: string): boolean;
export declare function translate(
  locale: string,
  key: string,
  params?: Record<string, string | number>,
): string;

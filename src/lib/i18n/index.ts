import en, { type DictionaryKey } from "./dictionaries/en";
import tl from "./dictionaries/tl";

export type Locale = "en" | "tl";
export const LOCALE_COOKIE = "ani_lang";
export const LOCALES: Locale[] = ["en", "tl"];

const dictionaries: Record<Locale, Record<string, string>> = { en, tl };

/**
 * Translate a dictionary key for the given locale, with simple {placeholder}
 * interpolation. Never throws: falls back to the English string, then to the
 * raw key itself, so a missing/typo'd key degrades to visible-but-harmless
 * text instead of crashing a page (matching this app's "never trust
 * user-facing text to a code path that can throw" lesson from the Post
 * Listing bug).
 */
export function t(
  key: DictionaryKey | string,
  locale: Locale,
  vars?: Record<string, string | number>
): string {
  const raw = dictionaries[locale]?.[key] ?? en[key as DictionaryKey] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (str, [name, value]) => str.replaceAll(`{${name}}`, String(value)),
    raw
  );
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "tl";
}

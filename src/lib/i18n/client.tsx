"use client";

import { createContext, useContext, useMemo } from "react";
import { t as translate, type Locale } from "./index";
import type { DictionaryKey } from "./dictionaries/en";

const LocaleContext = createContext<Locale>("en");

/** Wraps the app (in the root layout) so any Client Component can call useT() without prop-drilling the locale through every component. The Server-rendered locale is passed in once, here, from a cookie read in layout.tsx. */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Client-side translation hook, mirroring the server t() helper. */
export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () =>
      (key: DictionaryKey | string, vars?: Record<string, string | number>) =>
        translate(key, locale, vars),
    [locale]
  );
}

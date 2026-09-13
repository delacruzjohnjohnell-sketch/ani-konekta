"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Persistent EN|TL pill toggle for the main nav. Calls the setLocaleAction
 * server action inside a transition so the switch feels instant (no full
 * page reload flash) while the cookie + revalidated RSC tree catch up.
 */
export function LanguageToggle({ currentLocale }: { currentLocale: Locale }) {
  const [isPending, startTransition] = useTransition();

  function select(locale: Locale) {
    if (locale === currentLocale || isPending) return;
    startTransition(() => {
      setLocaleAction(locale);
    });
  }

  return (
    <div
      className="flex items-center rounded-full border border-brand-green-200 bg-white p-0.5 text-xs font-medium"
      role="group"
      aria-label="Language"
    >
      {(["en", "tl"] as const).map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => select(locale)}
          disabled={isPending}
          aria-pressed={currentLocale === locale}
          className={cn(
            "rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors disabled:opacity-60",
            currentLocale === locale
              ? "bg-brand-green-700 text-white"
              : "text-brand-green-800 hover:bg-brand-green-50"
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}

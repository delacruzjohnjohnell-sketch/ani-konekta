import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "./index";

/** Read the visitor's saved language from the (non-httpOnly) ani_lang cookie. Defaults to English. Safe to call from any Server Component or Server Action. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

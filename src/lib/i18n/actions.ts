"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./index";

/**
 * Sets the visitor's language preference. Called from the client language
 * toggle. Not httpOnly — there's no sensitive data in a two-value language
 * cookie, and this keeps the door open for a client read if ever needed.
 * revalidatePath("/", "layout") re-renders the whole tree server-side so the
 * *next* paint (including this same page, for an in-place toggle) already
 * reflects the new locale — no flash of the old language.
 */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
    path: "/",
  });
  revalidatePath("/", "layout");
}

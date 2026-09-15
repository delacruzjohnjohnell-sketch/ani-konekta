"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { handleInboundSms } from "@/lib/sms-commands";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { ActionState } from "@/components/ui/action-form";

// Non-admin senders are locked to their own phone (checked server-side, not
// just hidden in the form) — this simulates "the SMS arrived from this
// person's phone," which a real telco webhook would guarantee for free via
// caller ID. ADMIN may type any phone, for demoing another user's flow.
export async function simulateInboundSms(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const sessionUser = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  const requestedPhone = String(formData.get("phone") ?? "").trim();

  if (!body) {
    return { error: t("sms.error.empty", locale) };
  }

  // session.user doesn't carry `phone` (see src/types/next-auth.d.ts) — look
  // up the real row instead of trusting a hidden form field for non-admins.
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  const phone = sessionUser.role === "ADMIN" && requestedPhone ? requestedPhone : dbUser.phone;

  const { success, reply } = await handleInboundSms({ phone, body });
  revalidatePath("/sms");
  return success ? { success: true } : { error: reply };
}

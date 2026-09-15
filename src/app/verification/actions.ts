"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/app/actions";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { ActionState } from "@/components/ui/action-form";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  SELLER: "/seller/dashboard",
  BUYER: "/buyer/dashboard",
  HAULER: "/hauler/dashboard",
};

// ---------------------------------------------------------------------------
// Any role: submit (or resubmit, if previously REJECTED) an ID document for
// verification. Sets User.idVerificationStatus = PENDING immediately —
// IdVerificationSubmission is the detail/audit row, the User field is the
// fast denormalized "current status" read used everywhere else (dashboards,
// marketplace badges).
// ---------------------------------------------------------------------------
export async function submitIdVerification(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser();
  const note = String(formData.get("note") ?? "").trim() || null;
  const photoFile = formData.get("idDocument");

  if (!(photoFile instanceof File) || photoFile.size === 0) {
    return { error: t("verification.error.documentRequired", locale) };
  }

  let blobKey: string;
  try {
    blobKey = await uploadPhoto(photoFile, "id-verification");
  } catch (err) {
    if (err instanceof PhotoValidationError) {
      return { error: err.message };
    }
    const reason = err instanceof Error ? err.message : String(err);
    return { error: t("seller.error.photoUploadFailed", locale, { reason }) };
  }

  await prisma.$transaction([
    prisma.idVerificationSubmission.create({
      data: { userId: user.id, documentBlobKeys: [blobKey], note },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { idVerificationStatus: "PENDING" },
    }),
  ]);

  revalidatePath(DASHBOARD_BY_ROLE[user.role] ?? "/dashboard");
  return { success: true };
}

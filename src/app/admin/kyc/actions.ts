"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/app/actions";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";

export async function scheduleKycVisit(formData: FormData) {
  const admin = await requireUser("ADMIN");
  const phone = String(formData.get("phone") ?? "").trim();
  const visitDateRaw = String(formData.get("visitDate") ?? "").trim();

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error("No user found with that phone number.");
  }

  await prisma.$transaction([
    prisma.kycVisit.create({
      data: {
        userId: user.id,
        status: "VISIT_SCHEDULED",
        visitDate: visitDateRaw ? new Date(visitDateRaw) : null,
        scheduledBy: admin.id,
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { kycStatus: "VISIT_SCHEDULED" } }),
  ]);

  revalidatePath("/admin/kyc");
}

export async function recordKycVisitOutcome(formData: FormData) {
  await requireUser("ADMIN");
  const visitId = String(formData.get("visitId"));
  const status = String(formData.get("status")); // UNDER_REVIEW | KYC_VERIFIED | REJECTED
  const verifierName = String(formData.get("verifierName") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const evidenceFile = formData.get("evidence");

  const visit = await prisma.kycVisit.findUniqueOrThrow({ where: { id: visitId } });

  let evidenceBlobKeys = visit.evidenceBlobKeys;
  if (evidenceFile instanceof File && evidenceFile.size > 0) {
    try {
      const key = await uploadPhoto(evidenceFile, "kyc-evidence");
      evidenceBlobKeys = [...evidenceBlobKeys, key];
    } catch (err) {
      if (err instanceof PhotoValidationError) throw err;
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }

  await prisma.$transaction([
    prisma.kycVisit.update({
      where: { id: visitId },
      data: {
        status: status as never,
        verifierName,
        notes,
        evidenceBlobKeys,
        visitDate: visit.visitDate ?? new Date(),
      },
    }),
    prisma.user.update({ where: { id: visit.userId }, data: { kycStatus: status as never } }),
  ]);

  revalidatePath("/admin/kyc");
}

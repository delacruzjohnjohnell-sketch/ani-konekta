"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/app/actions";

export async function reviewIdVerification(formData: FormData) {
  const admin = await requireUser("ADMIN");
  const submissionId = String(formData.get("submissionId"));
  const decision = String(formData.get("decision")); // "VERIFIED" | "REJECTED"
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;

  const submission = await prisma.idVerificationSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });

  await prisma.$transaction([
    prisma.idVerificationSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision as never,
        reviewedBy: admin.id,
        reviewNote,
        reviewedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: submission.userId },
      data: { idVerificationStatus: decision as never },
    }),
  ]);

  revalidatePath("/admin/verification");
}

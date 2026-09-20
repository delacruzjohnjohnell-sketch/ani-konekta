"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/action-form";

/**
 * Invoice-financing / Net-30 eligibility and credit limit are set here by an
 * admin ONLY — they are never granted automatically, and only for verified
 * institutional buyers.
 */
export async function setBuyerCredit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const buyerId = String(fd.get("buyerId"));
  const eligible = fd.get("invoiceFinancingEligible") === "on";
  const limitRaw = String(fd.get("creditLimit") ?? "").trim();
  const creditLimit = limitRaw === "" ? null : Number(limitRaw);
  if (creditLimit != null && !(creditLimit >= 0)) return { error: "Credit limit must be zero or more." };

  const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
  if (!buyer || buyer.role !== "BUYER") return { error: "Buyer not found." };
  if (buyer.buyerType !== "INSTITUTIONAL_ENTERPRISE") return { error: "Only institutional enterprise buyers can be granted credit terms." };
  if (eligible && creditLimit == null) return { error: "Set a credit limit before enabling Net-30 eligibility." };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: buyerId },
      data: { invoiceFinancingEligible: eligible, creditLimit: creditLimit == null ? null : String(creditLimit) },
    });
    await audit(
      admin.id,
      "BUYER_CREDIT_UPDATED",
      "User",
      buyerId,
      {
        before: { eligible: buyer.invoiceFinancingEligible, creditLimit: buyer.creditLimit?.toString() ?? null },
        after: { eligible, creditLimit },
      },
      tx
    );
  });
  revalidatePath("/admin/buyers");
  return { success: true };
}

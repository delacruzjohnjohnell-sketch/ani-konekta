"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { approveResolution, proposeResolution, SettlementError } from "@/lib/settlement";
import type { ActionState } from "@/components/ui/action-form";

function fail(e: unknown): ActionState {
  if (e instanceof SettlementError) return { error: e.message };
  console.error("[admin/disputes]", e);
  return { error: "Something went wrong. Please try again." };
}

export async function proposeDisputeResolution(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const type = String(fd.get("type"));
  if (type !== "SELLER_RELEASE" && type !== "BUYER_REFUND" && type !== "SPLIT") return { error: "Choose a resolution." };
  const sellerPctRaw = String(fd.get("sellerPct") ?? "").trim();
  try {
    await proposeResolution(String(fd.get("disputeId")), admin.id, {
      type,
      sellerPct: type === "SPLIT" && sellerPctRaw !== "" ? Number(sellerPctRaw) : null,
      notes: String(fd.get("notes") ?? ""),
      damageOrigin: String(fd.get("damageOrigin") ?? "UNDETERMINED"),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/disputes");
  return { success: true };
}

export async function approveDisputeResolution(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  try {
    await approveResolution(String(fd.get("disputeId")), admin.id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/disputes");
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Audited Admin correction of a locked Gate Pass origin weight. Never a silent
 * edit: reason is mandatory and the before/after values are written to the
 * append-only audit log. It informs mediation only — money already held/released
 * was computed from the buyer's dockside accepted/disputed weights.
 */
export async function correctInspectionBaseline(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const orderId = String(fd.get("orderId"));
  const weight = Number(fd.get("actualPickupWeightKg"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!(weight > 0)) return { error: "Enter the corrected origin weight." };
  if (reason.length < 5) return { error: "A reason for the correction is required." };

  const before = await prisma.preDispatchInspection.findUnique({ where: { orderId } });
  if (!before) return { error: "No Gate Pass inspection exists for this order." };
  await prisma.$transaction(async (tx) => {
    await tx.preDispatchInspection.update({ where: { orderId }, data: { actualPickupWeightKg: weight } });
    await audit(
      admin.id,
      "INSPECTION_BASELINE_CORRECTED",
      "PreDispatchInspection",
      before.id,
      { orderId, beforeWeightKg: before.actualPickupWeightKg, afterWeightKg: weight, reason },
      tx
    );
  });
  revalidatePath("/admin/disputes");
  return { success: true };
}

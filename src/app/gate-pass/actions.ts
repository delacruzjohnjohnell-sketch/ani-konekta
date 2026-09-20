"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/action-form";

/**
 * Seller / cooperative sign-off on the pre-dispatch Gate Pass. Authorization
 * is server-side: an independent seller may only sign their own order; a
 * cooperative admin only their cooperative's. Sign-off locks the origin
 * baseline and advances the order POOLED → INSPECTED_PICKUP, atomically and
 * idempotently (compare-and-swap on both rows).
 */
export async function signOffInspection(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "SELLER" && user.role !== "COOPERATIVE_ADMIN") return { error: "Only the seller or cooperative can sign off." };

  const orderId = String(fd.get("orderId"));
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { inspection: true } });
  if (!order) return { error: "Order not found." };

  // Cooperative membership is read from the DB, not the JWT, so a stale session can't authorize.
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { cooperativeId: true } });
  const owns =
    order.ownerType === "COOPERATIVE"
      ? user.role === "COOPERATIVE_ADMIN" && !!dbUser?.cooperativeId && order.cooperativeId === dbUser.cooperativeId
      : user.role === "SELLER" && order.sellerId === user.id;
  if (!owns) return { error: "This order is not yours to sign off." };
  if (!order.inspection) return { error: "The hauler has not recorded a Gate Pass yet." };

  const inspection = order.inspection;
  const now = new Date();
  let outcome: "signed" | "already" | "bad-state";
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const i = await tx.preDispatchInspection.updateMany({
        where: { orderId, sellerSignedAt: null },
        data: { sellerSignoffUserId: user.id, sellerSignedAt: now, lockedAt: now },
      });
      if (i.count === 0) return "already" as const; // idempotent no-op
      const o = await tx.order.updateMany({ where: { id: orderId, status: "POOLED" }, data: { status: "INSPECTED_PICKUP" } });
      if (o.count === 0) throw new Error("ORDER_NOT_AWAITING_PICKUP");
      await audit(
        user.id,
        "INSPECTION_SIGNED_OFF",
        "PreDispatchInspection",
        inspection.id,
        { orderId, lockedWeightKg: inspection.actualPickupWeightKg, ownerType: order.ownerType },
        tx
      );
      return "signed" as const;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ORDER_NOT_AWAITING_PICKUP") outcome = "bad-state";
    else throw e;
  }

  if (outcome === "bad-state") return { error: "This order is no longer awaiting pickup." };
  revalidatePath("/seller/dashboard");
  revalidatePath("/cooperative/dashboard");
  revalidatePath("/hauler/dashboard");
  return { success: true };
}

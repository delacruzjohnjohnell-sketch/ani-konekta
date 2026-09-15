import { prisma } from "@/lib/prisma";

// FEATURE 1 — Escrow Release Lockdown: "Once escrowStatus = RELEASED, make
// that order's financial fields immutable — no further writes to
// amount/commission/payout fields after settlement, enforced at the
// application layer (and at the DB layer...)".
//
// No code path in this app currently writes these fields after order
// creation (order-fulfillment.ts's createEscrowedOrderForLines sets them
// once, at create time, and nothing else touches them) — this guard exists
// so that stays true. Any future code that updates Order and might touch a
// financial field should call this first. The DB-level half of this
// constraint (enforced regardless of which code path tries it, including a
// bug in code that forgets to call this) lives in
// prisma/escrow-immutability-trigger.sql — see that file's header for how to
// apply it, including in production.
export const IMMUTABLE_AFTER_SETTLEMENT_FIELDS = [
  "totalAmount",
  "agreedPricePerKg",
  "volumeKg",
  "commissionConfigId",
  "appliedSellerCommissionRatePercent",
  "appliedBuyerLogisticsFeePercent",
  "appliedHaulerPayoutPercent",
  "sellerCommissionAmountPHP",
  "logisticsFeeAmountPHP",
  "haulerPayoutAmountPHP",
  "platformNetRevenueAmountPHP",
  "netPayoutToSellerPHP",
] as const;

export class OrderSettledImmutableError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} is already SETTLED/RELEASED — its financial fields are immutable.`);
    this.name = "OrderSettledImmutableError";
  }
}

/**
 * Call before any prisma.order.update()/updateMany() whose `data` might
 * include a financial snapshot field. No-ops (zero extra query) if `data`
 * doesn't touch one of those fields.
 */
export async function assertOrderFinancialFieldsImmutable(
  orderId: string,
  data: Record<string, unknown>
): Promise<void> {
  const touchesFinancialField = Object.keys(data).some((k) =>
    (IMMUTABLE_AFTER_SETTLEMENT_FIELDS as readonly string[]).includes(k)
  );
  if (!touchesFinancialField) return;

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { escrowStatus: true },
  });
  if (order.escrowStatus === "RELEASED") {
    throw new OrderSettledImmutableError(orderId);
  }
}

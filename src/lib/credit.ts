import { prisma } from "@/lib/prisma";

/**
 * Net-30 B2B invoice credit gate. Credit is NEVER granted automatically:
 * the buyer must be an INSTITUTIONAL_ENTERPRISE that an admin has marked
 * invoiceFinancingEligible with a creditLimit, and the buyer's outstanding
 * (unsettled) Net-30 exposure plus the new order must stay within that limit.
 * No real credit/financing provider is connected — the settlement itself is
 * simulated (see src/lib/payments.ts).
 */
/** Cheap boolean for UI gating (cart Net-30 option). The real limit check still runs in checkNet30Eligibility at checkout. */
export async function isNet30Approved(buyerId: string): Promise<boolean> {
  const b = await prisma.user.findUnique({
    where: { id: buyerId },
    select: { buyerType: true, invoiceFinancingEligible: true, creditLimit: true },
  });
  return !!b && b.buyerType === "INSTITUTIONAL_ENTERPRISE" && b.invoiceFinancingEligible && b.creditLimit != null;
}

export async function checkNet30Eligibility(
  buyerId: string,
  newOrdersTotalPHP: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
  if (buyer.buyerType !== "INSTITUTIONAL_ENTERPRISE") {
    return { ok: false, error: "Net-30 invoice credit is only available to approved institutional buyers." };
  }
  if (!buyer.invoiceFinancingEligible || buyer.creditLimit == null) {
    return { ok: false, error: "Your account has not been approved for Net-30 invoice credit." };
  }
  const open = await prisma.order.findMany({
    where: { buyerId, paymentTerms: "NET_30", status: { not: "SETTLED" } },
    select: { totalAmount: true, logisticsFeeAmountPHP: true },
  });
  const exposure = open.reduce((s, o) => s + o.totalAmount + (o.logisticsFeeAmountPHP ?? 0), 0);
  const limit = Number(buyer.creditLimit);
  if (exposure + newOrdersTotalPHP > limit) {
    return {
      ok: false,
      error: `This order would exceed your approved credit limit (₱${limit.toLocaleString()}; ₱${exposure.toLocaleString()} already outstanding).`,
    };
  }
  return { ok: true };
}

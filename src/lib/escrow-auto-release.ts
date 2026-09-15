import { prisma } from "@/lib/prisma";
import { paymentProvider } from "@/lib/payments";

// FEATURE 1 — Escrow Release Lockdown, trigger #2 (AUTO_TIMEOUT). Judgment
// call confirmed with the user: 24 hours (their prompt's own MVP suggestion
// was 60h; they chose the tighter 24h option offered alongside it).
//
// Query semantics: this app has no separate `disputeStatus` field — a
// dispute is modeled as Order.status = "DISPUTED" (flagDispute overwrites
// status away from "DELIVERED"). Filtering on status = "DELIVERED" here
// therefore already excludes every disputed order for free, with no extra
// join or field needed.
export const AUTO_RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutoReleaseResult = {
  orderId: string;
  released: boolean;
  error?: string;
};

/**
 * Finds every DELIVERED, still-HELD order past the dispute-free window and
 * releases it. Shared by the cron route (src/app/api/cron/auto-release-escrow)
 * and the admin "Run eligibility sweep now" button — both call the exact
 * same time-boxed, dispute-excluding query, so the manual button is not a
 * bypass of the window, just an on-demand invocation of it (useful given
 * Vercel Hobby's once-daily cron limit — see vercel.json).
 */
export async function sweepAutoReleaseEligibleOrders(): Promise<AutoReleaseResult[]> {
  const cutoff = new Date(Date.now() - AUTO_RELEASE_WINDOW_MS);

  const eligible = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      escrowStatus: "HELD",
      escrowEligibleAt: { lte: cutoff },
    },
    include: { route: true },
  });

  const results: AutoReleaseResult[] = [];

  for (const order of eligible) {
    try {
      // Same CAS idempotency pattern as confirmDelivery/approveDisputeRelease
      // — only one of the three trigger paths can ever win the race.
      const claimed = await prisma.order.updateMany({
        where: { id: order.id, status: "DELIVERED", escrowStatus: "HELD" },
        data: { status: "SETTLED", escrowStatus: "RELEASED" },
      });
      if (claimed.count === 0) {
        results.push({ orderId: order.id, released: false, error: "raced with another release path" });
        continue;
      }

      const netPayoutToSeller = order.netPayoutToSellerPHP ?? order.totalAmount;
      await paymentProvider.releaseFunds({
        orderId: order.id,
        amount: netPayoutToSeller,
        sellerId: order.sellerId,
      });
      if (order.haulerPayoutAmountPHP && order.route) {
        await paymentProvider.payHauler({
          orderId: order.id,
          amount: order.haulerPayoutAmountPHP,
          haulerId: order.route.haulerId,
        });
      }

      await prisma.escrowEvent.create({
        data: {
          orderId: order.id,
          fromStatus: "DELIVERED",
          toStatus: "SETTLED",
          triggeredBy: "SYSTEM",
          triggerType: "AUTO_TIMEOUT",
          metadata: { windowMs: AUTO_RELEASE_WINDOW_MS },
        },
      });
      await prisma.reputationEvent.create({
        data: { userId: order.sellerId, orderId: order.id, type: "ON_TIME", delta: 5 },
      });
      await prisma.user.update({
        where: { id: order.sellerId },
        data: { reputationScore: { increment: 5 } },
      });

      results.push({ orderId: order.id, released: true });
    } catch (err) {
      results.push({ orderId: order.id, released: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

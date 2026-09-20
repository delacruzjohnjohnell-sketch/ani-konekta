import { prisma } from "@/lib/prisma";
import { releaseFullSettlement } from "@/lib/settlement";

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
      // Shared settlement service (src/lib/settlement.ts): same compare-and-swap
      // idempotency guard, cooperative/seller payout routing, wallet accounting,
      // invoices and EscrowEvent audit row as every other release path.
      const released = await releaseFullSettlement(order.id, {
        triggerType: "AUTO_TIMEOUT",
        actorId: "SYSTEM",
        fromStatus: "DELIVERED",
        metadata: { windowMs: AUTO_RELEASE_WINDOW_MS },
      });
      if (!released) {
        results.push({ orderId: order.id, released: false, error: "raced with another release path" });
        continue;
      }
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

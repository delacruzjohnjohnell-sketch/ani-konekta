import { prisma } from "@/lib/prisma";

export type SellerBadge = "TOP_SELLER" | "RECOMMENDED" | "HIGHLY_RATED";

export type SellerStats = {
  completedOrders: number;
  disputedOrders: number;
  avgRating: number | null;
  badges: SellerBadge[];
};

/**
 * Data-driven seller badges — deliberately NOT built on the dead
 * ReputationEvent model (write-only, never displayed anywhere in the app
 * today). Uses only User.ratingSum/ratingCount (the real, live-incremented
 * 5-star system) plus a completed/disputed Order count aggregate.
 *
 * Thresholds (most-exclusive first; a seller can hold more than one):
 *   Top Seller    — >=20 completed orders, >=4.7 avg rating, <5% dispute rate
 *   Recommended   — >=10 completed orders, >=4.5 avg rating (spec's own example)
 *   Highly Rated  — >=5 ratings, >=4.8 avg rating (rewards quality on lower-volume sellers)
 */
export async function computeSellerBadges(
  sellerIds: string[]
): Promise<Map<string, SellerStats>> {
  if (sellerIds.length === 0) return new Map();

  const [completedGroups, disputedGroups, sellers] = await Promise.all([
    prisma.order.groupBy({
      by: ["sellerId"],
      where: { sellerId: { in: sellerIds }, status: "SETTLED" },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["sellerId"],
      where: { sellerId: { in: sellerIds }, status: "DISPUTED" },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, ratingSum: true, ratingCount: true },
    }),
  ]);

  const completedBySeller = new Map(completedGroups.map((g) => [g.sellerId, g._count._all]));
  const disputedBySeller = new Map(disputedGroups.map((g) => [g.sellerId, g._count._all]));
  const ratingBySeller = new Map(sellers.map((s) => [s.id, s]));

  const result = new Map<string, SellerStats>();
  for (const sellerId of sellerIds) {
    const completedOrders = completedBySeller.get(sellerId) ?? 0;
    const disputedOrders = disputedBySeller.get(sellerId) ?? 0;
    const rating = ratingBySeller.get(sellerId);
    const avgRating =
      rating && rating.ratingCount > 0 ? rating.ratingSum / rating.ratingCount : null;
    const disputeRate =
      completedOrders + disputedOrders > 0
        ? disputedOrders / (completedOrders + disputedOrders)
        : 0;

    const badges: SellerBadge[] = [];
    if (completedOrders >= 20 && (avgRating ?? 0) >= 4.7 && disputeRate < 0.05) {
      badges.push("TOP_SELLER");
    }
    if (completedOrders >= 10 && (avgRating ?? 0) >= 4.5) {
      badges.push("RECOMMENDED");
    }
    if ((rating?.ratingCount ?? 0) >= 5 && (avgRating ?? 0) >= 4.8) {
      badges.push("HIGHLY_RATED");
    }

    result.set(sellerId, { completedOrders, disputedOrders, avgRating, badges });
  }
  return result;
}

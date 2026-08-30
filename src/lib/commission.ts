/**
 * Configurable Commission & Fee Engine.
 *
 * All revenue rules live in the `CommissionConfig` table (see
 * prisma/schema.prisma), never as hardcoded constants. This module has two
 * pure, independently-testable functions plus a thin DB-backed wrapper that
 * calling code (src/app/actions.ts) uses at order-creation time.
 *
 * IMPORTANT: computeCommissionBreakdown() is called ONCE, at order creation.
 * Its output is written onto the Order row as a permanent snapshot
 * (appliedSellerCommissionRatePercent, sellerCommissionAmountPHP, etc.).
 * Never call this again for an existing order — always read the snapshot
 * fields instead, so changing CommissionConfig rates later can never alter
 * an order that was already placed. See prisma/backfill-commission-snapshots.ts
 * for the one exception: backfilling orders that predate this feature.
 */
// NOTE: prisma is imported lazily (inside the two DB-touching functions at
// the bottom of this file) rather than at module scope, so the pure
// functions above can be unit-tested (scripts/test-commission.ts) without
// needing a working database connection or a generated Prisma client.

// A structural subset of the CommissionConfig model — kept separate from
// the generated Prisma type so the pure functions below stay easy to unit
// test without a database.
export interface CommissionConfigLike {
  id: string;
  cropType: string | null;
  minOrderVolumeKg: number | null;
  sellerCommissionRatePercent: number;
  buyerLogisticsFeePercent: number;
  haulerPayoutPercentOfLogisticsFee: number;
  minFeeFloorPHP: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface CommissionBreakdown {
  // null when computed from FALLBACK_COMMISSION_CONFIG (no real DB row) —
  // never a foreign key that doesn't exist.
  commissionConfigId: string | null;
  appliedSellerCommissionRatePercent: number;
  appliedBuyerLogisticsFeePercent: number;
  appliedHaulerPayoutPercent: number;
  minFeeFloorPHP: number;
  producePriceAmountPHP: number;
  sellerCommissionAmountPHP: number;
  logisticsFeeAmountPHP: number;
  haulerPayoutAmountPHP: number;
  platformLogisticsMarginAmountPHP: number;
  platformNetRevenueAmountPHP: number;
  netPayoutToSellerPHP: number;
  buyerGrandTotalPHP: number;
  floorApplied: boolean;
}

/**
 * Most-specific-match-wins rule selection:
 *   1. crop + volume tier (matching minOrderVolumeKg, highest tier first)
 *   2. crop only
 *   3. volume tier only (highest tier first)
 *   4. default (crop = null, minOrderVolumeKg = null)
 *
 * `configs` should already be filtered to rows active `at` the given date
 * (effectiveFrom <= at < effectiveTo, or effectiveTo null) — see
 * getActiveCommissionConfigs() below. Pure function, no I/O, so it's easy
 * to unit test in isolation — see scripts/test-commission.ts.
 */
export function selectApplicableCommissionConfig(
  configs: CommissionConfigLike[],
  cropType: string,
  volumeKg: number
): CommissionConfigLike | null {
  function specificityScore(c: CommissionConfigLike): number {
    const cropMatches = c.cropType === cropType;
    const volumeMatches =
      c.minOrderVolumeKg !== null && volumeKg >= c.minOrderVolumeKg;
    if (cropMatches && volumeMatches) return 3;
    if (cropMatches && c.minOrderVolumeKg === null) return 2;
    if (c.cropType === null && volumeMatches) return 1;
    if (c.cropType === null && c.minOrderVolumeKg === null) return 0;
    return -1; // doesn't apply at all (e.g. a different crop's rule)
  }

  const candidates = configs
    .map((c) => ({ c, score: specificityScore(c) }))
    .filter((x) => x.score >= 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Within the same specificity tier, prefer the higher volume threshold
    // (the more specific tier), then the most recently created rule.
    const aVol = a.c.minOrderVolumeKg ?? -1;
    const bVol = b.c.minOrderVolumeKg ?? -1;
    if (bVol !== aVol) return bVol - aVol;
    return b.c.effectiveFrom.getTime() - a.c.effectiveFrom.getTime();
  });

  return candidates[0].c;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Computes the full peso breakdown for one order from its produce price and
 * the CommissionConfig rule that applies to it. Pure function — no I/O.
 *
 * Money flow:
 *   buyer pays  = producePrice + logisticsFee              (both escrowed)
 *   seller gets = producePrice - sellerCommissionAmount
 *   hauler gets = haulerPayoutPercentOfLogisticsFee % of logisticsFee
 *   platform keeps = sellerCommissionAmount + (logisticsFee - haulerPayout),
 *                    floored at minFeeFloorPHP (a reporting floor — it does
 *                    not claw back from the seller's or hauler's payout).
 */
export function computeCommissionBreakdown(
  config: CommissionConfigLike,
  producePriceAmountPHP: number
): CommissionBreakdown {
  const sellerCommissionAmountPHP = round2(
    (producePriceAmountPHP * config.sellerCommissionRatePercent) / 100
  );
  const logisticsFeeAmountPHP = round2(
    (producePriceAmountPHP * config.buyerLogisticsFeePercent) / 100
  );
  const haulerPayoutAmountPHP = round2(
    (logisticsFeeAmountPHP * config.haulerPayoutPercentOfLogisticsFee) / 100
  );
  const platformLogisticsMarginAmountPHP = round2(
    logisticsFeeAmountPHP - haulerPayoutAmountPHP
  );
  const rawPlatformNetRevenueAmountPHP = round2(
    sellerCommissionAmountPHP + platformLogisticsMarginAmountPHP
  );
  const floorApplied = rawPlatformNetRevenueAmountPHP < config.minFeeFloorPHP;
  const platformNetRevenueAmountPHP = floorApplied
    ? config.minFeeFloorPHP
    : rawPlatformNetRevenueAmountPHP;

  return {
    commissionConfigId: config.id,
    appliedSellerCommissionRatePercent: config.sellerCommissionRatePercent,
    appliedBuyerLogisticsFeePercent: config.buyerLogisticsFeePercent,
    appliedHaulerPayoutPercent: config.haulerPayoutPercentOfLogisticsFee,
    minFeeFloorPHP: config.minFeeFloorPHP,
    producePriceAmountPHP: round2(producePriceAmountPHP),
    sellerCommissionAmountPHP,
    logisticsFeeAmountPHP,
    haulerPayoutAmountPHP,
    platformLogisticsMarginAmountPHP,
    platformNetRevenueAmountPHP,
    netPayoutToSellerPHP: round2(producePriceAmountPHP - sellerCommissionAmountPHP),
    buyerGrandTotalPHP: round2(producePriceAmountPHP + logisticsFeeAmountPHP),
    floorApplied,
  };
}

/** Fetches every CommissionConfig row active at `at` (defaults to now). */
export async function getActiveCommissionConfigs(
  at: Date = new Date()
): Promise<CommissionConfigLike[]> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.commissionConfig.findMany({
    where: {
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
  });
}

// Hard-coded last-resort defaults — must match the "default rule" that
// prisma/seed.ts and prisma/ensure-default-commission-config.ts create in
// the database (cropType: null, minOrderVolumeKg: null). This is a safety
// net only: normal operation always uses the real DB-backed CommissionConfig
// row so admins can see and change the rate from /admin/commission. This
// fallback exists so that placing an order (and every downstream button
// that depends on it — "Order this", bulk-match) can never hard-fail just
// because the default row hasn't been seeded into a given database yet.
// It is NOT tied to any CommissionConfig row (commissionConfigId stays
// null on the order), exactly like orders that predate this feature.
const FALLBACK_COMMISSION_CONFIG: Omit<CommissionConfigLike, "id"> = {
  cropType: null,
  minOrderVolumeKg: null,
  sellerCommissionRatePercent: 6.0,
  buyerLogisticsFeePercent: 2.0,
  haulerPayoutPercentOfLogisticsFee: 75.0,
  minFeeFloorPHP: 20.0,
  effectiveFrom: new Date(0),
  effectiveTo: null,
};

/**
 * DB-backed convenience wrapper: fetches the active rules, picks the most
 * specific one, and computes the breakdown — what src/app/actions.ts calls
 * at order-creation time. Falls back to FALLBACK_COMMISSION_CONFIG (with a
 * null commissionConfigId on the resulting order) if no CommissionConfig
 * row applies yet — see the comment above. This should be rare in practice
 * (prisma/ensure-default-commission-config.ts keeps a real default row
 * seeded on every production deploy) but placing an order must never 500
 * just because that row is temporarily missing.
 */
export async function resolveCommissionForOrder(
  cropType: string,
  volumeKg: number,
  producePriceAmountPHP: number,
  at: Date = new Date()
): Promise<CommissionBreakdown> {
  const configs = await getActiveCommissionConfigs(at);
  const config = selectApplicableCommissionConfig(configs, cropType, volumeKg);
  if (!config) {
    const breakdown = computeCommissionBreakdown(
      { ...FALLBACK_COMMISSION_CONFIG, id: "" },
      producePriceAmountPHP
    );
    return { ...breakdown, commissionConfigId: null };
  }
  return computeCommissionBreakdown(config, producePriceAmountPHP);
}

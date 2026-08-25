/**
 * Backfills Order.appliedSellerCommissionRatePercent /
 * sellerCommissionAmountPHP / etc. for orders that were created before the
 * Configurable Commission & Fee Engine shipped (so those Order rows have
 * NULL in all the snapshot fields).
 *
 * For each such order, resolves the CommissionConfig rule that is CURRENTLY
 * active (via each order's own listing cropType + volumeKg + totalAmount)
 * and writes it onto the order as a one-time backfill. This is the one
 * sanctioned exception to "never recompute a snapshot" — there is no
 * historical rate to recover for these orders, so the current default is
 * the best available approximation. Every backfilled order is logged
 * clearly (id, resolved rule id, computed amounts) so it's easy to tell a
 * true point-in-time snapshot from a backfilled approximation later
 * (backfilled orders can also be identified going forward by comparing
 * commissionConfig.createdAt against order.createdAt).
 *
 * Run with:
 *   npx tsx prisma/backfill-commission-snapshots.ts
 *
 * Safe to re-run: orders that already have snapshot fields are skipped.
 */
import { PrismaClient } from "@prisma/client";
import { selectApplicableCommissionConfig, computeCommissionBreakdown } from "../src/lib/commission";

const prisma = new PrismaClient();

async function main() {
  const ordersMissingSnapshot = await prisma.order.findMany({
    where: { platformNetRevenueAmountPHP: null },
    include: { listing: true },
  });

  if (ordersMissingSnapshot.length === 0) {
    console.log("No orders are missing commission snapshots. Nothing to do.");
    return;
  }

  const activeConfigs = await prisma.commissionConfig.findMany({
    where: {
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });

  if (activeConfigs.length === 0) {
    console.error(
      "No active CommissionConfig rules found — run `npm run db:seed` (or create one from /admin/commission) before backfilling."
    );
    process.exitCode = 1;
    return;
  }

  const backfilled: string[] = [];
  const skipped: string[] = [];

  for (const order of ordersMissingSnapshot) {
    const config = selectApplicableCommissionConfig(
      activeConfigs,
      order.listing.cropType,
      order.volumeKg
    );
    if (!config) {
      console.warn(`  SKIP order ${order.id}: no CommissionConfig rule matches its crop/volume.`);
      skipped.push(order.id);
      continue;
    }

    const breakdown = computeCommissionBreakdown(config, order.totalAmount);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        commissionConfigId: breakdown.commissionConfigId,
        appliedSellerCommissionRatePercent: breakdown.appliedSellerCommissionRatePercent,
        appliedBuyerLogisticsFeePercent: breakdown.appliedBuyerLogisticsFeePercent,
        appliedHaulerPayoutPercent: breakdown.appliedHaulerPayoutPercent,
        sellerCommissionAmountPHP: breakdown.sellerCommissionAmountPHP,
        logisticsFeeAmountPHP: breakdown.logisticsFeeAmountPHP,
        haulerPayoutAmountPHP: breakdown.haulerPayoutAmountPHP,
        platformNetRevenueAmountPHP: breakdown.platformNetRevenueAmountPHP,
        netPayoutToSellerPHP: breakdown.netPayoutToSellerPHP,
      },
    });

    console.log(
      `  BACKFILLED order ${order.id} (created ${order.createdAt.toISOString()}) using rule ${config.id} ` +
        `[crop=${config.cropType ?? "any"}, minVol=${config.minOrderVolumeKg ?? "any"}] -> ` +
        `commission ${breakdown.sellerCommissionAmountPHP} PHP, seller nets ${breakdown.netPayoutToSellerPHP} PHP`
    );
    backfilled.push(order.id);
  }

  console.log("\n--- Backfill summary ---");
  console.log(`Orders backfilled (approximated from current rules): ${backfilled.length}`);
  if (backfilled.length > 0) console.log(`  IDs: ${backfilled.join(", ")}`);
  console.log(`Orders skipped (no applicable rule found): ${skipped.length}`);
  if (skipped.length > 0) console.log(`  IDs: ${skipped.join(", ")}`);
  const alreadyHadSnapshot =
    (await prisma.order.count()) - ordersMissingSnapshot.length;
  console.log(`Orders that already had a live-computed snapshot (untouched): ${alreadyHadSnapshot}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

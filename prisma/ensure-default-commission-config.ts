/**
 * Idempotent, production-safe seeding of ONLY the default (global)
 * CommissionConfig rule — cropType: null, minOrderVolumeKg: null.
 *
 * This is intentionally separate from prisma/seed.ts, which also creates
 * demo users, listings, and orders and is NOT safe to re-run against
 * production (it would create duplicate demo data on every deploy). This
 * script only ever inserts the one row it checks for, and only if it's
 * missing — running it any number of times has no further effect.
 *
 * Wired into the production build step (see package.json's "build" script,
 * next to the existing `prisma db push`) so a fresh or already-running
 * production database always has a rate an order can resolve against from
 * /admin/commission, without ever needing an admin to remember to add one.
 *
 * src/lib/commission.ts also has its own hardcoded fallback
 * (FALLBACK_COMMISSION_CONFIG) so placing an order never 500s even if this
 * script hasn't run yet or its insert is momentarily still in flight — this
 * script's job is to make sure a *real, admin-editable* row exists too.
 *
 * Run with:
 *   npx tsx prisma/ensure-default-commission-config.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.commissionConfig.findFirst({
    where: { cropType: null, minOrderVolumeKg: null, effectiveTo: null },
  });

  if (existing) {
    console.log(`Default CommissionConfig rule already exists (${existing.id}). Nothing to do.`);
    return;
  }

  const created = await prisma.commissionConfig.create({
    data: {
      cropType: null,
      minOrderVolumeKg: null,
      sellerCommissionRatePercent: 6.0,
      buyerLogisticsFeePercent: 2.0,
      haulerPayoutPercentOfLogisticsFee: 75.0,
      minFeeFloorPHP: 20.0,
    },
  });
  console.log(`Created default CommissionConfig rule (${created.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

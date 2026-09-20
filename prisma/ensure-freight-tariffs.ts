/**
 * Seeds the default commodity freight tariffs ONLY where a (routeZone,
 * cropCategory) row is missing — never overwrites an Admin's edits. Runs on
 * every production build (see package.json "build") alongside
 * ensure-default-commission-config.ts, and is safe to run any time:
 *   npx tsx prisma/ensure-freight-tariffs.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_TARIFFS } from "../src/lib/freight";

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  for (const t of DEFAULT_TARIFFS) {
    const existing = await prisma.commodityFreightTariff.findUnique({
      where: { routeZone_cropCategory: { routeZone: t.routeZone, cropCategory: t.cropCategory } },
    });
    if (existing) continue;
    await prisma.commodityFreightTariff.create({
      data: {
        routeZone: t.routeZone,
        cropCategory: t.cropCategory,
        ratePerKg: t.ratePerKg as string,
        baseFloorFee: t.baseFloorFee as string,
        tollPassThrough: t.tollPassThrough as string,
        haulerSharePct: t.haulerSharePct as string,
        platformSharePct: t.platformSharePct as string,
      },
    });
    created++;
  }
  console.log(`Freight tariffs: ${created} default row(s) created, ${DEFAULT_TARIFFS.length - created} already present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

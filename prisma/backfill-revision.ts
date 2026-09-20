/**
 * One-time (idempotent) backfill for the dual-track / commodity revision:
 *  - Listing.cropCategory guessed from cropType (sellers can edit it)
 *  - Listing.postedByUserId for pre-existing individual listings
 *  - Order.cropCategory/routeZone for pre-existing orders (freight
 *    snapshots are NOT fabricated for historical orders — they keep the
 *    percentage-based fees they were created with)
 *  - User.buyerType = RETAIL_SPOT for existing buyers with none set
 * Run: npx tsx prisma/backfill-revision.ts
 */
import { PrismaClient } from "@prisma/client";
import { guessCropCategory } from "../src/lib/cold-chain";
import { routeZoneForMunicipality } from "../src/lib/freight";

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({ select: { id: true, cropType: true, sellerId: true } });
  for (const l of listings) {
    await prisma.listing.update({
      where: { id: l.id },
      data: { cropCategory: guessCropCategory(l.cropType), postedByUserId: l.sellerId ?? undefined },
    });
  }

  const orders = await prisma.order.findMany({
    include: { listing: true, buyer: true },
    where: { cropCategory: null },
  });
  for (const o of orders) {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        cropCategory: o.listing.cropCategory,
        routeZone: routeZoneForMunicipality(o.buyer.municipality),
      },
    });
  }

  const buyers = await prisma.user.updateMany({
    where: { role: "BUYER", buyerType: null },
    data: { buyerType: "RETAIL_SPOT" },
  });

  console.log(
    `Backfilled ${listings.length} listing(s), ${orders.length} order(s), ${buyers.count} buyer profile(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

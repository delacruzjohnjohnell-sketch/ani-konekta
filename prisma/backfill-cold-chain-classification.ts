// FEATURE 2 — Cold-Chain Classification: one-time backfill for listings
// created before this feature shipped (they all default to
// requiresColdChain=false from the schema's @default(false), which is
// wrong for anything perishable). Run once after deploying the schema
// change:
//
//   npx tsx prisma/backfill-cold-chain-classification.ts
//
// Safe to re-run — it always recomputes from the current heuristic rather
// than skipping already-processed rows, so re-running after improving the
// classifier in src/lib/cold-chain.ts picks up the improvement.
import { PrismaClient } from "@prisma/client";
import { guessRequiresColdChain } from "../src/lib/cold-chain";

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({
    select: { id: true, cropType: true },
  });

  let coldChain = 0;
  let ambient = 0;
  let needsReview = 0;

  for (const listing of listings) {
    const guess = guessRequiresColdChain(listing.cropType);
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        requiresColdChain: guess.requiresColdChain,
        coldChainNeedsReview: !guess.confident,
      },
    });
    if (!guess.confident) needsReview++;
    else if (guess.requiresColdChain) coldChain++;
    else ambient++;
  }

  console.log(`Classified ${listings.length} listing(s):`);
  console.log(`  ${coldChain} confidently cold-chain`);
  console.log(`  ${ambient} confidently ambient`);
  console.log(`  ${needsReview} unconfident — defaulted to ambient, flagged coldChainNeedsReview=true`);
  if (needsReview > 0) {
    const flagged = await prisma.listing.findMany({
      where: { coldChainNeedsReview: true },
      select: { id: true, cropType: true, sellerId: true },
    });
    console.log("\nFlagged for manual review:");
    for (const l of flagged) {
      console.log(`  ${l.id} — "${l.cropType}" (seller ${l.sellerId})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

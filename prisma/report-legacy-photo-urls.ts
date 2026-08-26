/**
 * Read-only report: flags any Listing.photoBlobKey / ProofOfDelivery.photoBlobKey
 * values that look like a raw external URL entered before the direct-file-
 * attachment feature existed (i.e. anything not produced by our own upload
 * flow in src/lib/blob-storage.ts, which always returns a Vercel Blob URL
 * under a *.public.blob.vercel-storage.com / *.blob.vercel-storage.com host).
 *
 * Does NOT modify any data. Flagged records need a seller/hauler to
 * re-upload the photo as a real file attachment through the app before
 * they'll render correctly everywhere photos are shown.
 *
 * Run with:
 *   npx tsx prisma/report-legacy-photo-urls.ts
 */
import { PrismaClient } from "@prisma/client";
import { looksLikeLegacyPhotoValue as looksLikeLegacyUrl } from "../src/lib/legacy-photos";

const prisma = new PrismaClient();

async function main() {
  const [listings, proofs] = await Promise.all([
    prisma.listing.findMany({
      where: { photoBlobKey: { not: null } },
      select: { id: true, sellerId: true, cropType: true, photoBlobKey: true },
    }),
    prisma.proofOfDelivery.findMany({
      where: { photoBlobKey: { not: null } },
      select: { id: true, orderId: true, photoBlobKey: true },
    }),
  ]);

  const flaggedListings = listings.filter((l) => looksLikeLegacyUrl(l.photoBlobKey!));
  const flaggedProofs = proofs.filter((p) => looksLikeLegacyUrl(p.photoBlobKey!));

  console.log("--- Legacy raw-URL photo report ---\n");

  console.log(`Listings flagged for manual re-upload: ${flaggedListings.length}`);
  for (const l of flaggedListings) {
    console.log(`  Listing ${l.id} (seller ${l.sellerId}, ${l.cropType}): ${l.photoBlobKey}`);
  }

  console.log(`\nProofOfDelivery records flagged for manual re-upload: ${flaggedProofs.length}`);
  for (const p of flaggedProofs) {
    console.log(`  ProofOfDelivery ${p.id} (order ${p.orderId}): ${p.photoBlobKey}`);
  }

  console.log(
    `\nTotal flagged: ${flaggedListings.length + flaggedProofs.length}. ` +
      "These records are untouched — ask the affected seller/hauler to re-upload " +
      "a real photo through the app (the old URL will keep rendering in the " +
      "meantime, since it's still a valid <img> src, but it bypassed the upload " +
      "validation and storage guarantees this feature adds)."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

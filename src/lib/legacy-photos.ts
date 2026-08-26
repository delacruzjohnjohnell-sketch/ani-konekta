/**
 * Shared detection logic for legacy (pre-Feature-2) photo values — used by
 * both the standalone report script (prisma/report-legacy-photo-urls.ts,
 * run against a local DB) and the /admin page's inline report (which runs
 * against whatever database the deployed app is actually using — the only
 * way to check production, since DATABASE_URL there is a Vercel-managed
 * sensitive env var that can't be pulled to a local terminal).
 */
export function looksLikeLegacyPhotoValue(value: string): boolean {
  // Anything from our own Blob store is fine, however it got there.
  // Flag everything else — not just http(s) URLs, but also local file
  // paths (file:///Users/...), blank/malformed values, or anything else
  // a free-text field could have accepted before this feature existed.
  return !/\.blob\.vercel-storage\.com/i.test(value);
}

export async function findLegacyPhotoRecords() {
  const { prisma } = await import("@/lib/prisma");
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

  return {
    listings: listings.filter((l) => looksLikeLegacyPhotoValue(l.photoBlobKey!)),
    proofs: proofs.filter((p) => looksLikeLegacyPhotoValue(p.photoBlobKey!)),
  };
}

/**
 * Access gate for sensitive ID/KYC documents. Vercel Blob has no real
 * private/ACL mode (see src/lib/blob-storage.ts) — blob URLs are
 * unguessable-random but technically public if leaked. The mitigation is
 * that NO render path (admin review page, a user's own dashboard) ever
 * embeds a raw blob URL in HTML; every link instead points at
 * src/app/api/secure-doc/[docType]/[docId]/route.ts, which calls this
 * function before ever redirecting to the real URL.
 */
export class DocumentAccessDeniedError extends Error {}

export function assertDocumentAccess(
  ownerId: string,
  requesterId: string,
  requesterRole: string
) {
  if (requesterId === ownerId || requesterRole === "ADMIN") return;
  throw new DocumentAccessDeniedError("You don't have permission to view this document.");
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { assertDocumentAccess, DocumentAccessDeniedError } from "@/lib/document-access";

/**
 * The only place a raw Vercel Blob URL for a sensitive ID/KYC document is
 * ever produced. Every render path (admin review, a user's own dashboard)
 * links here — never directly to the blob — so access is checked on every
 * view, not just at upload time. See src/lib/document-access.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docType: string; docId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { docType, docId } = await params;
  const index = Number(request.nextUrl.searchParams.get("index") ?? "0") || 0;

  let ownerId: string | undefined;
  let blobKeys: string[] = [];

  if (docType === "id-verification") {
    const row = await prisma.idVerificationSubmission.findUnique({ where: { id: docId } });
    if (row) {
      ownerId = row.userId;
      blobKeys = row.documentBlobKeys;
    }
  } else if (docType === "kyc") {
    const row = await prisma.kycVisit.findUnique({ where: { id: docId } });
    if (row) {
      ownerId = row.userId;
      blobKeys = row.evidenceBlobKeys;
    }
  }

  if (!ownerId) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    assertDocumentAccess(ownerId, session.user.id, session.user.role);
  } catch (err) {
    if (err instanceof DocumentAccessDeniedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const url = resolvePhotoUrl(blobKeys[index] ?? null);
  if (!url) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return NextResponse.redirect(url);
}

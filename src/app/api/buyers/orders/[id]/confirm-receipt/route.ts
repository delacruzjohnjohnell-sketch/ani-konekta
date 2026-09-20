import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";
import { applyReceipt, SettlementError } from "@/lib/settlement";

const MAX_PHOTOS = 6;

/**
 * Dockside receiving. The buyer states how many kg they accept and how many
 * they dispute (accepted + disputed must equal the locked origin baseline).
 * Only the undisputed fraction of merchandise is released; only the disputed
 * fraction is held for Admin mediation. The 2-hour dispute window is measured
 * from the SERVER-recorded dock arrival, never the buyer's device clock.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.user.role !== "BUYER") return NextResponse.json({ error: "Buyers only." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const acceptedWeightKg = Number(form.get("acceptedWeightKg"));
  const disputedWeightKg = Number(form.get("disputedWeightKg") ?? 0);
  const reason = String(form.get("reason") ?? "").trim() || null;

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return NextResponse.json({ error: `At most ${MAX_PHOTOS} photos.` }, { status: 422 });

  const dockPhotoUrls: string[] = [];
  try {
    for (const f of files) dockPhotoUrls.push(await uploadPhoto(f, "dock-receipt"));
  } catch (e) {
    const msg = e instanceof PhotoValidationError ? e.message : `Photo upload failed: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  try {
    const result = await applyReceipt(id, session.user.id, { acceptedWeightKg, disputedWeightKg, reason, dockPhotoUrls });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SettlementError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[confirm-receipt]", e);
    return NextResponse.json({ error: "Could not record the receipt." }, { status: 500 });
  }
}

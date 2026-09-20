import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";

const MAX_PHOTOS = 6;

/**
 * Pre-dispatch Gate Pass. The assigned hauler records the ACTUAL weight and
 * condition at the origin, with photo evidence. Fields adapt to the order's
 * crop category (grain: moisture; produce: package count + condition).
 * It can be re-submitted until the seller/cooperative signs off — sign-off
 * locks it (see src/app/gate-pass/actions.ts); afterwards only an audited
 * Admin correction can change it. serverTimestamp is server-assigned.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.user.role !== "HAULER") return NextResponse.json({ error: "Haulers only." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const orderId = String(form.get("orderId") ?? "");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { route: true, listing: true, inspection: true },
  });
  if (!order || !order.route) return NextResponse.json({ error: "Order not found on a route." }, { status: 404 });
  if (order.route.haulerId !== session.user.id) return NextResponse.json({ error: "Not your order." }, { status: 403 });
  if (order.status !== "POOLED") {
    return NextResponse.json({ error: "Gate Pass can only be recorded while the order is awaiting pickup." }, { status: 409 });
  }
  if (order.inspection?.lockedAt) {
    return NextResponse.json({ error: "This Gate Pass is signed off and locked. Ask an Admin for an audited correction." }, { status: 409 });
  }

  const category = order.cropCategory ?? order.listing.cropCategory;
  const weight = Number(form.get("actualPickupWeightKg"));
  if (!(weight > 0)) return NextResponse.json({ error: "Enter the actual pickup weight (kg)." }, { status: 422 });

  let moistureReadingPercent: number | null = null;
  let packageCount: number | null = null;
  let qualityCondition: string | null = null;
  if (category === "GRAIN") {
    const rawMoisture = form.get("moistureReadingPercent");
    moistureReadingPercent = Number(rawMoisture);
    if (rawMoisture === null || rawMoisture === "" || !(moistureReadingPercent >= 0 && moistureReadingPercent <= 100)) {
      return NextResponse.json({ error: "Grain inspection needs a moisture reading (0–100%)." }, { status: 422 });
    }
  } else {
    packageCount = Number(form.get("packageCount"));
    qualityCondition = String(form.get("qualityCondition") ?? "").trim();
    if (!Number.isInteger(packageCount) || packageCount <= 0) {
      return NextResponse.json({ error: "Produce inspection needs the package count." }, { status: 422 });
    }
    if (!qualityCondition) return NextResponse.json({ error: "Describe the produce condition." }, { status: 422 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "At least one evidence photo is required." }, { status: 422 });
  if (files.length > MAX_PHOTOS) return NextResponse.json({ error: `At most ${MAX_PHOTOS} photos.` }, { status: 422 });

  const urls: string[] = [];
  try {
    for (const f of files) urls.push(await uploadPhoto(f, "gate-pass"));
  } catch (e) {
    const msg = e instanceof PhotoValidationError ? e.message : `Photo upload failed: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const data = {
    haulerId: session.user.id,
    actualPickupWeightKg: weight,
    moistureReadingPercent,
    packageCount,
    qualityCondition,
    originPhotoUrls: urls,
    commodityData: { cropCategory: category, declaredVolumeKg: order.volumeKg },
    serverTimestamp: new Date(),
  };

  // Re-submission is only allowed while unsigned: the compare-and-swap on
  // sellerSignedAt=null means a sign-off that lands mid-request wins.
  const saved = await prisma.$transaction(async (tx) => {
    if (order.inspection) {
      const c = await tx.preDispatchInspection.updateMany({
        where: { orderId, sellerSignedAt: null, lockedAt: null },
        data,
      });
      if (c.count === 0) return null;
    } else {
      await tx.preDispatchInspection.create({ data: { orderId, ...data } });
    }
    await audit(
      session.user.id,
      order.inspection ? "INSPECTION_RESUBMITTED" : "INSPECTION_RECORDED",
      "PreDispatchInspection",
      orderId,
      { orderId, actualPickupWeightKg: weight, declaredVolumeKg: order.volumeKg, photos: urls.length, category },
      tx
    );
    return true;
  });
  if (!saved) return NextResponse.json({ error: "The seller signed off first; this Gate Pass is now locked." }, { status: 409 });

  return NextResponse.json({ ok: true, awaitingSellerSignoff: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listingOwnerKey } from "@/lib/listing-service";
import { FreightTariffMissingError, quoteFreight, routeZoneForMunicipality } from "@/lib/freight";

/**
 * Read-only freight preview for the cart. Uses the LIVE tariff row for the
 * buyer's route zone × each crop category (same call checkout makes), grouped
 * the way checkout groups orders: one per owner per crop category. Nothing is
 * saved; the authoritative snapshot is taken when the order is created.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "BUYER") {
    return NextResponse.json({ error: "Buyers only." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const lines: { listingId: string; qtyKg: number }[] = Array.isArray(body?.lines) ? body.lines : [];
  const valid = lines.filter((l) => typeof l.listingId === "string" && Number(l.qtyKg) > 0);
  if (valid.length === 0) return NextResponse.json({ freightTotal: 0, groups: [] });

  const [buyer, listings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { municipality: true } }),
    prisma.listing.findMany({
      where: { id: { in: valid.map((l) => l.listingId) } },
      select: { id: true, sellerId: true, cooperativeId: true, cropCategory: true },
    }),
  ]);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const zone = routeZoneForMunicipality(buyer.municipality);

  const groups = new Map<string, { cropCategory: "GRAIN" | "VEGETABLE" | "FRUIT"; kg: number }>();
  for (const l of valid) {
    const listing = byId.get(l.listingId);
    if (!listing?.cropCategory) continue;
    const key = `${listingOwnerKey(listing)}|${listing.cropCategory}`;
    const g = groups.get(key) ?? { cropCategory: listing.cropCategory, kg: 0 };
    g.kg += Number(l.qtyKg);
    groups.set(key, g);
  }

  try {
    const out = [];
    let freightTotal = 0;
    for (const g of groups.values()) {
      const q = await quoteFreight(zone, g.cropCategory, g.kg);
      freightTotal += q.grossFreight;
      out.push({ cropCategory: g.cropCategory, kg: g.kg, grossFreight: q.grossFreight, tollApplied: q.tollApplied, floorApplied: q.floorApplied });
    }
    return NextResponse.json({ routeZone: zone, freightTotal: Math.round(freightTotal * 100) / 100, groups: out });
  } catch (e) {
    if (e instanceof FreightTariffMissingError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[freight/estimate]", e);
    return NextResponse.json({ error: "Could not estimate freight." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// FEATURE 3 — Live Hauler Location Tracking + ETA.
//
// POST: the assigned hauler pings their current position. Only accepted
// while the route has an active leg (PICKED_UP/IN_TRANSIT) — matches "Stop
// requiring/accepting pings once the route reaches DELIVERED".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const route = await prisma.pooledRoute.findUnique({ where: { id } });
  if (!route) {
    return NextResponse.json({ error: "Route not found." }, { status: 404 });
  }
  // Requester-identity check — same pattern as every other role-scoped
  // action in this app (see requireUser in src/app/actions.ts).
  if (route.haulerId !== session.user.id) {
    return NextResponse.json({ error: "Not your route." }, { status: 403 });
  }
  if (route.status !== "PICKED_UP" && route.status !== "IN_TRANSIT") {
    return NextResponse.json({ error: "Route has no active leg." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required." }, { status: 400 });
  }

  await prisma.pooledRoute.update({
    where: { id },
    data: { currentLat: lat, currentLng: lng, lastPingAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// GET: the buyer/seller/admin on an order carried by this route reads the
// hauler's live position + a heuristic ETA. Privacy guardrail: only someone
// who is actually the buyer or seller on one of this route's orders (or an
// ADMIN) may read it — not the general public, not other buyers/sellers.
// Stops exposing location once every order on the route is SETTLED (spec:
// "Stop exposing location data once the order reaches SETTLED").
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const route = await prisma.pooledRoute.findUnique({
    where: { id },
    include: { orders: true },
  });
  if (!route) {
    return NextResponse.json({ error: "Route not found." }, { status: 404 });
  }

  const isParticipant =
    session.user.role === "ADMIN" ||
    session.user.id === route.haulerId ||
    route.orders.some(
      (o) => o.buyerId === session.user.id || o.sellerId === session.user.id
    );
  if (!isParticipant) {
    return NextResponse.json({ error: "Not authorized for this route." }, { status: 403 });
  }

  const allSettled = route.orders.length > 0 && route.orders.every((o) => o.status === "SETTLED");
  if (allSettled) {
    return NextResponse.json({ available: false, reason: "settled" });
  }

  if (route.currentLat == null || route.currentLng == null || !route.lastPingAt) {
    return NextResponse.json({ available: false, reason: "no_pings_yet" });
  }

  return NextResponse.json({
    available: true,
    lat: route.currentLat,
    lng: route.currentLng,
    lastPingAt: route.lastPingAt,
  });
}

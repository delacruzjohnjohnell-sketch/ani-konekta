"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { suggestFairPrice } from "@/lib/pricing";
import { paymentProvider } from "@/lib/payments";
import { notifications } from "@/lib/notifications";
import { poolOrdersByMunicipality } from "@/lib/routing";

async function requireUser(role?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  if (role && session.user.role !== role) throw new Error("Not authorized.");
  return session.user;
}

// ---------------------------------------------------------------------------
// SELLER: create a listing (with AI-suggested price shown alongside it)
// ---------------------------------------------------------------------------
export async function createListing(formData: FormData) {
  const user = await requireUser("SELLER");

  const cropType = String(formData.get("cropType") ?? "").trim();
  const variety = String(formData.get("variety") ?? "").trim() || null;
  const volumeKg = Number(formData.get("volumeKg"));
  const harvestDate = new Date(String(formData.get("harvestDate")));
  const askingPricePerKg = Number(formData.get("askingPricePerKg"));
  const qualityTag = String(formData.get("qualityTag") ?? "STANDARD");
  const municipality = String(formData.get("municipality") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;

  if (!cropType || !municipality || !volumeKg || !askingPricePerKg) {
    throw new Error("Missing required listing fields.");
  }

  const aiSuggestedPricePerKg = await suggestFairPrice(
    cropType,
    municipality,
    qualityTag
  );

  await prisma.listing.create({
    data: {
      sellerId: user.id,
      cropType,
      variety,
      volumeKg,
      harvestDate,
      askingPricePerKg,
      aiSuggestedPricePerKg,
      qualityTag: qualityTag as never,
      municipality,
      photoUrl,
    },
  });

  revalidatePath("/seller/dashboard");
}

// ---------------------------------------------------------------------------
// BUYER: place a direct order against a single listing
// ---------------------------------------------------------------------------
export async function placeOrder(formData: FormData) {
  const user = await requireUser("BUYER");
  const listingId = String(formData.get("listingId"));

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });
  if (listing.status !== "ACTIVE") throw new Error("Listing is no longer available.");

  const totalAmount = listing.volumeKg * listing.askingPricePerKg;

  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: user.id,
      sellerId: listing.sellerId,
      volumeKg: listing.volumeKg,
      agreedPricePerKg: listing.askingPricePerKg,
      totalAmount,
      status: "ORDERED_ESCROWED",
      escrowStatus: "HELD",
    },
  });

  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: "CLOSED" },
  });

  await paymentProvider.holdFunds({
    orderId: order.id,
    amount: totalAmount,
    buyerId: user.id,
  });

  const seller = await prisma.user.findUnique({ where: { id: listing.sellerId } });
  if (seller) {
    await notifications.notifyOrderStatusChange({
      phone: seller.phone,
      orderId: order.id,
      status: "ORDERED_ESCROWED (buyer payment held in escrow)",
    });
  }

  revalidatePath("/buyer/dashboard");
  redirect(`/buyer/order/${order.id}`);
}

// ---------------------------------------------------------------------------
// BUYER: bulk match — aggregate several smallholder listings (same crop) into
// one wholesale-size order.
// ---------------------------------------------------------------------------
export async function bulkMatchOrder(formData: FormData) {
  const user = await requireUser("BUYER");
  const listingIds = formData.getAll("listingIds").map(String);
  if (listingIds.length < 2) {
    throw new Error("Select at least two listings to bulk-match.");
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: "ACTIVE" },
  });
  if (listings.length !== listingIds.length) {
    throw new Error("One or more selected listings are no longer available.");
  }
  const cropType = listings[0].cropType;
  if (!listings.every((l) => l.cropType === cropType)) {
    throw new Error("Bulk match requires listings of the same crop type.");
  }
  // All bulk-matched listings must share one seller-of-record for this MVP's
  // single-seller Order model; in practice this groups one cooperative's
  // members. Simplification noted for Phase 2 (multi-seller split orders).
  const primarySellerId = listings[0].sellerId;

  const totalVolumeKg = listings.reduce((s, l) => s + l.volumeKg, 0);
  const totalAmount = listings.reduce(
    (s, l) => s + l.volumeKg * l.askingPricePerKg,
    0
  );
  const agreedPricePerKg = totalAmount / totalVolumeKg;

  const order = await prisma.order.create({
    data: {
      listingId: listings[0].id,
      buyerId: user.id,
      sellerId: primarySellerId,
      volumeKg: totalVolumeKg,
      agreedPricePerKg,
      totalAmount,
      status: "ORDERED_ESCROWED",
      escrowStatus: "HELD",
      isBulkMatch: true,
    },
  });

  await prisma.listing.updateMany({
    where: { id: { in: listingIds } },
    data: { status: "CLOSED" },
  });

  await paymentProvider.holdFunds({
    orderId: order.id,
    amount: totalAmount,
    buyerId: user.id,
  });

  revalidatePath("/buyer/dashboard");
  redirect(`/buyer/order/${order.id}`);
}

// ---------------------------------------------------------------------------
// HAULER: accept an escrowed order and pool it into a route (municipality-
// level grouping heuristic — see src/lib/routing.ts)
// ---------------------------------------------------------------------------
export async function acceptAndPoolOrder(formData: FormData) {
  const user = await requireUser("HAULER");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { listing: true },
  });
  if (order.status !== "ORDERED_ESCROWED") {
    throw new Error("Order is not ready for pooling.");
  }

  const [pooled] = poolOrdersByMunicipality([
    { id: order.id, municipality: order.listing.municipality },
  ]);

  const route = await prisma.pooledRoute.create({
    data: {
      haulerId: user.id,
      pickupPoints: [order.listing.municipality],
      dropoffPoint: "Buyer facility (TBD)",
      status: "ASSIGNED",
      etaMinutes: pooled.estimatedEtaMinutes,
      distanceKm: pooled.estimatedDistanceKm,
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "POOLED", routeId: route.id },
  });

  revalidatePath("/hauler/dashboard");
}

// ---------------------------------------------------------------------------
// HAULER: advance a route's status (ASSIGNED -> PICKED_UP -> IN_TRANSIT ->
// DELIVERED). Delivering a route cascades to its orders and writes a
// ProofOfDelivery record (with QR trace code) per order.
// ---------------------------------------------------------------------------
export async function advanceRouteStatus(formData: FormData) {
  const user = await requireUser("HAULER");
  const routeId = String(formData.get("routeId"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const route = await prisma.pooledRoute.findUniqueOrThrow({
    where: { id: routeId },
    include: { orders: true },
  });
  if (route.haulerId !== user.id) throw new Error("Not your route.");

  const next: Record<string, string> = {
    ASSIGNED: "PICKED_UP",
    PICKED_UP: "IN_TRANSIT",
    IN_TRANSIT: "DELIVERED",
  };
  const nextStatus = next[route.status];
  if (!nextStatus) throw new Error("Route already delivered.");

  await prisma.pooledRoute.update({
    where: { id: route.id },
    data: { status: nextStatus as never },
  });

  const orderStatus = nextStatus === "DELIVERED" ? "DELIVERED" : "IN_TRANSIT";
  await prisma.order.updateMany({
    where: { id: { in: route.orders.map((o) => o.id) } },
    data: { status: orderStatus as never },
  });

  if (nextStatus === "DELIVERED") {
    for (const order of route.orders) {
      await prisma.proofOfDelivery.create({
        data: { orderId: order.id, confirmedByBuyer: false, notes },
      });
      const buyer = await prisma.user.findUnique({ where: { id: order.buyerId } });
      if (buyer) {
        await notifications.notifyOrderStatusChange({
          phone: buyer.phone,
          orderId: order.id,
          status: "DELIVERED — please confirm receipt",
        });
      }
    }
  }

  revalidatePath("/hauler/dashboard");
}

// ---------------------------------------------------------------------------
// BUYER: confirm delivery -> releases escrow to seller, settles the order,
// and applies reputation events.
// ---------------------------------------------------------------------------
export async function confirmDelivery(formData: FormData) {
  const user = await requireUser("BUYER");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.buyerId !== user.id) throw new Error("Not your order.");
  if (order.status !== "DELIVERED") throw new Error("Order is not yet delivered.");

  await paymentProvider.releaseFunds({
    orderId: order.id,
    amount: order.totalAmount,
    sellerId: order.sellerId,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "SETTLED", escrowStatus: "RELEASED" },
  });

  await prisma.proofOfDelivery.update({
    where: { orderId: order.id },
    data: { confirmedByBuyer: true },
  });

  await prisma.reputationEvent.create({
    data: { userId: order.sellerId, orderId: order.id, type: "ON_TIME", delta: 5 },
  });
  await prisma.reputationEvent.create({
    data: { userId: order.buyerId, orderId: order.id, type: "ON_TIME", delta: 2 },
  });
  await prisma.user.update({
    where: { id: order.sellerId },
    data: { reputationScore: { increment: 5 } },
  });
  await prisma.user.update({
    where: { id: order.buyerId },
    data: { reputationScore: { increment: 2 } },
  });

  revalidatePath(`/buyer/order/${order.id}`);
  revalidatePath("/buyer/dashboard");
}

// ---------------------------------------------------------------------------
// BUYER or ADMIN: flag a dispute; ADMIN: resolve it.
// ---------------------------------------------------------------------------
export async function flagDispute(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "BUYER" && user.role !== "ADMIN") {
    throw new Error("Not authorized.");
  }
  const orderId = String(formData.get("orderId"));
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  await prisma.order.update({ where: { id: order.id }, data: { status: "DISPUTED" } });
  await prisma.reputationEvent.create({
    data: { userId: order.sellerId, orderId: order.id, type: "DISPUTE", delta: -5 },
  });
  await prisma.user.update({
    where: { id: order.sellerId },
    data: { reputationScore: { decrement: 5 } },
  });

  revalidatePath("/admin");
  revalidatePath(`/buyer/order/${order.id}`);
}

export async function resolveDispute(formData: FormData) {
  await requireUser("ADMIN");
  const orderId = String(formData.get("orderId"));
  const restoreStatus = String(formData.get("restoreStatus") ?? "DELIVERED");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: restoreStatus as never },
  });
  await prisma.reputationEvent.create({
    data: { userId: order.sellerId, orderId: order.id, type: "RESOLVED", delta: 2 },
  });
  await prisma.user.update({
    where: { id: order.sellerId },
    data: { reputationScore: { increment: 2 } },
  });

  revalidatePath("/admin");
}

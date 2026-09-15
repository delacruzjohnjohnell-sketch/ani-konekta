"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { suggestFairPrice } from "@/lib/pricing";
import { paymentProvider } from "@/lib/payments";
import { notifications } from "@/lib/notifications";
import { poolOrdersByMunicipality } from "@/lib/routing";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { ActionState } from "@/components/ui/action-form";
import { createEscrowedOrderForLines } from "@/lib/order-fulfillment";
import { StockUnavailableError } from "@/lib/listing-stock";
import { sweepAutoReleaseEligibleOrders } from "@/lib/escrow-auto-release";
import {
  getOrCreateWallet,
  walletHoldForOrder,
  walletReleaseForOrder,
  InsufficientWalletBalanceError,
} from "@/lib/wallet";

// Exported so the new verification/wallet/messaging/sms server actions
// (src/app/{verification,wallet,messages,sms,admin/*}/actions.ts) can reuse
// the exact same auth-gating helper instead of duplicating it.
export async function requireUser(role?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  if (role && session.user.role !== role) throw new Error("Not authorized.");
  return session.user;
}

// ---------------------------------------------------------------------------
// SELLER: create a listing (with AI-suggested price shown alongside it)
//
// Returns { error } instead of throwing on every validation/upload failure —
// this is the fix for the "Post Listing" bug: a plain <form action={fn}>
// with no useActionState has no way to catch a thrown Error, so it used to
// crash the whole page to Next's generic error screen on ANY failure (a
// missing field, an invalid photo, or BLOB_READ_WRITE_TOKEN not being set
// locally). Pairs with <ActionForm> (src/components/ui/action-form.tsx),
// which renders state.error inline and only resets the form on success.
// ---------------------------------------------------------------------------
export async function createListing(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser("SELLER");

  const cropType = String(formData.get("cropType") ?? "").trim();
  const variety = String(formData.get("variety") ?? "").trim() || null;
  const volumeKg = Number(formData.get("volumeKg"));
  const harvestDate = new Date(String(formData.get("harvestDate")));
  const askingPricePerKg = Number(formData.get("askingPricePerKg"));
  const qualityTag = String(formData.get("qualityTag") ?? "STANDARD");
  const municipality = String(formData.get("municipality") ?? "").trim();
  const minOrderQtyKgRaw = String(formData.get("minOrderQtyKg") ?? "").trim();
  const minOrderQtyKg = minOrderQtyKgRaw ? Number(minOrderQtyKgRaw) : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  // FEATURE 2 — Cold-Chain Classification: the checkbox always renders
  // pre-checked/unchecked per guessRequiresColdChain(cropType) (client-side,
  // see the listing form), but the seller can override it — this reads
  // whatever the submitted checkbox state actually was, not the heuristic.
  const requiresColdChain = formData.get("requiresColdChain") === "on";
  const photoFile = formData.get("photo");

  if (!cropType || !municipality || !volumeKg || !askingPricePerKg) {
    return { error: t("seller.error.missingFields", locale) };
  }

  // A listing can never be published without a real photo attachment — no
  // pasted-URL fallback (Feature: direct file attachment, never a URL field).
  if (!(photoFile instanceof File) || photoFile.size === 0) {
    return { error: t("seller.error.photoRequired", locale) };
  }

  let photoBlobKey: string;
  try {
    photoBlobKey = await uploadPhoto(photoFile, "listings");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { error: t("seller.error.photoUploadFailed", locale, { reason }) };
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
      minOrderQtyKg,
      description,
      photoBlobKey,
      requiresColdChain,
    },
  });

  revalidatePath("/seller/dashboard");
  revalidatePath("/buyer/dashboard");
  return { success: true };
}

// ---------------------------------------------------------------------------
// SELLER: edit their own listing. Same field set as createListing minus a
// mandatory photo — re-uploading a photo is optional on edit; when omitted
// the listing keeps its existing photoBlobKey. Scoped to sellerId so a
// seller can never edit someone else's listing (checked, not just filtered).
// ---------------------------------------------------------------------------
export async function editListing(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser("SELLER");
  const listingId = String(formData.get("listingId"));

  const existing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!existing || existing.sellerId !== user.id) {
    return { error: t("seller.error.notFound", locale) };
  }

  const cropType = String(formData.get("cropType") ?? "").trim();
  const variety = String(formData.get("variety") ?? "").trim() || null;
  const volumeKg = Number(formData.get("volumeKg"));
  const harvestDate = new Date(String(formData.get("harvestDate")));
  const askingPricePerKg = Number(formData.get("askingPricePerKg"));
  const qualityTag = String(formData.get("qualityTag") ?? "STANDARD");
  const municipality = String(formData.get("municipality") ?? "").trim();
  const minOrderQtyKgRaw = String(formData.get("minOrderQtyKg") ?? "").trim();
  const minOrderQtyKg = minOrderQtyKgRaw ? Number(minOrderQtyKgRaw) : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const requiresColdChain = formData.get("requiresColdChain") === "on";
  const photoFile = formData.get("photo");

  if (!cropType || !municipality || !volumeKg || !askingPricePerKg) {
    return { error: t("seller.error.missingFields", locale) };
  }

  let photoBlobKey = existing.photoBlobKey;
  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      photoBlobKey = await uploadPhoto(photoFile, "listings");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { error: t("seller.error.photoUploadFailed", locale, { reason }) };
    }
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      cropType,
      variety,
      volumeKg,
      harvestDate,
      askingPricePerKg,
      qualityTag: qualityTag as never,
      municipality,
      minOrderQtyKg,
      description,
      photoBlobKey,
      requiresColdChain,
    },
  });

  revalidatePath("/seller/dashboard");
  revalidatePath("/buyer/dashboard");
  return { success: true };
}

// ---------------------------------------------------------------------------
// SELLER: delete (soft-delete) a listing of their own.
//
// This never hard-deletes the row: Order.listingId is a required foreign
// key, so any order — even a long-settled one — still needs its listing row
// to exist to keep showing full transaction history (order-detail-view.tsx
// reads order.listing.cropType etc. directly). Instead this sets
// status: DELETED, which drops the listing out of every ACTIVE-only query
// (the buyer marketplace, and the seller's own "My listings" list) while
// leaving it fully intact for any order that references it.
// ---------------------------------------------------------------------------
export async function deleteListing(formData: FormData) {
  const user = await requireUser("SELLER");
  const listingId = String(formData.get("listingId"));

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });
  if (listing.sellerId !== user.id) {
    throw new Error("You can only delete your own listings.");
  }

  const activeOrder = await prisma.order.findFirst({
    where: { listingId, status: { not: "SETTLED" } },
  });
  if (activeOrder) {
    throw new Error(
      "This listing has an active or ongoing order and can't be deleted until that order is settled."
    );
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "DELETED" },
  });

  revalidatePath("/seller/dashboard");
  revalidatePath("/buyer/dashboard");
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

  const order = await createEscrowedOrderForLines({
    buyerId: user.id,
    sellerId: listing.sellerId,
    lines: [
      {
        listingId: listing.id,
        cropType: listing.cropType,
        qtyKg: listing.volumeKg,
        pricePerKg: listing.askingPricePerKg,
      },
    ],
    isBulkMatch: false,
    decrementStock: false, // whole-listing purchase — keeps existing hard-close behavior
  });

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

  const order = await createEscrowedOrderForLines({
    buyerId: user.id,
    sellerId: primarySellerId,
    lines: listings.map((l) => ({
      listingId: l.id,
      cropType: l.cropType,
      qtyKg: l.volumeKg,
      pricePerKg: l.askingPricePerKg,
    })),
    isBulkMatch: true,
    decrementStock: false, // whole-listing purchase — keeps existing hard-close behavior
  });

  revalidatePath("/buyer/dashboard");
  redirect(`/buyer/order/${order.id}`);
}

// ---------------------------------------------------------------------------
// BUYER: checkout the cart (Feature: shopping cart with buyer-chosen kg
// quantities). The cart itself is client-only state (localStorage) — this
// action is the single server round-trip that turns it into real escrowed
// orders, and it NEVER trusts the client's copy of price/stock/minimum: every
// line is re-fetched and re-validated against the live Listing row.
//
// A cart can span multiple sellers, but Order.listingId/sellerId model one
// seller per Order (same constraint bulkMatchOrder already works within) —
// so this groups cart lines by seller and creates one Order per seller
// group, using partial-quantity stock decrement (decrementStock: true)
// instead of the whole-listing hard-close placeOrder/bulkMatchOrder use,
// since a cart line is very often less than a listing's full volumeKg.
// ---------------------------------------------------------------------------
export type CheckoutCartLine = { listingId: string; qtyKg: number };
export type CheckoutCartState =
  | { error?: string; success?: boolean; orderIds?: string[] }
  | null;

export async function checkoutCart(
  _prevState: CheckoutCartState,
  formData: FormData
): Promise<CheckoutCartState> {
  const locale = await getLocale();
  const user = await requireUser("BUYER");
  const cartJson = String(formData.get("cartJson") ?? "[]");
  const fundingSource = String(formData.get("fundingSource") ?? "ESCROW");

  let requestedLines: CheckoutCartLine[];
  try {
    requestedLines = JSON.parse(cartJson);
  } catch {
    return { error: t("common.error", locale) };
  }
  if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
    return { error: t("cart.empty", locale) };
  }

  const listingIds = requestedLines.map((l) => l.listingId);
  const listings = await prisma.listing.findMany({ where: { id: { in: listingIds } } });
  const listingById = new Map(listings.map((l) => [l.id, l]));

  // Re-validate every line server-side — the client cart is never trusted
  // for price, stock, or minimum-order enforcement.
  for (const line of requestedLines) {
    const listing = listingById.get(line.listingId);
    if (!listing || listing.status !== "ACTIVE") {
      return { error: t("buyer.error.listingUnavailable", locale) };
    }
    if (line.qtyKg <= 0) {
      return { error: t("cart.errorInvalidQty", locale) };
    }
    if (listing.minOrderQtyKg != null && line.qtyKg < listing.minOrderQtyKg) {
      return {
        error: t("cart.errorBelowMinimum", locale, { min: listing.minOrderQtyKg }),
      };
    }
    if (line.qtyKg > listing.volumeKg) {
      return {
        error: t("cart.errorAboveStock", locale, { available: listing.volumeKg }),
      };
    }
  }

  // If paying with ANI-Wallet, fail fast on an obviously-short balance before
  // creating any orders — a conservative check against the pre-fee subtotal
  // (the same subtotal shown in the cart drawer's own estimate). The exact
  // grand total (incl. logistics fee) is only known per-seller once
  // createEscrowedOrderForLines snapshots the commission, so the real,
  // authoritative check happens per-order below via walletHoldForOrder.
  if (fundingSource === "WALLET") {
    const subtotal = requestedLines.reduce((s, l) => {
      const listing = listingById.get(l.listingId)!;
      return s + l.qtyKg * listing.askingPricePerKg;
    }, 0);
    const wallet = await getOrCreateWallet(user.id);
    if (wallet.availableBalancePHP < subtotal) {
      return { error: t("wallet.error.insufficientFunds", locale) };
    }
  }

  // Group by seller — Order.sellerId is single, so a multi-seller cart
  // becomes one Order per seller (same convention as bulkMatchOrder).
  const bySeller = new Map<string, typeof requestedLines>();
  for (const line of requestedLines) {
    const listing = listingById.get(line.listingId)!;
    const key = listing.sellerId;
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key)!.push(line);
  }

  const orderIds: string[] = [];
  try {
    for (const [sellerId, lines] of bySeller) {
      const order = await createEscrowedOrderForLines({
        buyerId: user.id,
        sellerId,
        lines: lines.map((l) => {
          const listing = listingById.get(l.listingId)!;
          return {
            listingId: listing.id,
            cropType: listing.cropType,
            qtyKg: l.qtyKg,
            pricePerKg: listing.askingPricePerKg,
          };
        }),
        isBulkMatch: lines.length > 1,
        decrementStock: true, // partial-quantity purchase
      });
      orderIds.push(order.id);

      if (fundingSource === "WALLET") {
        const grandTotal =
          order.totalAmount + (order.logisticsFeeAmountPHP ?? 0);
        await prisma.$transaction((tx) =>
          walletHoldForOrder(tx, user.id, order.id, grandTotal)
        );
      }
    }
  } catch (err) {
    if (err instanceof StockUnavailableError) {
      return { error: err.message };
    }
    if (err instanceof InsufficientWalletBalanceError) {
      return { error: t("wallet.error.insufficientFunds", locale) };
    }
    throw err;
  }

  revalidatePath("/buyer/dashboard");
  redirect(`/buyer/checkout/success?orders=${orderIds.join(",")}`);
}

// ---------------------------------------------------------------------------
// HAULER: accept an escrowed order and pool it into a route (municipality-
// level grouping heuristic — see src/lib/routing.ts).
//
// dropoffPoint is the buyer's real municipality (not a placeholder string)
// so the Hauler Dashboard's municipality filter can actually match a
// route's delivery location, not just its pickup location.
//
// If this hauler already has an ASSIGNED (not-yet-picked-up) route running
// the same pickup -> dropoff municipality corridor, the order joins that
// route instead of always creating a new one-order route — this is the
// real "which pickups can be grouped into the same route" grouping, not
// just a cosmetic list grouping.
// ---------------------------------------------------------------------------
export async function acceptAndPoolOrder(formData: FormData) {
  const user = await requireUser("HAULER");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { listing: true, buyer: true },
  });
  if (order.status !== "ORDERED_ESCROWED") {
    throw new Error("Order is not ready for pooling.");
  }

  // FEATURE 2 — Cold-Chain Classification: a cold-chain order may only be
  // accepted by a hauler with a refrigerated vehicle. Since capability is
  // per-hauler (not per-vehicle/per-route — see the User.hasRefrigeratedVehicle
  // comment in schema.prisma), a refrigerated hauler's route can freely mix
  // cold-chain and ambient orders (the vehicle covers the whole trip either
  // way); a non-refrigerated hauler simply can never accept a cold-chain
  // order onto any route, which is what keeps the two from ever mixing on a
  // route that isn't refrigerated.
  if (order.listing.requiresColdChain) {
    const hauler = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!hauler.hasRefrigeratedVehicle) {
      throw new Error(
        "🧊 This order requires refrigerated transport — your account isn't marked as having a refrigerated vehicle. Update this on your dashboard if you do."
      );
    }
  }

  const pickupMunicipality = order.listing.municipality;
  const dropoffMunicipality = order.buyer.municipality?.trim() || "Buyer facility (TBD)";

  const joinableRoute = await prisma.pooledRoute.findFirst({
    where: {
      haulerId: user.id,
      status: "ASSIGNED",
      dropoffPoint: dropoffMunicipality,
      pickupPoints: { has: pickupMunicipality },
    },
    orderBy: { createdAt: "desc" },
  });

  const route = joinableRoute
    ? await prisma.pooledRoute.update({
        where: { id: joinableRoute.id },
        data: {
          // Rough re-estimate for one more stop on an already-pooled trip
          // (same placeholder-heuristic spirit as poolOrdersByMunicipality
          // — see src/lib/routing.ts; real routing is Phase 2, ROADMAP.md).
          etaMinutes: (joinableRoute.etaMinutes ?? 45) + 10,
        },
      })
    : await prisma.pooledRoute.create({
        data: (() => {
          const [pooled] = poolOrdersByMunicipality([{ id: order.id, municipality: pickupMunicipality }]);
          return {
            haulerId: user.id,
            pickupPoints: [pickupMunicipality],
            dropoffPoint: dropoffMunicipality,
            status: "ASSIGNED" as const,
            etaMinutes: pooled.estimatedEtaMinutes,
            distanceKm: pooled.estimatedDistanceKm,
          };
        })(),
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
  const photoFile = formData.get("photoOfDelivery");

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

  // Proof-of-delivery photo is required only on the transition that creates
  // the ProofOfDelivery record — no pasted-URL fallback.
  let photoBlobKey: string | null = null;
  if (nextStatus === "DELIVERED") {
    if (!(photoFile instanceof File) || photoFile.size === 0) {
      throw new Error("A proof-of-delivery photo is required to mark this route delivered.");
    }
    try {
      photoBlobKey = await uploadPhoto(photoFile, "proof-of-delivery");
    } catch (err) {
      if (err instanceof PhotoValidationError) throw err;
      throw new Error(`Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.pooledRoute.update({
    where: { id: route.id },
    data: { status: nextStatus as never },
  });

  const orderStatus = nextStatus === "DELIVERED" ? "DELIVERED" : "IN_TRANSIT";
  await prisma.order.updateMany({
    where: { id: { in: route.orders.map((o) => o.id) } },
    data: {
      status: orderStatus as never,
      // Starts the auto-release countdown (see
      // src/app/api/cron/auto-release-escrow) — this app has no separate
      // Order.deliveredAt, so escrowEligibleAt is the adapted equivalent.
      ...(nextStatus === "DELIVERED" ? { escrowEligibleAt: new Date() } : {}),
    },
  });

  if (nextStatus === "DELIVERED") {
    for (const order of route.orders) {
      await prisma.proofOfDelivery.create({
        data: { orderId: order.id, confirmedByBuyer: false, notes, photoBlobKey },
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
//
// FEATURE 1 — Escrow Release Lockdown, trigger #1 (BUYER_CONFIRM). Three
// server-side checks gate this, all independent of anything the client
// sends: requester === order.buyerId (role is also pinned to BUYER via
// requireUser — a seller/hauler/admin can never reach this function at
// all), order.status is exactly "DELIVERED" (not any earlier state, and not
// "DISPUTED" — a disputed order is no longer DELIVERED, see flagDispute),
// and a ProofOfDelivery row exists on the order.
//
// Idempotency: the prisma.order.updateMany below is a DB-level
// compare-and-swap — it only ever matches (and updates) a row that is
// STILL status=DELIVERED/escrowStatus=HELD at the moment the UPDATE
// executes. Postgres serializes concurrent UPDATEs to the same row, so of
// two racing confirmDelivery calls (a double-submit, a retry) or a race
// against the auto-release cron (src/app/api/cron/auto-release-escrow) or
// an admin dual-approval release, at most one can ever match — every other
// caller sees claimed.count === 0 and returns without paying out twice.
// ---------------------------------------------------------------------------
export async function confirmDelivery(formData: FormData) {
  const user = await requireUser("BUYER");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { route: true, proofOfDelivery: true },
  });
  if (order.buyerId !== user.id) throw new Error("Not your order.");
  if (order.status !== "DELIVERED") throw new Error("Order is not yet delivered.");
  if (!order.proofOfDelivery) {
    throw new Error("No proof of delivery on record for this order.");
  }

  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: "DELIVERED", escrowStatus: "HELD" },
    data: { status: "SETTLED", escrowStatus: "RELEASED" },
  });
  if (claimed.count === 0) {
    // Already settled through another path (retry, or raced with
    // auto-release/admin release) — not an error, just a no-op.
    return;
  }

  // Settlement pays out three ways from the escrowed grand total, using the
  // rates/amounts snapshotted onto the order at creation time (never
  // recomputed here) — see src/lib/commission.ts.
  // Pre-migration orders may not have a snapshot yet; fall back to the full
  // gross amount for the seller so nothing silently pays out ₱0.
  //
  // NOTE (flagged, per user decision — gateway/webhook work out of scope for
  // now): paymentProvider is still MockPaymentProvider (src/lib/payments.ts)
  // — it always resolves. When a real gateway is wired up, this call should
  // become claim -> call gateway -> confirm-or-compensate (e.g. an
  // intermediate escrowStatus like "RELEASING" that rolls back to "HELD" on
  // gateway failure), since right now the DB is already marked
  // SETTLED/RELEASED above before the (currently infallible) gateway call.
  const netPayoutToSeller = order.netPayoutToSellerPHP ?? order.totalAmount;

  await paymentProvider.releaseFunds({
    orderId: order.id,
    amount: netPayoutToSeller,
    sellerId: order.sellerId,
  });

  if (order.haulerPayoutAmountPHP && order.route) {
    await paymentProvider.payHauler({
      orderId: order.id,
      amount: order.haulerPayoutAmountPHP,
      haulerId: order.route.haulerId,
    });
  }

  await prisma.escrowEvent.create({
    data: {
      orderId: order.id,
      fromStatus: "DELIVERED",
      toStatus: "SETTLED",
      triggeredBy: user.id,
      triggerType: "BUYER_CONFIRM",
      metadata: { proofOfDeliveryId: order.proofOfDelivery.id },
    },
  });

  await prisma.proofOfDelivery.update({
    where: { orderId: order.id },
    data: { confirmedByBuyer: true },
  });

  // No-op unless this order was funded via ANI-Wallet at checkout (looks up
  // its own HOLD transaction by orderId — see src/lib/wallet.ts).
  await prisma.$transaction((tx) => walletReleaseForOrder(tx, order.id));

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
// Any participant on a SETTLED order: rate another participant on that same
// order (5-star system, replacing the old points-based reputationScore).
// Both parties must have actually transacted together on this specific
// order — buyer, seller, or the route's assigned hauler — and the order
// must already be SETTLED, so ratings can only ever follow a real completed
// transaction, never be posted speculatively or about a stranger.
// ---------------------------------------------------------------------------
export async function submitRating(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId"));
  const rateeId = String(formData.get("rateeId"));
  const stars = Number(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim() || null;

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating must be a whole number of stars, 1 to 5.");
  }
  if (user.id === rateeId) {
    throw new Error("You can't rate yourself.");
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { route: true },
  });
  if (order.status !== "SETTLED") {
    throw new Error("You can only rate a party after the order is fully settled.");
  }

  const participantIds = new Set(
    [order.buyerId, order.sellerId, order.route?.haulerId].filter(
      (id): id is string => !!id
    )
  );
  if (!participantIds.has(user.id) || !participantIds.has(rateeId)) {
    throw new Error("You can only rate someone you actually transacted with on this order.");
  }

  try {
    await prisma.rating.create({
      data: { orderId, raterId: user.id, rateeId, stars, comment },
    });
  } catch {
    // Unique constraint on (orderId, raterId, rateeId) — already rated.
    throw new Error("You've already rated this person for this order.");
  }

  await prisma.user.update({
    where: { id: rateeId },
    data: { ratingSum: { increment: stars }, ratingCount: { increment: 1 } },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/buyer/order/${orderId}`);
  revalidatePath("/seller/dashboard");
  revalidatePath("/hauler/dashboard");
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

// FEATURE 1 — Escrow Release Lockdown: this used to accept an arbitrary
// `restoreStatus` string straight from the submitted form
// (`data: { status: restoreStatus as never }`, no allow-list) — a single
// admin could have crafted a request with restoreStatus="SETTLED" and
// released escrow with zero payout call, zero second approver, and zero
// audit trail. Today's UI never sent anything but "DELIVERED", but the
// server action itself didn't enforce that. Fixed: this path can only ever
// restore a disputed order to DELIVERED (never moves money — the buyer
// still has to confirm delivery normally afterward, or an admin can use
// initiateDisputeRelease/approveDisputeRelease below if funds should go to
// the seller despite the dispute). Restoring gives a fresh
// escrowEligibleAt so the buyer isn't hit with an instant auto-release the
// moment the dispute closes.
export async function resolveDispute(formData: FormData) {
  await requireUser("ADMIN");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DISPUTED") throw new Error("Order is not disputed.");

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", escrowEligibleAt: new Date() },
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

// ---------------------------------------------------------------------------
// FEATURE 1 — Escrow Release Lockdown, trigger #3 (ADMIN_DUAL_APPROVAL).
// The ONLY way a disputed order's escrow can be released to the seller
// despite the open dispute. Two distinct admins required:
//   1. initiateDisputeRelease — admin A opens a PENDING request.
//   2. approveDisputeRelease — admin B (must differ from A) approves it;
//      only then does the actual release/payout fire.
// A single admin acting alone can never move money down this path.
// ---------------------------------------------------------------------------
export async function initiateDisputeRelease(formData: FormData) {
  const admin = await requireUser("ADMIN");
  const orderId = String(formData.get("orderId"));

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DISPUTED") throw new Error("Order is not disputed.");

  const existing = await prisma.disputeReleaseRequest.findFirst({
    where: { orderId, status: "PENDING" },
  });
  if (existing) throw new Error("A release request is already pending for this order.");

  await prisma.disputeReleaseRequest.create({
    data: { orderId, openedBy: admin.id },
  });

  revalidatePath("/admin");
}

export async function rejectDisputeRelease(formData: FormData) {
  await requireUser("ADMIN");
  const requestId = String(formData.get("requestId"));

  const request = await prisma.disputeReleaseRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request was already decided.");

  await prisma.disputeReleaseRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", decidedAt: new Date() },
  });

  revalidatePath("/admin");
}

export async function approveDisputeRelease(formData: FormData) {
  const admin = await requireUser("ADMIN");
  const requestId = String(formData.get("requestId"));

  const request = await prisma.disputeReleaseRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { order: { include: { route: true } } },
  });
  if (request.status !== "PENDING") throw new Error("This request was already decided.");
  if (request.openedBy === admin.id) {
    throw new Error("A different admin must approve this release — you opened this request.");
  }

  const order = request.order;
  if (order.status !== "DISPUTED") throw new Error("Order is no longer disputed.");

  // Same CAS idempotency pattern as confirmDelivery — only one release path
  // can ever win the race for a given order.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: "DISPUTED", escrowStatus: "HELD" },
    data: { status: "SETTLED", escrowStatus: "RELEASED" },
  });
  if (claimed.count === 0) {
    await prisma.disputeReleaseRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    throw new Error("This order was already settled through another path.");
  }

  const netPayoutToSeller = order.netPayoutToSellerPHP ?? order.totalAmount;
  await paymentProvider.releaseFunds({
    orderId: order.id,
    amount: netPayoutToSeller,
    sellerId: order.sellerId,
  });
  if (order.haulerPayoutAmountPHP && order.route) {
    await paymentProvider.payHauler({
      orderId: order.id,
      amount: order.haulerPayoutAmountPHP,
      haulerId: order.route.haulerId,
    });
  }

  await prisma.disputeReleaseRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", approvedBy: admin.id, decidedAt: new Date() },
  });
  await prisma.escrowEvent.create({
    data: {
      orderId: order.id,
      fromStatus: "DISPUTED",
      toStatus: "SETTLED",
      triggeredBy: admin.id,
      triggerType: "ADMIN_DUAL_APPROVAL",
      metadata: { openedBy: request.openedBy, approvedBy: admin.id, requestId: request.id },
    },
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

// ---------------------------------------------------------------------------
// ADMIN: create a new CommissionConfig rule and view/manage the fee engine.
// Existing rows are never edited in place — to change a rate, end-date the
// old rule and add a new one, so every order's snapshot always points at an
// immutable, historically-accurate rule.
// ---------------------------------------------------------------------------
export async function createCommissionConfig(formData: FormData) {
  const user = await requireUser("ADMIN");

  const cropType = String(formData.get("cropType") ?? "").trim() || null;
  const minOrderVolumeKgRaw = String(formData.get("minOrderVolumeKg") ?? "").trim();
  const minOrderVolumeKg = minOrderVolumeKgRaw ? Number(minOrderVolumeKgRaw) : null;
  const sellerCommissionRatePercent = Number(formData.get("sellerCommissionRatePercent"));
  const buyerLogisticsFeePercent = Number(formData.get("buyerLogisticsFeePercent"));
  const haulerPayoutPercentOfLogisticsFee = Number(
    formData.get("haulerPayoutPercentOfLogisticsFee")
  );
  const minFeeFloorPHP = Number(formData.get("minFeeFloorPHP"));

  if (
    Number.isNaN(sellerCommissionRatePercent) ||
    Number.isNaN(buyerLogisticsFeePercent) ||
    Number.isNaN(haulerPayoutPercentOfLogisticsFee) ||
    Number.isNaN(minFeeFloorPHP)
  ) {
    throw new Error("All rate fields are required and must be numbers.");
  }

  await prisma.commissionConfig.create({
    data: {
      cropType,
      minOrderVolumeKg,
      sellerCommissionRatePercent,
      buyerLogisticsFeePercent,
      haulerPayoutPercentOfLogisticsFee,
      minFeeFloorPHP,
      createdBy: user.id,
    },
  });

  revalidatePath("/admin/commission");
}

// ADMIN: end-date a rule (sets effectiveTo = now) instead of deleting it —
// orders that already snapshotted it keep referencing it via
// Order.commissionConfigId, so history stays intact.
export async function endDateCommissionConfig(formData: FormData) {
  await requireUser("ADMIN");
  const configId = String(formData.get("configId"));

  await prisma.commissionConfig.update({
    where: { id: configId },
    data: { effectiveTo: new Date() },
  });

  revalidatePath("/admin/commission");
}

// ---------------------------------------------------------------------------
// ADMIN: manually run the exact same auto-release sweep the cron job runs
// (src/lib/escrow-auto-release.ts). NOT a bypass of the dispute-free window
// — it only processes orders that already meet the window+no-dispute
// criteria, same as the cron. Exists because Vercel's Hobby tier limits
// cron jobs to once per day (vercel.json runs it nightly); this gives an
// admin a way to trigger the sweep on demand in between.
// ---------------------------------------------------------------------------
export async function runAutoReleaseSweep(): Promise<void> {
  await requireUser("ADMIN");
  await sweepAutoReleaseEligibleOrders();
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// FEATURE 2 — Cold-Chain Classification: hauler self-declares whether they
// have a refrigerated vehicle. Self-service (matches how a hauler already
// self-submits ID verification) — no admin-override UI exists for this yet
// (flagged as a scope trim, not built: this app has no generic
// "admin edits any user field" surface anywhere to hang it off of).
// ---------------------------------------------------------------------------
export async function setHaulerRefrigeratedVehicle(formData: FormData) {
  const user = await requireUser("HAULER");
  const hasRefrigeratedVehicle = formData.get("hasRefrigeratedVehicle") === "on";

  await prisma.user.update({
    where: { id: user.id },
    data: { hasRefrigeratedVehicle },
  });

  revalidatePath("/hauler/dashboard");
}

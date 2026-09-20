import { prisma } from "@/lib/prisma";
import { paymentProvider } from "@/lib/payments";
import { notifications } from "@/lib/notifications";
import { resolveCommissionForOrder } from "@/lib/commission";
import { decrementListingStock } from "@/lib/listing-stock";
import { quoteFreight, routeZoneForMunicipality } from "@/lib/freight";
import { listingOwnerKey } from "@/lib/listing-service";
import { audit } from "@/lib/audit";
import type { Order, Prisma } from "@prisma/client";

export type OrderLine = {
  listingId: string;
  cropType: string;
  qtyKg: number;
  pricePerKg: number;
};

/**
 * The one shared "create an order" code path (commission snapshot -> Order
 * row -> settlement hold -> seller notification) used by placeOrder,
 * bulkMatchOrder, checkoutCart and SMS ORDER.
 *
 * Revision additions:
 *  - Ownership snapshot (ownerType / cooperativeId) from the listing.
 *  - Commodity FREIGHT: the buyer's destination decides the route zone; the
 *    CURRENT database tariff for (zone, cropCategory) is read here — never a
 *    cached/hard-coded rate — and the full breakdown is frozen in
 *    Order.freightSnapshot so later Admin tariff edits never rewrite history.
 *  - All lines on one order must share one owner and one crop category (the
 *    callers group accordingly); mixed-commodity trips are handled at the
 *    TRIP level by summing per-order snapshots (see aggregateTripFreight).
 *
 * `sellerId` is the acting seller USER account (the farmer, or the
 * cooperative admin who posted a cooperative listing). It does NOT decide
 * payout routing — Order.ownerType/cooperativeId do.
 *
 * Does NOT decrement listing stock itself — the caller chooses whole-listing
 * close (placeOrder/bulkMatchOrder) or partial decrement (checkoutCart).
 */
export async function createEscrowedOrderForLines(params: {
  buyerId: string;
  sellerId: string;
  lines: OrderLine[];
  isBulkMatch: boolean;
  decrementStock: boolean;
  paymentTerms?: "PREPAID" | "NET_30";
}): Promise<Order> {
  const { buyerId, sellerId, lines, isBulkMatch, decrementStock } = params;
  const paymentTerms = params.paymentTerms ?? "PREPAID";
  if (lines.length === 0) throw new Error("No order lines provided.");

  const listings = await prisma.listing.findMany({
    where: { id: { in: lines.map((l) => l.listingId) } },
  });
  if (listings.length === 0) throw new Error("Listing not found.");
  const first = listings[0];
  if (!listings.every((l) => listingOwnerKey(l) === listingOwnerKey(first))) {
    throw new Error("An order cannot mix listings from different sellers/cooperatives.");
  }
  if (!listings.every((l) => l.cropCategory === first.cropCategory)) {
    throw new Error("An order cannot mix crop categories — each commodity ships under its own freight tariff.");
  }

  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
  const routeZone = routeZoneForMunicipality(buyer.municipality);

  const cropType = lines[0].cropType;
  const totalVolumeKg = lines.reduce((s, l) => s + l.qtyKg, 0);
  const totalAmount = lines.reduce((s, l) => s + l.qtyKg * l.pricePerKg, 0);
  const agreedPricePerKg = totalAmount / totalVolumeKg;

  // Live tariff lookup (no cache) — freight = MAX(floor, weight x rate).
  const freight = await quoteFreight(routeZone, first.cropCategory, totalVolumeKg);
  const commission = await resolveCommissionForOrder(
    cropType,
    totalVolumeKg,
    totalAmount,
    new Date(),
    freight
  );

  const order = await prisma.order.create({
    data: {
      listingId: lines[0].listingId,
      buyerId,
      sellerId,
      ownerType: first.ownerType,
      cooperativeId: first.cooperativeId,
      cropCategory: first.cropCategory,
      routeZone,
      freightFloorApplied: freight.floorApplied,
      freightSnapshot: freight as unknown as Prisma.InputJsonValue,
      paymentTerms,
      volumeKg: totalVolumeKg,
      agreedPricePerKg,
      totalAmount,
      status: "ORDERED_ESCROWED",
      escrowStatus: "HELD",
      isBulkMatch,
      commissionConfigId: commission.commissionConfigId,
      appliedSellerCommissionRatePercent: commission.appliedSellerCommissionRatePercent,
      appliedBuyerLogisticsFeePercent: commission.appliedBuyerLogisticsFeePercent,
      appliedHaulerPayoutPercent: commission.appliedHaulerPayoutPercent,
      sellerCommissionAmountPHP: commission.sellerCommissionAmountPHP,
      logisticsFeeAmountPHP: commission.logisticsFeeAmountPHP,
      haulerPayoutAmountPHP: commission.haulerPayoutAmountPHP,
      platformNetRevenueAmountPHP: commission.platformNetRevenueAmountPHP,
      netPayoutToSellerPHP: commission.netPayoutToSellerPHP,
    },
  });

  if (decrementStock) {
    for (const line of lines) {
      await decrementListingStock(line.listingId, line.qtyKg);
    }
  } else {
    await prisma.listing.updateMany({
      where: { id: { in: lines.map((l) => l.listingId) } },
      data: { status: "CLOSED" },
    });
  }

  await audit(buyerId, "ORDER_CREATED", "Order", order.id, {
    ownerType: order.ownerType,
    cooperativeId: order.cooperativeId,
    commissionRatePercent: commission.appliedSellerCommissionRatePercent,
    platformCommissionAmountPHP: commission.sellerCommissionAmountPHP,
    paymentTerms,
    freight: freight as unknown as Prisma.InputJsonValue,
  });

  if (paymentTerms === "PREPAID") {
    await paymentProvider.holdFunds({
      orderId: order.id,
      amount: commission.buyerGrandTotalPHP,
      buyerId,
    });
  }

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (seller) {
    await notifications.notifyOrderStatusChange({
      phone: seller.phone,
      orderId: order.id,
      status: "ORDERED_ESCROWED (buyer payment secured with the settlement partner)",
    });
  }

  return order;
}

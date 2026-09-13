import { prisma } from "@/lib/prisma";
import { paymentProvider } from "@/lib/payments";
import { notifications } from "@/lib/notifications";
import { resolveCommissionForOrder } from "@/lib/commission";
import { decrementListingStock } from "@/lib/listing-stock";
import type { Order } from "@prisma/client";

export type OrderLine = {
  listingId: string;
  cropType: string;
  qtyKg: number;
  pricePerKg: number;
};

/**
 * The one shared "create an escrowed Order" code path — extracted from the
 * pre-existing placeOrder/bulkMatchOrder bodies (which duplicated this exact
 * sequence: commission snapshot -> Order row with all 9 commission fields ->
 * escrow hold -> seller notification) so a new caller (checkoutCart) doesn't
 * reimplement escrow/commission logic a third time. Does NOT decrement
 * listing stock itself — the caller chooses whole-listing-close
 * (placeOrder/bulkMatchOrder's existing behavior) or partial decrement
 * (checkoutCart, via decrementStock: true) so this helper stays neutral to
 * both call sites' semantics.
 */
export async function createEscrowedOrderForLines(params: {
  buyerId: string;
  sellerId: string;
  lines: OrderLine[];
  isBulkMatch: boolean;
  decrementStock: boolean;
}): Promise<Order> {
  const { buyerId, sellerId, lines, isBulkMatch, decrementStock } = params;
  if (lines.length === 0) throw new Error("No order lines provided.");

  const cropType = lines[0].cropType;
  const totalVolumeKg = lines.reduce((s, l) => s + l.qtyKg, 0);
  const totalAmount = lines.reduce((s, l) => s + l.qtyKg * l.pricePerKg, 0);
  const agreedPricePerKg = totalAmount / totalVolumeKg;

  const commission = await resolveCommissionForOrder(cropType, totalVolumeKg, totalAmount);

  const order = await prisma.order.create({
    data: {
      listingId: lines[0].listingId,
      buyerId,
      sellerId,
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

  await paymentProvider.holdFunds({
    orderId: order.id,
    amount: commission.buyerGrandTotalPHP,
    buyerId,
  });

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (seller) {
    await notifications.notifyOrderStatusChange({
      phone: seller.phone,
      orderId: order.id,
      status: "ORDERED_ESCROWED (buyer payment held in escrow)",
    });
  }

  return order;
}

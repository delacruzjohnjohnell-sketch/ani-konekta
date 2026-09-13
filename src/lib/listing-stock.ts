import { prisma } from "@/lib/prisma";

export class StockUnavailableError extends Error {}

/**
 * Partial-quantity stock decrement for the cart/checkout path (Feature:
 * buyer-chosen kg quantity). This is ADDITIVE alongside the existing
 * whole-listing-close behavior in placeOrder/bulkMatchOrder — those still
 * consume a listing's entire volumeKg and flip it straight to CLOSED; this
 * helper instead decrements just the ordered amount and only closes the
 * listing once its remaining volume hits ~0.
 *
 * The `updateMany` with a `volumeKg: { gte: qtyKg }` guard is the
 * concurrency check: if two buyers race to buy more than what's left,
 * only the update(s) that still find enough stock at write-time succeed —
 * Postgres evaluates the WHERE clause atomically per row, so this can't
 * double-sell the same kg. A failed guard throws StockUnavailableError
 * rather than silently doing nothing.
 */
export async function decrementListingStock(listingId: string, qtyKg: number) {
  if (qtyKg <= 0) throw new StockUnavailableError("Invalid quantity.");

  const result = await prisma.listing.updateMany({
    where: { id: listingId, status: "ACTIVE", volumeKg: { gte: qtyKg } },
    data: { volumeKg: { decrement: qtyKg } },
  });
  if (result.count !== 1) {
    throw new StockUnavailableError(
      "This listing no longer has enough stock for that quantity."
    );
  }

  const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (updated.volumeKg <= 0.001) {
    return prisma.listing.update({
      where: { id: listingId },
      data: { status: "CLOSED", volumeKg: 0 },
    });
  }
  return updated;
}

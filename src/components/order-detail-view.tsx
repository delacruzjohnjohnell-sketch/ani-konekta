import Link from "next/link";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso, ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS } from "@/lib/utils";
import { confirmDelivery, flagDispute, submitRating } from "@/app/actions";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { StarRatingDisplay, StarRatingInput } from "@/components/ui/star-rating";
import type { Order, Listing, User, ProofOfDelivery, PooledRoute, Rating } from "@prisma/client";

type FullOrder = Order & {
  listing: Listing;
  buyer: User;
  seller: User;
  proofOfDelivery: ProofOfDelivery | null;
  route: (PooledRoute & { orders: Order[]; hauler: User }) | null;
  ratings: Rating[];
};

export function OrderDetailView({
  order,
  viewerRole,
  viewerUserId,
}: {
  order: FullOrder;
  viewerRole: "BUYER" | "SELLER" | "ADMIN" | "HAULER";
  viewerUserId: string;
}) {
  const listingPhotoUrl = resolvePhotoUrl(order.listing.photoBlobKey);
  const proofPhotoUrl = resolvePhotoUrl(order.proofOfDelivery?.photoBlobKey);
  const hasCommissionSnapshot = order.logisticsFeeAmountPHP != null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {order.listing.cropType} · {order.volumeKg} kg
          </h1>
          <p className="text-neutral-600">
            Order #{order.id.slice(-8)} · seller {order.seller.name} · buyer{" "}
            {order.buyer.name}
          </p>
        </div>
        <Badge tone={order.status === "SETTLED" ? "green" : "gold"}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <div className="h-1.5 harvest-band" />
        <CardHeader>
          <CardTitle>Pipeline status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline status={order.status} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Produce price</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {formatPeso(order.totalAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Escrow status</p>
            <p className="mt-1 text-xl font-bold text-brand-gold-600">{order.escrowStatus}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Agreed price / kg</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {formatPeso(order.agreedPricePerKg)}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasCommissionSnapshot && (
        <Card>
          <CardHeader>
            <CardTitle>Price breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(viewerRole === "BUYER" || viewerRole === "ADMIN") && (
              <>
                <div className="flex justify-between text-neutral-700">
                  <span>Produce price</span>
                  <span className="font-medium">{formatPeso(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-neutral-700">
                  <span>Logistics / delivery fee ({order.appliedBuyerLogisticsFeePercent}%)</span>
                  <span className="font-medium">{formatPeso(order.logisticsFeeAmountPHP!)}</span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-2 font-semibold text-neutral-900">
                  <span>You pay (total)</span>
                  <span>{formatPeso(order.totalAmount + order.logisticsFeeAmountPHP!)}</span>
                </div>
              </>
            )}
            {(viewerRole === "SELLER" || viewerRole === "ADMIN") && (
              <>
                {viewerRole === "ADMIN" && <div className="h-px bg-black/10" />}
                <div className="flex justify-between text-neutral-700">
                  <span>Order value</span>
                  <span className="font-medium">{formatPeso(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Platform commission ({order.appliedSellerCommissionRatePercent}%)</span>
                  <span>− {formatPeso(order.sellerCommissionAmountPHP!)}</span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-2 font-semibold text-brand-green-700">
                  <span>You receive</span>
                  <span>{formatPeso(order.netPayoutToSellerPHP!)}</span>
                </div>
              </>
            )}
            {(viewerRole === "HAULER" || viewerRole === "ADMIN") && order.haulerPayoutAmountPHP != null && (
              <>
                {viewerRole === "ADMIN" && <div className="h-px bg-black/10" />}
                <div className="flex justify-between font-semibold text-brand-gold-700">
                  <span>Hauler payout ({order.appliedHaulerPayoutPercent}% of logistics fee)</span>
                  <span>{formatPeso(order.haulerPayoutAmountPHP)}</span>
                </div>
              </>
            )}
            {viewerRole === "ADMIN" && order.platformNetRevenueAmountPHP != null && (
              <div className="flex justify-between border-t border-black/10 pt-2 font-semibold text-neutral-900">
                <span>Platform net revenue</span>
                <span>{formatPeso(order.platformNetRevenueAmountPHP)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {listingPhotoUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Listing photo</CardTitle>
          </CardHeader>
          <CardContent>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listingPhotoUrl}
              alt={`${order.listing.cropType} listing photo`}
              className="max-h-80 w-full rounded-lg object-cover"
            />
          </CardContent>
        </Card>
      )}

      {order.route && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
          <CardHeader>
            <CardTitle>Pooled shipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-neutral-600">
            <p>
              Logistics status:{" "}
              <span className="font-medium text-neutral-900">
                {ROUTE_STATUS_LABELS[order.route.status] ?? order.route.status}
              </span>
            </p>
            <p>Pickup location(s): {order.route.pickupPoints.join(", ")}</p>
            <p>Delivery destination: {order.route.dropoffPoint}</p>
            <p>
              Total load in this pooled shipment:{" "}
              {order.route.orders.reduce((s, o) => s + o.volumeKg, 0)} kg across{" "}
              {order.route.orders.length} order(s)
            </p>
            <p>Est. distance: {order.route.distanceKm} km · Est. ETA: {order.route.etaMinutes} min</p>
          </CardContent>
        </Card>
      )}

      {order.proofOfDelivery && order.status !== "SETTLED" && viewerRole === "BUYER" && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">
              Delivered {order.proofOfDelivery.deliveredAt.toLocaleString()}. Confirming
              releases escrow-held payment to the seller.
            </p>
            <div className="flex gap-2">
              <form action={confirmDelivery}>
                <input type="hidden" name="orderId" value={order.id} />
                <Button type="submit">Confirm delivery & release escrow</Button>
              </form>
              <form action={flagDispute}>
                <input type="hidden" name="orderId" value={order.id} />
                <Button type="submit" variant="danger">
                  Flag dispute instead
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {order.proofOfDelivery && (
        <Card>
          <CardHeader>
            <CardTitle>Traceability</CardTitle>
          </CardHeader>
          <CardContent>
            {proofPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofPhotoUrl}
                alt="Proof of delivery"
                className="mb-3 max-h-80 w-full rounded-lg object-cover"
              />
            )}
            <p className="text-sm text-neutral-600">
              QR trace code: <code>{order.proofOfDelivery.qrTraceCode}</code>
            </p>
            <Link
              href={`/order/${order.id}/trace`}
              className="mt-2 inline-block text-sm font-medium text-brand-green-700"
            >
              View public traceability page →
            </Link>
          </CardContent>
        </Card>
      )}

      {order.status === "SETTLED" && viewerRole !== "ADMIN" && (() => {
        // Ratings are only ever offered on a SETTLED order, and only between
        // people who actually transacted together on it — this list is the
        // same participant set submitRating enforces server-side.
        const participants = [
          { user: order.buyer, role: "Buyer" as const },
          { user: order.seller, role: "Seller" as const },
          ...(order.route ? [{ user: order.route.hauler, role: "Hauler" as const }] : []),
        ];
        const others = participants.filter((p) => p.user.id !== viewerUserId);
        if (others.length === 0) return null;

        return (
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
            <CardHeader>
              <CardTitle>Rate this transaction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {others.map(({ user: ratee, role }) => {
                const existing = order.ratings.find(
                  (r) => r.raterId === viewerUserId && r.rateeId === ratee.id
                );
                if (existing) {
                  return (
                    <div key={ratee.id} className="text-sm text-neutral-600">
                      <p className="mb-1">
                        Your rating of {ratee.name} ({role}):
                      </p>
                      <StarRatingDisplay sum={existing.stars} count={1} />
                      {existing.comment && (
                        <p className="mt-1 italic text-neutral-500">&ldquo;{existing.comment}&rdquo;</p>
                      )}
                    </div>
                  );
                }
                return (
                  <form key={ratee.id} action={submitRating} className="space-y-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="rateeId" value={ratee.id} />
                    <p className="text-sm font-medium text-neutral-900">
                      Rate {ratee.name} ({role})
                    </p>
                    <StarRatingInput name="stars" />
                    <input
                      type="text"
                      name="comment"
                      placeholder="Optional comment"
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Submit rating
                    </Button>
                  </form>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}

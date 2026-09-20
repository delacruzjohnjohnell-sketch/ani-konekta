import Link from "next/link";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso, ORDER_STATUS_LABELS, ROUTE_STATUS_LABELS } from "@/lib/utils";
import { confirmDelivery, flagDispute, submitRating } from "@/app/actions";
import { startConversation } from "@/app/messages/actions";
import { RouteMapLoader } from "@/components/order/route-map-loader";
import { HaulerChatPanel } from "@/components/order/hauler-chat-panel";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { StarRatingDisplay, StarRatingInput } from "@/components/ui/star-rating";
import { ReceivingModal } from "@/components/order/receiving-modal";
import type {
  Order, Listing, User, ProofOfDelivery, PooledRoute, Rating, PreDispatchInspection, OrderReceipt, OrderSettlementDispute,
} from "@prisma/client";

type FullOrder = Order & {
  listing: Listing;
  buyer: User;
  seller: User;
  proofOfDelivery: ProofOfDelivery | null;
  route: (PooledRoute & { orders: Order[]; hauler: User }) | null;
  ratings: Rating[];
  inspection: PreDispatchInspection | null;
  receipt: OrderReceipt | null;
  settlementDispute: OrderSettlementDispute | null;
};

// Shape of Order.freightSnapshot (see FreightBreakdown in src/lib/freight.ts).
type FreightSnapshot = {
  routeZone?: string; cropCategory?: string; ratePerKg?: number | string; baseFloorFee?: number | string;
  weightFreight: number; floorApplied: boolean; grossFreight: number; tollApplied: number;
  freightBase: number; haulerPayout: number; platformMargin: number;
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
  const freight = order.freightSnapshot as FreightSnapshot | null;
  const showReceiving = viewerRole === "BUYER" && order.status === "DELIVERED" && !order.receipt && !!order.dockArrivalAt;
  const legacyConfirm =
    viewerRole === "BUYER" && !!order.proofOfDelivery && order.status !== "SETTLED" && !order.receipt && !showReceiving;

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
        <div className="flex items-center gap-2">
          <Badge tone={order.status === "SETTLED" ? "green" : "gold"}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
          {(viewerRole === "BUYER" || viewerRole === "SELLER") && (
            <form action={startConversation}>
              <input
                type="hidden"
                name="counterpartId"
                value={viewerRole === "BUYER" ? order.sellerId : order.buyerId}
              />
              <input type="hidden" name="orderId" value={order.id} />
              <Button type="submit" variant="outline" size="sm">
                Message
              </Button>
            </form>
          )}
        </div>
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

      {/* FEATURE 2 — Cold-Chain Classification: an ORDERED_ESCROWED
          cold-chain order sits un-accepted until a refrigerated-capable
          hauler picks it up (acceptAndPoolOrder rejects any other hauler)
          — this is the explicit "no eligible hauler yet" state the spec
          asks for, rather than the buyer/seller silently wondering why
          nothing is happening. */}
      {order.listing.requiresColdChain && order.status === "ORDERED_ESCROWED" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          🧊 This order requires refrigerated transport — waiting for an available cold-chain
          hauler.
        </div>
      )}

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

      {/* FEATURE 4 — In-App Chat (Hauler <-> Seller, Hauler <-> Buyer): once
          a hauler is assigned (order.route exists). A buyer sees only their
          own thread with the hauler; a seller only theirs; a hauler (and
          admin, view-only) sees both — never a direct buyer<->seller
          thread, that's the separate existing feature. */}
      {order.route && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(viewerRole === "BUYER" || viewerRole === "HAULER" || viewerRole === "ADMIN") && (
            <HaulerChatPanel
              orderId={order.id}
              chatRole="HAULER_TO_BUYER"
              viewerId={viewerUserId}
              title={viewerRole === "BUYER" ? "Chat with hauler" : `Chat with buyer (${order.buyer.name})`}
            />
          )}
          {(viewerRole === "SELLER" || viewerRole === "HAULER" || viewerRole === "ADMIN") && (
            <HaulerChatPanel
              orderId={order.id}
              chatRole="HAULER_TO_SELLER"
              viewerId={viewerUserId}
              title={viewerRole === "SELLER" ? "Chat with hauler" : `Chat with seller (${order.seller.name})`}
            />
          )}
        </div>
      )}

      {/* FEATURE 3 — Live Hauler Location Tracking + ETA: only for an
          active leg (POOLED/IN_TRANSIT — matches the spec's "for an order
          that is POOLED/IN_TRANSIT"), and only to the buyer/seller/admin on
          this specific order (route-map-loader polls a GET endpoint that
          itself re-checks this server-side — this client-side gate is just
          "don't bother rendering it," not the actual privacy boundary). */}
      {order.route &&
        (order.status === "POOLED" || order.status === "IN_TRANSIT") &&
        (viewerRole === "BUYER" || viewerRole === "SELLER" || viewerRole === "ADMIN") && (
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
            <CardHeader>
              <CardTitle>Live tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <RouteMapLoader
                routeId={order.route.id}
                pickupPoints={order.route.pickupPoints}
                dropoffPoint={order.route.dropoffPoint}
              />
            </CardContent>
          </Card>
        )}

      {freight && viewerRole !== "SELLER" && (
        <Card>
          <CardHeader>
            <CardTitle>Freight (tariff snapshot)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-neutral-700">
            <p className="text-xs text-neutral-500">
              {freight.routeZone} · {freight.cropCategory} — frozen at order time; later tariff changes don&apos;t affect this order.
            </p>
            <div className="flex justify-between"><span>Weight × rate</span><span>{formatPeso(freight.weightFreight)}</span></div>
            {freight.floorApplied && <div className="flex justify-between"><span>Base floor applied</span><span>Yes</span></div>}
            <div className="flex justify-between font-medium"><span>Freight charged to buyer</span><span>{formatPeso(freight.grossFreight)}</span></div>
            <div className="flex justify-between"><span>of which toll pass-through</span><span>{formatPeso(freight.tollApplied)}</span></div>
            <div className="flex justify-between"><span>Freight base</span><span>{formatPeso(freight.freightBase)}</span></div>
            {(viewerRole === "HAULER" || viewerRole === "ADMIN") && (
              <div className="flex justify-between font-medium text-brand-green-700"><span>Hauler payout (share of base + toll)</span><span>{formatPeso(freight.haulerPayout)}</span></div>
            )}
            {viewerRole === "ADMIN" && (
              <div className="flex justify-between"><span>Platform margin</span><span>{formatPeso(freight.platformMargin)}</span></div>
            )}
          </CardContent>
        </Card>
      )}

      {order.receipt && (
        <Card>
          <CardHeader>
            <CardTitle>Dockside receipt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-neutral-700">
            <p>Baseline {order.receipt.baselineWeightKg} kg · accepted <b>{order.receipt.acceptedWeightKg} kg</b> · disputed <b>{order.receipt.disputedWeightKg} kg</b></p>
            {order.receipt.reason && <p>Reason: {order.receipt.reason}</p>}
            {order.settlementDispute && (
              <p className="text-brand-gold-700">
                Dispute {order.settlementDispute.status.replace(/_/g, " ").toLowerCase()} — {formatPeso(order.settlementDispute.heldSellerNetPHP + order.settlementDispute.heldCommissionPHP)} held pending Admin mediation.
              </p>
            )}
            <p className="text-xs text-neutral-500">
              Payments are settled through a simulated third-party settlement layer; ANI-KONEKTA does not hold funds.
            </p>
          </CardContent>
        </Card>
      )}

      {showReceiving && order.dockArrivalAt && (
        <Card>
          <CardHeader>
            <CardTitle>Receive delivery</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceivingModal
              orderId={order.id}
              baselineKg={order.inspection?.actualPickupWeightKg ?? order.volumeKg}
              baselineSource={order.inspection ? "GATE_PASS" : "ORDERED_VOLUME"}
              originPhotos={order.inspection?.originPhotoUrls ?? []}
              originNote={
                order.inspection
                  ? [
                      order.inspection.moistureReadingPercent != null ? `Moisture ${order.inspection.moistureReadingPercent}%` : null,
                      order.inspection.packageCount != null ? `${order.inspection.packageCount} packages` : null,
                      order.inspection.qualityCondition,
                    ].filter(Boolean).join(" · ") || null
                  : null
              }
              dockArrivalAtISO={order.dockArrivalAt.toISOString()}
              windowEndsAtISO={order.receivingWindowEndsAt ? order.receivingWindowEndsAt.toISOString() : null}
              serverNowISO={new Date().toISOString()}
            />
          </CardContent>
        </Card>
      )}

      {order.proofOfDelivery && legacyConfirm && (
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

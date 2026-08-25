import Link from "next/link";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { confirmDelivery, flagDispute } from "@/app/actions";
import type { Order, Listing, User, ProofOfDelivery, PooledRoute } from "@prisma/client";

type FullOrder = Order & {
  listing: Listing;
  buyer: User;
  seller: User;
  proofOfDelivery: ProofOfDelivery | null;
  route: PooledRoute | null;
};

export function OrderDetailView({
  order,
  viewerRole,
}: {
  order: FullOrder;
  viewerRole: "BUYER" | "SELLER" | "ADMIN" | "HAULER";
}) {
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
            <p className="text-sm text-neutral-500">Total amount</p>
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

      {order.route && (
        <Card>
          <CardHeader>
            <CardTitle>Pooled route</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-600">
            <p>Status: {order.route.status}</p>
            <p>Pickup: {order.route.pickupPoints.join(", ")}</p>
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
    </div>
  );
}

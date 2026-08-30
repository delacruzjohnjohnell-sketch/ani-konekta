import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { formatPeso, ROUTE_STATUS_LABELS } from "@/lib/utils";
import { acceptAndPoolOrder, advanceRouteStatus } from "@/app/actions";
import { StarRatingDisplay } from "@/components/ui/star-rating";

const NEXT_LABEL: Record<string, string> = {
  ASSIGNED: "Mark picked up",
  PICKED_UP: "Mark in transit",
  IN_TRANSIT: "Mark delivered",
};

export default async function HaulerDashboard() {
  const session = await auth();
  const userId = session!.user.id;

  const [me, unassignedOrders, myRoutes] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.order.findMany({
      where: { status: "ORDERED_ESCROWED" },
      include: { listing: true, buyer: true, seller: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pooledRoute.findMany({
      where: { haulerId: userId },
      include: { orders: { include: { listing: true, buyer: true, seller: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Hauler dashboard</h1>
          <p className="text-neutral-600">
            Accept escrowed orders into pooled routes, then move them through pickup →
            in-transit → delivered.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-500">Your rating</p>
          <StarRatingDisplay sum={me.ratingSum} count={me.ratingCount} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
        <CardHeader>
          <CardTitle>Orders ready for pooling</CardTitle>
          <CardDescription>
            Grouped by municipality (see src/lib/routing.ts) — accept one to create a
            route.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unassignedOrders.length === 0 && (
            <p className="text-sm text-neutral-500">Nothing waiting for pickup right now.</p>
          )}
          {unassignedOrders.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-gold-200 bg-brand-gold-50/40 p-3"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {o.listing.cropType} · {o.volumeKg} kg · {o.listing.municipality}
                </p>
                <p className="text-sm text-neutral-500">
                  {o.seller.name} → {o.buyer.name} · {formatPeso(o.totalAmount)}
                </p>
                {o.haulerPayoutAmountPHP != null && (
                  <p className="text-sm font-medium text-brand-gold-700">
                    Expected payout: {formatPeso(o.haulerPayoutAmountPHP)}
                  </p>
                )}
              </div>
              <form action={acceptAndPoolOrder}>
                <input type="hidden" name="orderId" value={o.id} />
                <Button type="submit" size="sm">
                  Accept & pool
                </Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
        <CardHeader>
          <CardTitle>My routes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {myRoutes.length === 0 && (
            <p className="text-sm text-neutral-500">No routes assigned yet.</p>
          )}
          {myRoutes.map((r) => (
            <div key={r.id} className="rounded-lg border border-brand-green-200 bg-brand-green-50/30 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-neutral-900">
                    Route to {r.dropoffPoint} — from {r.pickupPoints.join(", ")}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {r.distanceKm} km · ETA {r.etaMinutes} min · {r.orders.length} order(s) ·{" "}
                    total load {r.orders.reduce((s, o) => s + o.volumeKg, 0)} kg
                  </p>
                </div>
                <Badge tone={r.status === "DELIVERED" ? "green" : "gold"}>
                  {ROUTE_STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>

              <ul className="mb-3 space-y-1 text-sm text-neutral-600">
                {r.orders.map((o) => (
                  <li key={o.id}>
                    {o.listing.cropType} · {o.volumeKg} kg · {o.seller.name} → {o.buyer.name}
                  </li>
                ))}
              </ul>

              {r.orders.some((o) => o.haulerPayoutAmountPHP != null) && (
                <p className="mb-3 text-sm font-medium text-brand-gold-700">
                  Expected payout for this route:{" "}
                  {formatPeso(r.orders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0))}
                </p>
              )}

              {r.status !== "DELIVERED" && (
                <form action={advanceRouteStatus} className="space-y-3">
                  <input type="hidden" name="routeId" value={r.id} />
                  {r.status === "IN_TRANSIT" && (
                    <>
                      <div>
                        <Label htmlFor={`notes-${r.id}`}>Proof-of-delivery notes</Label>
                        <Input id={`notes-${r.id}`} name="notes" placeholder="Handed to buyer's dock staff" />
                      </div>
                      <PhotoUpload
                        id={`photoOfDelivery-${r.id}`}
                        name="photoOfDelivery"
                        label="Proof-of-delivery photo"
                        required
                      />
                    </>
                  )}
                  <Button type="submit" variant="secondary">
                    {NEXT_LABEL[r.status]}
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { cn, formatPeso, ROUTE_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/utils";
import { acceptAndPoolOrder, advanceRouteStatus } from "@/app/actions";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { getActiveCommissionConfigs, selectApplicableCommissionConfig } from "@/lib/commission";

const NEXT_LABEL: Record<string, string> = {
  ASSIGNED: "Mark picked up",
  PICKED_UP: "Mark in transit",
  IN_TRANSIT: "Mark delivered",
};

// Same canonical municipality list the seller dashboard's "Create a
// listing" form uses, so filter buttons are always present even before any
// order/route exists in a given municipality yet.
const MUNICIPALITIES = [
  "Cabanatuan City",
  "Gapan City",
  "San Jose City",
  "Palayan City",
  "Muñoz",
  "Talavera",
  "Guimba",
  "Jaen",
  "Zaragoza",
];

// Most-actionable-first ordering for "My routes".
const ROUTE_URGENCY: Record<string, number> = {
  ASSIGNED: 0,
  PICKED_UP: 1,
  IN_TRANSIT: 2,
  DELIVERED: 3,
};

function municipalityFilterClasses(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "border-brand-green-700 bg-brand-green-700 text-white"
      : "border-black/10 text-neutral-600 hover:border-brand-green-700"
  );
}

export default async function HaulerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ municipality?: string }>;
}) {
  const { municipality: selectedMunicipality } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const [me, unassignedOrders, myRoutes, activeCommissionConfigs] = await Promise.all([
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
    getActiveCommissionConfigs(),
  ]);

  // ---------------------------------------------------------------------
  // Earnings / escrow — driven entirely by real order data:
  //   - "Total earnings" = haulerPayoutAmountPHP for this hauler's orders
  //     that have reached SETTLED (buyer confirmed delivery -> escrow
  //     RELEASED, see confirmDelivery in src/app/actions.ts).
  //   - "Pending in escrow" = the same payout figure for orders this
  //     hauler has accepted that haven't been SETTLED yet (escrow still
  //     HELD, regardless of route status).
  // Both update automatically on every render because they're computed
  // live from Order.status / haulerPayoutAmountPHP, never cached.
  // ---------------------------------------------------------------------
  const myOrders = myRoutes.flatMap((r) => r.orders);
  const settledOrders = myOrders.filter((o) => o.status === "SETTLED");
  const totalEarnings = settledOrders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);
  const pendingEscrowOrders = myOrders.filter((o) => o.status !== "SETTLED");
  const pendingEscrow = pendingEscrowOrders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);

  // "Hauler share" summary card — the rate a new order would apply right
  // now (same pattern as the seller dashboard's commission-rate preview),
  // so it's always a real, currently-active platform rate.
  const defaultCommissionConfig = selectApplicableCommissionConfig(activeCommissionConfigs, "", 0);
  const haulerSharePercent = defaultCommissionConfig?.haulerPayoutPercentOfLogisticsFee ?? 75;

  // ---------------------------------------------------------------------
  // Municipality filter — real logistics data, not decoration. A route or
  // order matches if the filter's municipality is its pickup location
  // (listing.municipality), its delivery location (buyer.municipality),
  // or both.
  // ---------------------------------------------------------------------
  const municipalitiesInPlay = new Set<string>(MUNICIPALITIES);
  for (const o of unassignedOrders) municipalitiesInPlay.add(o.listing.municipality);
  for (const o of myOrders) {
    municipalitiesInPlay.add(o.listing.municipality);
    if (o.buyer.municipality) municipalitiesInPlay.add(o.buyer.municipality);
  }
  const municipalityOptions = Array.from(municipalitiesInPlay).sort();

  function roleForMunicipality(m: string, pickup: string, dropoff: string | null) {
    const isPickup = m === pickup;
    const isDropoff = dropoff != null && m === dropoff;
    if (isPickup && isDropoff) return "Pickup & delivery";
    if (isPickup) return "Pickup";
    if (isDropoff) return "Delivery";
    return null;
  }

  function matchesFilter(pickup: string, dropoff: string | null) {
    if (!selectedMunicipality) return true;
    return roleForMunicipality(selectedMunicipality, pickup, dropoff) !== null;
  }

  const filteredUnassigned = unassignedOrders.filter((o) => matchesFilter(o.listing.municipality, null));
  const filteredRoutes = myRoutes.filter((r) =>
    r.orders.some((o) => matchesFilter(o.listing.municipality, o.buyer.municipality ?? null))
  );

  // Group unassigned orders by pickup municipality, biggest groups first —
  // those are the ones where accepting-and-pooling saves the most travel
  // (same grouping key poolOrdersByMunicipality uses in src/lib/routing.ts).
  const unassignedByMunicipality = new Map<string, typeof filteredUnassigned>();
  for (const o of filteredUnassigned) {
    const key = o.listing.municipality;
    if (!unassignedByMunicipality.has(key)) unassignedByMunicipality.set(key, []);
    unassignedByMunicipality.get(key)!.push(o);
  }
  const unassignedGroups = Array.from(unassignedByMunicipality.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  // Most-actionable routes first (a real, if simple, sequencing rule —
  // true GPS-based route optimization is Phase 2, see ROADMAP.md).
  const sortedRoutes = [...filteredRoutes].sort(
    (a, b) => (ROUTE_URGENCY[a.status] ?? 9) - (ROUTE_URGENCY[b.status] ?? 9)
  );

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Total earnings</p>
            <p className="mt-1 text-2xl font-bold text-brand-green-700">{formatPeso(totalEarnings)}</p>
            <p className="mt-1 text-xs text-neutral-400">
              {settledOrders.length} completed {settledOrders.length === 1 ? "delivery" : "deliveries"} · escrow
              released
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Pending in escrow</p>
            <p className="mt-1 text-2xl font-bold text-brand-gold-600">{formatPeso(pendingEscrow)}</p>
            <p className="mt-1 text-xs text-neutral-400">
              {pendingEscrowOrders.length} {pendingEscrowOrders.length === 1 ? "delivery" : "deliveries"} in progress ·
              released after buyer confirms
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 via-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Hauler share</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{haulerSharePercent}%</p>
            <p className="mt-1 text-xs text-neutral-400">of the logistics fee, per delivery</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter by municipality</CardTitle>
          <CardDescription>
            Shows pickups, pools, and routes touching that municipality — as a pickup
            location, a delivery location, or both.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link href="/hauler/dashboard" className={municipalityFilterClasses(!selectedMunicipality)}>
              All
            </Link>
            {municipalityOptions.map((m) => (
              <Link
                key={m}
                href={`/hauler/dashboard?municipality=${encodeURIComponent(m)}`}
                className={municipalityFilterClasses(selectedMunicipality === m)}
              >
                {m}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
        <CardHeader>
          <CardTitle>Orders ready for pooling</CardTitle>
          <CardDescription>
            Grouped by pickup municipality, biggest groups first — accepting one joins it
            into a shared route with any other order already pooled for the same
            pickup-and-delivery corridor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {unassignedGroups.length === 0 && (
            <p className="text-sm text-neutral-500">
              {selectedMunicipality
                ? `Nothing waiting for pickup in ${selectedMunicipality} right now.`
                : "Nothing waiting for pickup right now."}
            </p>
          )}
          {unassignedGroups.map(([municipality, groupOrders]) => (
            <div key={municipality}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="gold">Pickup: {municipality}</Badge>
                <span className="text-xs text-neutral-500">
                  {groupOrders.length} order{groupOrders.length === 1 ? "" : "s"} can be pooled into one route
                </span>
              </div>
              <div className="space-y-3">
                {groupOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-gold-200 bg-brand-gold-50/40 p-3"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">
                        Order #{o.id.slice(-8)} · {o.listing.cropType} · {o.volumeKg} kg
                      </p>
                      <p className="text-sm text-neutral-500">
                        {o.seller.name} ({municipality}) → {o.buyer.name} (
                        {o.buyer.municipality ?? "delivery location TBD"})
                      </p>
                      <p className="text-sm text-neutral-500">{formatPeso(o.totalAmount)} order value</p>
                      {o.haulerPayoutAmountPHP != null && (
                        <p className="text-sm font-medium text-brand-gold-700">
                          Your share: {o.appliedHaulerPayoutPercent ?? haulerSharePercent}% · Expected payout:{" "}
                          {formatPeso(o.haulerPayoutAmountPHP)}
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
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
        <CardHeader>
          <CardTitle>My routes</CardTitle>
          <CardDescription>Most actionable first — assigned and in-progress routes before delivered ones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedRoutes.length === 0 && (
            <p className="text-sm text-neutral-500">
              {selectedMunicipality ? `No routes touching ${selectedMunicipality}.` : "No routes assigned yet."}
            </p>
          )}
          {sortedRoutes.map((r) => {
            const routePayout = r.orders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);
            const dropoffMunicipalities = Array.from(
              new Set(r.orders.map((o) => o.buyer.municipality).filter((m): m is string => Boolean(m)))
            );
            const sharePercent = r.orders[0]?.appliedHaulerPayoutPercent ?? haulerSharePercent;
            return (
              <div key={r.id} className="rounded-lg border border-brand-green-200 bg-brand-green-50/30 p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Pool #{r.id.slice(-8)} — {r.orders.length} order{r.orders.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-sm text-neutral-500">
                      Pickup: {r.pickupPoints.join(", ")} → Delivery:{" "}
                      {dropoffMunicipalities.length > 0 ? dropoffMunicipalities.join(", ") : r.dropoffPoint}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {r.distanceKm} km · ETA {r.etaMinutes} min · total load{" "}
                      {r.orders.reduce((s, o) => s + o.volumeKg, 0)} kg
                    </p>
                    <p className="text-sm text-neutral-500">
                      Scheduled pickup:{" "}
                      {r.createdAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge tone={r.status === "DELIVERED" ? "green" : "gold"}>
                    {ROUTE_STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </div>

                <ul className="mb-3 space-y-1 text-sm text-neutral-600">
                  {r.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        Order #{o.id.slice(-8)} · {o.listing.cropType} · {o.volumeKg} kg · {o.seller.name} (
                        {o.listing.municipality}) → {o.buyer.name} ({o.buyer.municipality ?? "TBD"})
                      </span>
                      <Badge tone={o.status === "SETTLED" ? "green" : "gray"}>
                        {ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </li>
                  ))}
                </ul>

                {routePayout > 0 && (
                  <p className="mb-3 text-sm font-medium text-brand-gold-700">
                    Your share: {sharePercent}% of the logistics fee · Expected payout for this route:{" "}
                    {formatPeso(routePayout)}
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
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { cn, formatPeso } from "@/lib/utils";
import { acceptAndPoolOrder, advanceRouteStatus, setHaulerRefrigeratedVehicle } from "@/app/actions";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { getActiveCommissionConfigs, selectApplicableCommissionConfig } from "@/lib/commission";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { VerificationStatusCard } from "@/components/verification/verification-status-card";
import { LocationPingSender } from "@/components/hauler/location-ping-sender";
import { countUnreadHaulerMessages } from "@/lib/hauler-messaging";
import { HaulerChatPanel } from "@/components/order/hauler-chat-panel";
import { GatePassForm } from "@/components/hauler/gate-pass-form";
import { BackhaulFinder } from "@/components/hauler/backhaul-finder";
import { aggregateTripFreight } from "@/lib/freight";

// Maps each RouteStatus to the ACTION that advances it, and which of the 3
// user-facing steps (Pickup / In Transit / Delivered) it belongs to. The
// underlying status values and transition logic (advanceRouteStatus in
// src/app/actions.ts) are completely unchanged — only the display labels
// and grouping are new, per the mobile-simplification spec.
const NEXT_ACTION_LABEL_KEY: Record<string, string> = {
  ASSIGNED: "hauler.action.pickedUp",
  PICKED_UP: "hauler.action.startDelivery",
  IN_TRANSIT: "hauler.action.markDelivered",
};
const STEP_INDEX: Record<string, number> = {
  ASSIGNED: 0,
  PICKED_UP: 0,
  IN_TRANSIT: 1,
  DELIVERED: 2,
};
const STEP_LABEL_KEYS = ["hauler.step.pickup", "hauler.step.inTransit", "hauler.step.delivered"];

const MUNICIPALITIES = [
  "Cabanatuan City", "Gapan City", "San Jose City", "Palayan City",
  "Muñoz", "Talavera", "Guimba", "Jaen", "Zaragoza",
];
const ROUTE_URGENCY: Record<string, number> = { ASSIGNED: 0, PICKED_UP: 1, IN_TRANSIT: 2, DELIVERED: 3 };

function pillClasses(active: boolean) {
  return cn(
    "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active
      ? "border-brand-green-700 bg-brand-green-700 text-white"
      : "border-black/10 bg-white text-neutral-600"
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
  const locale = await getLocale();

  const [me, unassignedOrders, myRoutes, activeCommissionConfigs, unreadHaulerChatCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.order.findMany({
      where: { status: "ORDERED_ESCROWED" },
      include: { listing: true, buyer: true, seller: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pooledRoute.findMany({
      where: { haulerId: userId },
      include: { orders: { include: { listing: true, buyer: true, seller: true, inspection: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getActiveCommissionConfigs(),
    countUnreadHaulerMessages(userId),
  ]);

  const myOrders = myRoutes.flatMap((r) => r.orders);
  const settledOrders = myOrders.filter((o) => o.status === "SETTLED");
  const totalEarnings = settledOrders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);
  const pendingEscrowOrders = myOrders.filter((o) => o.status !== "SETTLED");
  const pendingEscrow = pendingEscrowOrders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);

  const defaultCommissionConfig = selectApplicableCommissionConfig(activeCommissionConfigs, "", 0);
  const haulerSharePercent = defaultCommissionConfig?.haulerPayoutPercentOfLogisticsFee ?? 75;

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
    return isPickup || isDropoff;
  }
  function matchesFilter(pickup: string, dropoff: string | null) {
    if (!selectedMunicipality) return true;
    return roleForMunicipality(selectedMunicipality, pickup, dropoff);
  }

  const filteredUnassigned = unassignedOrders.filter((o) => matchesFilter(o.listing.municipality, null));
  const filteredRoutes = myRoutes.filter((r) =>
    r.orders.some((o) => matchesFilter(o.listing.municipality, o.buyer.municipality ?? null))
  );

  const unassignedByMunicipality = new Map<string, typeof filteredUnassigned>();
  for (const o of filteredUnassigned) {
    const key = o.listing.municipality;
    if (!unassignedByMunicipality.has(key)) unassignedByMunicipality.set(key, []);
    unassignedByMunicipality.get(key)!.push(o);
  }
  const unassignedGroups = Array.from(unassignedByMunicipality.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  const activeRoutes = [...filteredRoutes]
    .filter((r) => r.status !== "DELIVERED")
    .sort((a, b) => (ROUTE_URGENCY[a.status] ?? 9) - (ROUTE_URGENCY[b.status] ?? 9));
  const deliveredRoutes = filteredRoutes.filter((r) => r.status === "DELIVERED");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t("hauler.title", locale)}</h1>
        </div>
        <StarRatingDisplay sum={me.ratingSum} count={me.ratingCount} />
      </div>

      <VerificationStatusCard idVerificationStatus={me.idVerificationStatus} kycStatus={me.kycStatus} />

      {/* FEATURE 2 — Cold-Chain Classification: self-declared vehicle
          capability, gates which orders acceptAndPoolOrder will let this
          hauler accept (server-enforced there, not just this checkbox). */}
      <Card className="overflow-hidden">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-neutral-900">🧊 {t("coldChain.vehicleLabel", locale)}</p>
            <p className="text-xs text-neutral-500">{t("coldChain.vehicleHint", locale)}</p>
          </div>
          <form action={setHaulerRefrigeratedVehicle} className="flex flex-wrap items-center gap-2">
            <select
              name="vehicleType"
              defaultValue={me.vehicleType ?? ""}
              aria-label="Vehicle type"
              className="h-9 rounded-lg border border-black/15 bg-white px-2 text-sm"
            >
              <option value="">Vehicle…</option>
              <option value="TEN_WHEELER">10-wheeler (12 t)</option>
              <option value="FORWARD_6W">Forward 6W (7 t)</option>
              <option value="CANTER_4W">Canter 4W (3.5 t)</option>
              <option value="VAN_L300">L300 van (1 t)</option>
            </select>
            <input
              id="hasRefrigeratedVehicle"
              name="hasRefrigeratedVehicle"
              type="checkbox"
              defaultChecked={me.hasRefrigeratedVehicle}
              className="h-4 w-4 accent-brand-green-700"
            />
            <Button type="submit" size="sm" variant="outline">
              {t("common.save", locale)}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Top stat cards — icon + big number, per spec */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-1 p-3 text-center">
            <span className="text-2xl">💰</span>
            <p className="text-[11px] leading-tight text-neutral-500">{t("hauler.stat.earnings", locale)}</p>
            <p className="text-base font-bold text-brand-green-700">{formatPeso(totalEarnings)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-1 p-3 text-center">
            <span className="text-2xl">⏳</span>
            <p className="text-[11px] leading-tight text-neutral-500">{t("hauler.stat.pending", locale)}</p>
            <p className="text-base font-bold text-brand-gold-600">{formatPeso(pendingEscrow)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-1 p-3 text-center">
            <span className="text-2xl">🤝</span>
            <p className="text-[11px] leading-tight text-neutral-500">{t("hauler.stat.share", locale)}</p>
            <p className="text-base font-bold text-neutral-900">{haulerSharePercent}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Large horizontally-scrollable municipality pills */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <a href="/hauler/dashboard" className={pillClasses(!selectedMunicipality)}>
          {t("common.any", locale)}
        </a>
        {municipalityOptions.map((m) => (
          <a
            key={m}
            href={`/hauler/dashboard?municipality=${encodeURIComponent(m)}`}
            className={pillClasses(selectedMunicipality === m)}
          >
            {m}
          </a>
        ))}
      </div>

      {/* Orders ready for pooling — big cards, minimal text, details hidden */}
      <div>
        <h2 className="mb-2 text-lg font-bold text-neutral-900">{t("hauler.readyForPooling", locale)}</h2>
        <div className="space-y-3">
          {unassignedGroups.length === 0 && (
            <p className="text-sm text-neutral-500">{t("hauler.noHistory", locale)}</p>
          )}
          {unassignedGroups.map(([municipality, groupOrders]) => {
            const totalLoad = groupOrders.reduce((s, o) => s + o.volumeKg, 0);
            const estEarnings = groupOrders.reduce(
              (s, o) => s + (o.haulerPayoutAmountPHP ?? 0),
              0
            );
            const cropTypes = [...new Set(groupOrders.map((o) => o.listing.cropType))].join(", ");
            const dropoffs = [...new Set(groupOrders.map((o) => o.buyer.municipality ?? "—"))].join(", ");
            return (
              <Card key={municipality} className="overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
                <CardContent className="space-y-2 p-4">
                  <p className="text-lg font-bold text-neutral-900">
                    {municipality} → {dropoffs}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {cropTypes} · {totalLoad} kg
                  </p>
                  <p className="text-sm text-neutral-500">
                    {t("hauler.pickupsCount", locale, { count: groupOrders.length })} · {t("hauler.estEarnings", locale)}: {formatPeso(estEarnings)}
                  </p>
                  <details className="text-sm text-neutral-500">
                    <summary className="cursor-pointer text-brand-green-700">{t("common.viewDetails", locale)}</summary>
                    <div className="mt-2 space-y-2">
                      {groupOrders.map((o) => {
                        const blocked = o.listing.requiresColdChain && !me.hasRefrigeratedVehicle;
                        return (
                          <div key={o.id} className="rounded-md border border-brand-gold-200 bg-brand-gold-50/40 p-2">
                            <p>
                              Order #{o.id.slice(-8)} · {o.listing.cropType} · {o.volumeKg} kg
                              {o.listing.requiresColdChain && (
                                <Badge tone="blue" className="ml-2 text-[10px]">
                                  🧊 {t("coldChain.badge", locale)}
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs">
                              {o.seller.name} → {o.buyer.name} · {formatPeso(o.totalAmount)}
                            </p>
                            <form action={acceptAndPoolOrder} className="mt-1">
                              <input type="hidden" name="orderId" value={o.id} />
                              <Button type="submit" size="sm" disabled={blocked}>
                                {blocked ? t("coldChain.needsRefrigeratedVehicle", locale) : t("hauler.acceptRoute", locale)}
                              </Button>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                  {/* One big Accept Route button pools every order in this
                      group's municipality one at a time via the same
                      acceptAndPoolOrder action (unchanged) — grabs the
                      first not-yet-accepted order in the group; subsequent
                      taps (or the per-order buttons under View Details)
                      handle the rest. Disabled (not hidden — FEATURE 2 spec:
                      "should not see (or should see disabled)") when that
                      first order needs cold-chain and this hauler doesn't
                      have one; the per-order buttons above still work
                      individually for any non-cold-chain orders in the group. */}
                  {groupOrders[0].listing.requiresColdChain && (
                    <Badge tone="blue" className="text-[10px]">
                      🧊 {t("coldChain.badge", locale)}
                    </Badge>
                  )}
                  <form action={acceptAndPoolOrder}>
                    <input type="hidden" name="orderId" value={groupOrders[0].id} />
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full text-base"
                      disabled={groupOrders[0].listing.requiresColdChain && !me.hasRefrigeratedVehicle}
                    >
                      {groupOrders[0].listing.requiresColdChain && !me.hasRefrigeratedVehicle
                        ? t("coldChain.needsRefrigeratedVehicle", locale)
                        : t("hauler.acceptRoute", locale)}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* My Routes — simple 3-step flow, one relevant action button */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-neutral-900">
          {t("hauler.myRoutes", locale)}
          {unreadHaulerChatCount > 0 && (
            <Badge tone="gold" className="text-[10px]">
              {unreadHaulerChatCount} new message{unreadHaulerChatCount === 1 ? "" : "s"}
            </Badge>
          )}
        </h2>
        <div className="space-y-3">
          {activeRoutes.length === 0 && (
            <p className="text-sm text-neutral-500">{t("hauler.noHistory", locale)}</p>
          )}
          {activeRoutes.map((r) => {
            const routePayout = r.orders.reduce((s, o) => s + (o.haulerPayoutAmountPHP ?? 0), 0);
            const sharePercent = r.orders[0]?.appliedHaulerPayoutPercent ?? haulerSharePercent;
            const dropoffMunicipalities = Array.from(
              new Set(r.orders.map((o) => o.buyer.municipality).filter((m): m is string => Boolean(m)))
            );
            const totalLoad = r.orders.reduce((s, o) => s + o.volumeKg, 0);
            const currentStep = STEP_INDEX[r.status] ?? 0;
            const cropTypes = [...new Set(r.orders.map((o) => o.listing.cropType))].join(", ");
            return (
              <Card key={r.id} className="overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
                <CardContent className="space-y-3 p-4">
                  <p className="text-lg font-bold text-neutral-900">
                    {r.pickupPoints.join(", ")} → {dropoffMunicipalities.length > 0 ? dropoffMunicipalities.join(", ") : r.dropoffPoint}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {cropTypes} · {totalLoad} kg
                    {r.distanceKm != null && ` · ${r.distanceKm} km`}
                  </p>

                  {(r.status === "PICKED_UP" || r.status === "IN_TRANSIT") && (
                    <LocationPingSender routeId={r.id} />
                  )}

                  {/* 3-step progress */}
                  <div className="flex items-center gap-1">
                    {STEP_LABEL_KEYS.map((key, i) => (
                      <div key={key} className="flex flex-1 items-center gap-1">
                        <div
                          className={cn(
                            "flex h-7 flex-1 items-center justify-center rounded-full text-xs font-semibold",
                            i < currentStep
                              ? "bg-brand-green-700 text-white"
                              : i === currentStep
                                ? "bg-brand-gold-500 text-white"
                                : "bg-neutral-100 text-neutral-400"
                          )}
                        >
                          {t(key, locale)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {routePayout > 0 && (
                    <p className="text-sm font-medium text-brand-gold-700">
                      {t("hauler.yourShareOf", locale, { pct: sharePercent })} · {t("hauler.expectedPayout", locale, { amount: formatPeso(routePayout) })}
                    </p>
                  )}

                  {(() => {
                    const trip = aggregateTripFreight(r.orders);
                    if (trip.perOrder.length === 0) return null;
                    return (
                      <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
                        <p className="font-semibold">Trip freight (per-order tariffs, aggregated)</p>
                        <p>
                          Freight {formatPeso(trip.grossFreight)} = base {formatPeso(trip.freightBase)} + toll {formatPeso(trip.tollApplied)}
                          {" · "}your payout <b>{formatPeso(trip.haulerPayout)}</b> (your share of base + 100% of toll)
                        </p>
                      </div>
                    );
                  })()}

                  {/* Pre-dispatch Gate Pass: required (with seller sign-off) before the trip can leave. */}
                  {r.orders.filter((o) => o.status === "POOLED").map((o) => (
                    <div key={`gp-${o.id}`} className="rounded-lg border border-black/10 p-3">
                      <p className="mb-1 text-sm font-medium">
                        Gate Pass · #{o.id.slice(-8)} · {o.listing.cropType} · {o.volumeKg} kg
                      </p>
                      <GatePassForm
                        orderId={o.id}
                        cropCategory={o.cropCategory ?? o.listing.cropCategory}
                        declaredKg={o.volumeKg}
                        existing={o.inspection ? { actualPickupWeightKg: o.inspection.actualPickupWeightKg, signedOff: Boolean(o.inspection.sellerSignedAt) } : null}
                      />
                    </div>
                  ))}

                  <details className="text-sm text-neutral-500">
                    <summary className="cursor-pointer text-brand-green-700">{t("common.viewDetails", locale)}</summary>
                    <ul className="mt-2 space-y-3">
                      {r.orders.map((o) => {
                        const f = o.freightSnapshot as null | { grossFreight: number; tollApplied: number; freightBase: number; haulerPayout: number; haulerSharePct: string | number; routeZone?: string; cropCategory?: string };
                        return (
                        <li key={o.id} className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              #{o.id.slice(-8)} · {o.seller.name} → {o.buyer.name}
                            </span>
                            <Badge tone={o.status === "SETTLED" ? "green" : "gray"}>
                              {t(`order.status.${o.status}`, locale)}
                            </Badge>
                          </div>
                          {/* FEATURE 4 — In-App Chat: the hauler is in the
                              middle of two separate threads per order. */}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <HaulerChatPanel
                              orderId={o.id}
                              chatRole="HAULER_TO_BUYER"
                              viewerId={userId}
                              title={`Chat with buyer (${o.buyer.name})`}
                            />
                            <HaulerChatPanel
                              orderId={o.id}
                              chatRole="HAULER_TO_SELLER"
                              viewerId={userId}
                              title={`Chat with seller (${o.seller.name})`}
                            />
                          </div>
                          {f && (
                            <p className="text-xs text-neutral-600">
                              Freight {formatPeso(f.grossFreight)} = base {formatPeso(f.freightBase)} + toll {formatPeso(f.tollApplied)} ·
                              your payout <b>{formatPeso(f.haulerPayout)}</b> ({f.routeZone} · {f.cropCategory})
                            </p>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                  </details>

                  {/* Only the ONE relevant action button — simplified
                      proof-of-delivery step per spec (same underlying
                      photoOfDelivery + notes fields, same required
                      validation, same advanceRouteStatus action). */}
                  <form action={advanceRouteStatus} className="space-y-3">
                    <input type="hidden" name="routeId" value={r.id} />
                    {r.status === "IN_TRANSIT" && (
                      <>
                        <div>
                          <Label htmlFor={`notes-${r.id}`}>{t("hauler.pod.addNote", locale)}</Label>
                          <Input id={`notes-${r.id}`} name="notes" />
                        </div>
                        <PhotoUpload
                          id={`photoOfDelivery-${r.id}`}
                          name="photoOfDelivery"
                          label={t("hauler.pod.uploadPhoto", locale)}
                          required
                        />
                      </>
                    )}
                    <Button type="submit" size="lg" variant="secondary" className="w-full text-base">
                      {r.status === "IN_TRANSIT" ? t("hauler.pod.complete", locale) : t(NEXT_ACTION_LABEL_KEY[r.status], locale)}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <BackhaulFinder
        haulerId={userId}
        dropoffMunicipalities={Array.from(
          new Set(
            activeRoutes.flatMap((r) => r.orders.map((o) => o.buyer.municipality).filter((m): m is string => Boolean(m)))
          )
        )}
      />

      {/* Delivery History — collapsed, completed routes only */}
      {deliveredRoutes.length > 0 && (
        <details className="rounded-lg border border-black/10 bg-white p-4">
          <summary className="cursor-pointer text-lg font-bold text-neutral-900">
            {t("hauler.deliveryHistory", locale)} ({deliveredRoutes.length})
          </summary>
          <div className="mt-3 space-y-2">
            {deliveredRoutes.map((r) => {
              const cropTypes = [...new Set(r.orders.map((o) => o.listing.cropType))].join(", ");
              const totalLoad = r.orders.reduce((s, o) => s + o.volumeKg, 0);
              return (
                <div key={r.id} className="rounded-md border border-black/10 p-3 text-sm">
                  <p className="font-medium text-neutral-900">
                    {r.pickupPoints.join(", ")} → {r.dropoffPoint} · {cropTypes} · {totalLoad} kg
                  </p>
                  <Badge tone="green" className="mt-1">
                    {t("route.status.DELIVERED", locale)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

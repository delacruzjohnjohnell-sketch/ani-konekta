import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { coordinatesForMunicipality, haversineDistanceKm } from "@/lib/municipality-coordinates";
import type { VehicleType, Prisma } from "@prisma/client";

/**
 * Load-deficit dispatch engine for scheduled pooled trips.
 *
 * At a trip's cutoff: utilization = bookedWeight / vehicle capacity.
 *   >= 60%  -> queue dispatch (level 0).
 *   <  60%  -> sequential contingency, stopping at the first level that
 *              lifts utilization to >= 60%:
 *     L1 right-size the vehicle (TEN_WHEELER/FORWARD_6W -> CANTER_4W -> VAN_L300)
 *     L2 cross-dock via the nearest active cooperative staging hub, merging
 *        compatible micro-lots WITHOUT transferring ownership to the coop
 *     L3 widen the collection catchment by up to +20 km (adjacent municipal orders)
 *     L4 prefer a verified inbound/return hauler with compatible
 *        capacity/destination/schedule (from declared HaulerAvailability)
 *   The level that resolved the deficit is stored on the route
 *   (deficitResolvedLevel) with a step-by-step dispatchLog. If nothing
 *   resolves it, the trip is flagged UNRESOLVED_LOW_UTILIZATION for an admin
 *   — nothing is fabricated.
 *
 * Vehicle capacities are planning defaults (kg), not measured payload ratings.
 */
export const VEHICLE_CAPACITY_KG: Record<VehicleType, number> = {
  TEN_WHEELER: 12000,
  FORWARD_6W: 7000,
  CANTER_4W: 3500,
  VAN_L300: 1000,
};
export const UTILIZATION_THRESHOLD = 0.6;
export const LEVEL3_EXTRA_KM = 20;
export const CROSSDOCK_MAX_HUB_KM = 30;
export const CROSSDOCK_MICRO_LOT_KG = 500;
export const DEFAULT_CUTOFF_HOURS = 6;

const LADDER: VehicleType[] = ["TEN_WHEELER", "FORWARD_6W", "CANTER_4W", "VAN_L300"];

export const utilization = (bookedKg: number, capacityKg: number) => (capacityKg > 0 ? bookedKg / capacityKg : 0);

/** Level 1 (pure): smallest vehicle at or below the current class that still safely fits the load. */
export function rightSizeVehicle(bookedKg: number, current: VehicleType): VehicleType {
  const startIdx = LADDER.indexOf(current);
  let best = current;
  for (let i = startIdx; i < LADDER.length; i++) {
    if (VEHICLE_CAPACITY_KG[LADDER[i]] >= bookedKg) best = LADDER[i];
  }
  return best;
}

type LogEntry = { level: number; action: string; result: string; [k: string]: unknown };

export async function evaluateTrip(routeId: string, actorId: string | null = null) {
  const route = await prisma.pooledRoute.findUniqueOrThrow({
    where: { id: routeId },
    include: { orders: { include: { listing: true } }, hauler: true },
  });
  if (route.status !== "ASSIGNED") return { routeId, skipped: "already dispatched" as const };

  let vehicle: VehicleType = route.vehicleType ?? "TEN_WHEELER";
  let capacity = route.capacityKg ?? VEHICLE_CAPACITY_KG[vehicle];
  let booked = route.orders.reduce((s, o) => s + o.volumeKg, 0);
  let haulerId = route.haulerId;
  const pickupPoints = [...route.pickupPoints];
  let crossDockCooperativeId: string | null = null;
  let resolvedLevel: number | null = null;
  const log: LogEntry[] = [];

  const pct = () => utilization(booked, capacity);
  log.push({ level: 0, action: "utilization check", result: `${(pct() * 100).toFixed(1)}% of ${capacity} kg (${vehicle})` });

  if (pct() >= UTILIZATION_THRESHOLD) {
    resolvedLevel = 0;
  }

  // Orders that could still be pooled onto this trip (same destination, cold-chain compatible).
  async function candidateOrders() {
    const rows = await prisma.order.findMany({
      where: { status: "ORDERED_ESCROWED", routeId: null },
      include: { listing: true, buyer: true },
    });
    return rows.filter(
      (o) =>
        (o.buyer.municipality?.trim() || "Buyer facility (TBD)") === route.dropoffPoint &&
        (!o.listing.requiresColdChain || route.hauler.hasRefrigeratedVehicle) &&
        booked + o.volumeKg <= capacity
    );
  }

  async function attach(orders: { id: string; volumeKg: number; listing: { municipality: string } }[]) {
    for (const o of orders) {
      if (booked + o.volumeKg > capacity) continue; // never overload the vehicle
      await prisma.order.update({ where: { id: o.id }, data: { routeId: route.id, status: "POOLED" } });
      booked += o.volumeKg;
      if (!pickupPoints.includes(o.listing.municipality)) pickupPoints.push(o.listing.municipality);
    }
  }

  // ---- Level 1: right-size the vehicle ----
  if (resolvedLevel === null) {
    const smaller = rightSizeVehicle(booked, vehicle);
    if (smaller !== vehicle) {
      const newCap = VEHICLE_CAPACITY_KG[smaller];
      const newPct = utilization(booked, newCap);
      log.push({ level: 1, action: `right-size ${vehicle} -> ${smaller}`, result: `${(newPct * 100).toFixed(1)}%` });
      // Adopt the smaller class even if it doesn't alone reach 60% — later levels then fill a smaller vehicle.
      vehicle = smaller;
      capacity = newCap;
      if (newPct >= UTILIZATION_THRESHOLD) resolvedLevel = 1;
    } else {
      log.push({ level: 1, action: "right-size", result: "no smaller safe vehicle class" });
    }
  }

  // ---- Level 2: cross-dock at the nearest active cooperative staging hub ----
  if (resolvedLevel === null) {
    const coops = await prisma.cooperative.findMany({ select: { id: true, name: true, municipality: true } });
    const centroid = pickupPoints.map(coordinatesForMunicipality);
    const origin = {
      lat: centroid.reduce((s, c) => s + c.lat, 0) / Math.max(1, centroid.length),
      lng: centroid.reduce((s, c) => s + c.lng, 0) / Math.max(1, centroid.length),
    };
    const hub = coops
      .map((c) => ({ ...c, km: haversineDistanceKm(origin, coordinatesForMunicipality(c.municipality)) }))
      .filter((c) => c.km <= CROSSDOCK_MAX_HUB_KM)
      .sort((a, b) => a.km - b.km)[0];
    if (!hub) {
      log.push({ level: 2, action: "cross-dock", result: `no active cooperative staging hub within ${CROSSDOCK_MAX_HUB_KM} km` });
    } else {
      const hubPoint = coordinatesForMunicipality(hub.municipality);
      const micro = (await candidateOrders()).filter(
        (o) =>
          o.volumeKg <= CROSSDOCK_MICRO_LOT_KG &&
          haversineDistanceKm(coordinatesForMunicipality(o.listing.municipality), hubPoint) <= CROSSDOCK_MAX_HUB_KM
      );
      const before = booked;
      await attach(micro);
      if (booked > before) crossDockCooperativeId = hub.id; // logistics cross-docking only — ownership is NOT transferred
      log.push({ level: 2, action: `cross-dock via ${hub.name} (${hub.km.toFixed(0)} km)`, result: `${micro.length} micro-lot(s) considered, +${booked - before} kg`, ownershipTransferred: false });
      if (pct() >= UTILIZATION_THRESHOLD) resolvedLevel = 2;
    }
  }

  // ---- Level 3: widen the collection catchment by up to +20 km ----
  if (resolvedLevel === null) {
    const pts = pickupPoints.map(coordinatesForMunicipality);
    const near = (await candidateOrders())
      .map((o) => ({
        o,
        km: Math.min(...pts.map((p) => haversineDistanceKm(p, coordinatesForMunicipality(o.listing.municipality)))),
      }))
      .filter((x) => x.km <= LEVEL3_EXTRA_KM)
      .sort((a, b) => a.km - b.km);
    const before = booked;
    await attach(near.map((x) => x.o));
    log.push({ level: 3, action: `widen catchment +${LEVEL3_EXTRA_KM} km`, result: `${near.length} adjacent order(s), +${booked - before} kg` });
    if (pct() >= UTILIZATION_THRESHOLD) resolvedLevel = 3;
  }

  // ---- Level 4: verified inbound/return hauler ----
  if (resolvedLevel === null) {
    const horizon = new Date(Date.now() + 24 * 3600_000);
    const needsReefer = route.orders.some((o) => o.listing.requiresColdChain);
    const avail = await prisma.haulerAvailability.findMany({
      where: { active: true, availableFrom: { lte: horizon }, capacityKg: { gte: booked } },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: avail.map((a) => a.haulerId) }, role: "HAULER", kycStatus: "KYC_VERIFIED" },
    });
    const ok = avail
      .filter((a) => pickupPoints.includes(a.destinationMunicipality))
      .filter((a) => {
        const u = users.find((x) => x.id === a.haulerId);
        return u && (!needsReefer || u.hasRefrigeratedVehicle) && utilization(booked, a.capacityKg) >= UTILIZATION_THRESHOLD;
      })
      .sort((a, b) => a.capacityKg - b.capacityKg)[0]; // tightest sufficient fit
    if (ok) {
      haulerId = ok.haulerId;
      capacity = ok.capacityKg;
      log.push({ level: 4, action: "reassign to verified return hauler", result: `hauler ${ok.haulerId}, ${(pct() * 100).toFixed(1)}%` });
      resolvedLevel = 4;
    } else {
      log.push({ level: 4, action: "return-hauler match", result: "no verified inbound hauler with compatible capacity/destination/schedule" });
    }
  }

  const decision = resolvedLevel !== null ? "QUEUED" : "UNRESOLVED_LOW_UTILIZATION";
  await prisma.pooledRoute.update({
    where: { id: routeId },
    data: {
      vehicleType: vehicle,
      capacityKg: capacity,
      utilizationPct: Math.round(pct() * 10000) / 100,
      dispatchDecision: decision,
      deficitResolvedLevel: resolvedLevel,
      dispatchLog: log as unknown as Prisma.InputJsonValue,
      pickupPoints,
      haulerId,
      crossDockCooperativeId,
    },
  });
  await audit(actorId, "TRIP_DISPATCH_EVALUATED", "PooledRoute", routeId, {
    decision, resolvedLevel, utilizationPct: Math.round(pct() * 10000) / 100, vehicle,
  });
  return { routeId, decision, resolvedLevel, utilizationPct: pct() * 100, log };
}

/** Evaluates every not-yet-evaluated ASSIGNED trip whose cutoff has passed. */
export async function evaluateDueTrips(now = new Date(), actorId: string | null = null) {
  const due = await prisma.pooledRoute.findMany({
    where: { status: "ASSIGNED", dispatchDecision: null, cutoffAt: { lte: now } },
    select: { id: true },
  });
  const out = [];
  for (const r of due) out.push(await evaluateTrip(r.id, actorId));
  return out;
}

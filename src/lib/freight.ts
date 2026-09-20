/**
 * Commodity freight tariff engine (route zone x crop category).
 *
 * Tariffs live in the CommodityFreightTariff table and are read fresh at
 * every checkout — Admin edits (/admin/tariffs) take effect immediately, with
 * no restart/redeploy. DEFAULT_TARIFFS below are SEED DEFAULTS only
 * (prisma/ensure-freight-tariffs.ts inserts them if a row is missing); they
 * are never consulted at checkout.
 *
 * All money math uses decimal.js (Prisma.Decimal) — never binary floats.
 */
import { Prisma } from "@prisma/client";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type RouteZoneName = "REGIONAL_MANILA" | "LOCAL_PROVINCIAL";
export type CropCategoryName = "GRAIN" | "VEGETABLE" | "FRUIT";

export interface TariffInput {
  id?: string | null;
  routeZone: RouteZoneName;
  cropCategory: CropCategoryName;
  ratePerKg: Prisma.Decimal.Value;
  baseFloorFee: Prisma.Decimal.Value;
  tollPassThrough: Prisma.Decimal.Value;
  haulerSharePct: Prisma.Decimal.Value;
  platformSharePct: Prisma.Decimal.Value;
}

export interface FreightBreakdown {
  tariffId: string | null;
  routeZone: RouteZoneName;
  cropCategory: CropCategoryName;
  weightKg: number;
  // Tariff values used (frozen into Order.freightSnapshot for auditability)
  ratePerKg: number;
  baseFloorFee: number;
  tollPassThrough: number;
  haulerSharePct: number;
  platformSharePct: number;
  // Computed components
  weightFreight: number; // weightKg x ratePerKg (before the floor)
  floorApplied: boolean;
  grossFreight: number; // MAX(baseFloorFee, weightFreight) — what the buyer pays
  tollApplied: number; // toll actually passed through (never more than gross)
  freightBase: number; // MAX(0, gross - tollPassThrough)
  haulerPayout: number; // freightBase x haulerShare + tollApplied
  platformMargin: number; // freightBase x platformShare
  computedAt: string;
}

export class FreightTariffMissingError extends Error {
  constructor(zone: string, category: string) {
    super(`No freight tariff configured for ${zone} / ${category}. An admin must add it at /admin/tariffs.`);
    this.name = "FreightTariffMissingError";
  }
}

/** Seed defaults ONLY — inserted if missing, never read at checkout. */
export const DEFAULT_TARIFFS: TariffInput[] = [
  { routeZone: "REGIONAL_MANILA", cropCategory: "GRAIN", ratePerKg: "2.50", baseFloorFee: "125", tollPassThrough: "1100", haulerSharePct: "0.88", platformSharePct: "0.12" },
  { routeZone: "REGIONAL_MANILA", cropCategory: "VEGETABLE", ratePerKg: "3.75", baseFloorFee: "175", tollPassThrough: "1100", haulerSharePct: "0.88", platformSharePct: "0.12" },
  { routeZone: "REGIONAL_MANILA", cropCategory: "FRUIT", ratePerKg: "3.50", baseFloorFee: "175", tollPassThrough: "1100", haulerSharePct: "0.88", platformSharePct: "0.12" },
  { routeZone: "LOCAL_PROVINCIAL", cropCategory: "GRAIN", ratePerKg: "0.60", baseFloorFee: "50", tollPassThrough: "0", haulerSharePct: "0.85", platformSharePct: "0.15" },
  { routeZone: "LOCAL_PROVINCIAL", cropCategory: "VEGETABLE", ratePerKg: "1.00", baseFloorFee: "70", tollPassThrough: "0", haulerSharePct: "0.85", platformSharePct: "0.15" },
  { routeZone: "LOCAL_PROVINCIAL", cropCategory: "FRUIT", ratePerKg: "0.90", baseFloorFee: "65", tollPassThrough: "0", haulerSharePct: "0.85", platformSharePct: "0.15" },
];

const METRO_MANILA_PATTERN =
  /manila|quezon city|makati|pasig|taguig|caloocan|valenzuela|mandaluyong|para[ñn]aque|las pi[ñn]as|marikina|pasay|muntinlupa|malabon|navotas|san juan|pateros|metro/i;

/** Delivery destination decides the zone: Metro Manila corridor vs local/provincial. */
export function routeZoneForMunicipality(municipality: string | null | undefined): RouteZoneName {
  return municipality && METRO_MANILA_PATTERN.test(municipality) ? "REGIONAL_MANILA" : "LOCAL_PROVINCIAL";
}

/** Pure freight calculation for one shipment. */
export function computeFreight(tariff: TariffInput, weightKg: number): FreightBreakdown {
  const haulerShare = D(tariff.haulerSharePct);
  const platformShare = D(tariff.platformSharePct);
  if (!haulerShare.plus(platformShare).equals(1)) {
    throw new Error("haulerSharePct + platformSharePct must equal 1.0000");
  }
  if (!(weightKg > 0)) throw new Error("Freight weight must be greater than zero.");

  const weight = D(weightKg);
  const rate = D(tariff.ratePerKg);
  const floor = D(tariff.baseFloorFee);
  const toll = D(tariff.tollPassThrough);

  const weightFreight = weight.mul(rate);
  const floorApplied = weightFreight.lessThan(floor);
  const gross = round2(floorApplied ? floor : weightFreight);
  // Spec: freightBase = MAX(0, gross - toll). The toll actually passed to the
  // hauler is capped at the gross freight collected, so a tiny shipment can
  // never make the platform pay out more freight than the buyer was charged.
  const tollApplied = Prisma.Decimal.min(toll, gross);
  const freightBase = Prisma.Decimal.max(D(0), gross.minus(toll));
  const platformMargin = round2(freightBase.mul(platformShare));
  const haulerBaseShare = freightBase.minus(platformMargin); // conserves every centavo
  const haulerPayout = haulerBaseShare.plus(tollApplied);

  return {
    tariffId: tariff.id ?? null,
    routeZone: tariff.routeZone,
    cropCategory: tariff.cropCategory,
    weightKg,
    ratePerKg: rate.toNumber(),
    baseFloorFee: floor.toNumber(),
    tollPassThrough: toll.toNumber(),
    haulerSharePct: haulerShare.toNumber(),
    platformSharePct: platformShare.toNumber(),
    weightFreight: round2(weightFreight).toNumber(),
    floorApplied,
    grossFreight: gross.toNumber(),
    tollApplied: tollApplied.toNumber(),
    freightBase: freightBase.toNumber(),
    haulerPayout: haulerPayout.toNumber(),
    platformMargin: platformMargin.toNumber(),
    computedAt: new Date().toISOString(),
  };
}

/** Reads the CURRENT tariff row (no caching — Admin edits apply instantly). */
export async function getCurrentTariff(zone: RouteZoneName, category: CropCategoryName) {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.commodityFreightTariff.findUnique({
    where: { routeZone_cropCategory: { routeZone: zone, cropCategory: category } },
  });
  if (!row) throw new FreightTariffMissingError(zone, category);
  return row;
}

export async function quoteFreight(
  zone: RouteZoneName,
  category: CropCategoryName,
  weightKg: number
): Promise<FreightBreakdown> {
  const t = await getCurrentTariff(zone, category);
  return computeFreight({ ...t, id: t.id }, weightKg);
}

/**
 * Mixed-commodity trips: freight is ledgered PER ORDER with each order's own
 * route+commodity tariff snapshot; a trip settlement just sums the per-order
 * components (never one tariff for the whole trip).
 */
export function aggregateTripFreight(orders: { freightSnapshot: unknown; id: string }[]) {
  const perOrder = orders
    .filter((o) => o.freightSnapshot)
    .map((o) => ({ orderId: o.id, ...(o.freightSnapshot as FreightBreakdown) }));
  const sum = (k: "grossFreight" | "tollApplied" | "freightBase" | "haulerPayout" | "platformMargin") =>
    perOrder.reduce((s, f) => s.plus(D(f[k] ?? 0)), D(0)).toNumber();
  return {
    perOrder,
    grossFreight: sum("grossFreight"),
    tollApplied: sum("tollApplied"),
    freightBase: sum("freightBase"),
    haulerPayout: sum("haulerPayout"),
    platformMargin: sum("platformMargin"),
  };
}

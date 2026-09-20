"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { computeFreight, type CropCategoryName, type FreightBreakdown, type RouteZoneName } from "@/lib/freight";
import type { ActionState } from "@/components/ui/action-form";

const ZONES: RouteZoneName[] = ["REGIONAL_MANILA", "LOCAL_PROVINCIAL"];
const CATEGORIES: CropCategoryName[] = ["GRAIN", "VEGETABLE", "FRUIT"];

function num(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** Shares are entered as percentages (88 / 12) and stored as 0-1 decimals. */
function parseTariff(fd: FormData) {
  const routeZone = String(fd.get("routeZone")) as RouteZoneName;
  const cropCategory = String(fd.get("cropCategory")) as CropCategoryName;
  if (!ZONES.includes(routeZone) || !CATEGORIES.includes(cropCategory)) throw new Error("Invalid route zone or crop category.");
  const ratePerKg = num(fd, "ratePerKg");
  const baseFloorFee = num(fd, "baseFloorFee");
  const tollPassThrough = num(fd, "tollPassThrough") ?? 0;
  const haulerPct = num(fd, "haulerSharePct");
  const platformPct = num(fd, "platformSharePct");
  for (const [k, v] of Object.entries({ ratePerKg, baseFloorFee, tollPassThrough, haulerPct, platformPct })) {
    if (v == null || Number.isNaN(v) || v < 0) throw new Error(`${k} must be a non-negative number.`);
  }
  if (!new Prisma.Decimal(haulerPct!).plus(platformPct!).equals(100)) {
    throw new Error("Hauler share % + platform share % must total exactly 100.");
  }
  return {
    routeZone,
    cropCategory,
    ratePerKg: String(ratePerKg),
    baseFloorFee: String(baseFloorFee),
    tollPassThrough: String(tollPassThrough),
    haulerSharePct: new Prisma.Decimal(haulerPct!).div(100).toString(),
    platformSharePct: new Prisma.Decimal(platformPct!).div(100).toString(),
  };
}

export async function saveTariff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  let data;
  try {
    data = parseTariff(fd);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid tariff." };
  }
  const key = { routeZone_cropCategory: { routeZone: data.routeZone, cropCategory: data.cropCategory } };
  const before = await prisma.commodityFreightTariff.findUnique({ where: key });
  const saved = await prisma.commodityFreightTariff.upsert({
    where: key,
    create: { ...data, updatedByAdminId: admin.id },
    update: { ...data, updatedByAdminId: admin.id },
  });
  await audit(admin.id, "TARIFF_UPDATED", "CommodityFreightTariff", saved.id, {
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: JSON.parse(JSON.stringify(saved)),
  });
  // Checkout reads the row fresh on every order — no cache to bust, no redeploy.
  revalidatePath("/admin/tariffs");
  return { success: true };
}

export type CalcState = { error?: string; result?: FreightBreakdown } | null;

/** Non-saving test calculator: current saved tariff with optional what-if overrides. */
export async function calculateFreightTest(_prev: CalcState, fd: FormData): Promise<CalcState> {
  await requireUser("ADMIN");
  try {
    const routeZone = String(fd.get("routeZone")) as RouteZoneName;
    const cropCategory = String(fd.get("cropCategory")) as CropCategoryName;
    const weightKg = num(fd, "weightKg");
    if (!weightKg || weightKg <= 0) return { error: "Enter a weight above zero." };
    const current = await prisma.commodityFreightTariff.findUnique({
      where: { routeZone_cropCategory: { routeZone, cropCategory } },
    });
    const ov = (k: string, fallback: unknown) => {
      const v = num(fd, k);
      return v == null ? (fallback as string | number) : v;
    };
    const haulerPct = num(fd, "haulerSharePct");
    const platformPct = num(fd, "platformSharePct");
    const result = computeFreight(
      {
        routeZone,
        cropCategory,
        ratePerKg: ov("ratePerKg", current?.ratePerKg ?? 0),
        baseFloorFee: ov("baseFloorFee", current?.baseFloorFee ?? 0),
        tollPassThrough: ov("tollPassThrough", current?.tollPassThrough ?? 0),
        haulerSharePct: haulerPct == null ? (current?.haulerSharePct ?? 0.85).toString() : new Prisma.Decimal(haulerPct).div(100).toString(),
        platformSharePct: platformPct == null ? (current?.platformSharePct ?? 0.15).toString() : new Prisma.Decimal(platformPct).div(100).toString(),
      },
      weightKg
    );
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Calculation failed." };
  }
}

export async function addBenchmark(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const cropType = String(fd.get("cropType") ?? "").trim();
  const source = String(fd.get("source") ?? "").trim();
  const pricePerKg = Number(fd.get("pricePerKg"));
  const asOfDate = new Date(String(fd.get("asOfDate")));
  if (!cropType || !source || !(pricePerKg > 0) || Number.isNaN(asOfDate.getTime())) {
    return { error: "Crop, price, source and as-of date are all required (no benchmark is invented)." };
  }
  const row = await prisma.benchmarkPrice.create({
    data: { cropType, pricePerKg, source, asOfDate, region: String(fd.get("region") ?? "").trim() || "Central Luzon", createdById: admin.id },
  });
  await audit(admin.id, "BENCHMARK_PRICE_ADDED", "BenchmarkPrice", row.id, { cropType, pricePerKg, source });
  revalidatePath("/admin/tariffs");
  revalidatePath("/seller/dashboard");
  return { success: true };
}

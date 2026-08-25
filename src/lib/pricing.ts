import { prisma } from "@/lib/prisma";

/**
 * PLACEHOLDER — AI-suggested fair price.
 *
 * This is a simple moving-average heuristic over recent PriceTrend records
 * for the same crop + municipality, with a small premium/discount applied
 * for quality tag. It stands in for the "AI pricing" feature described in
 * the business plan's Technology Roadmap; a real version would train on
 * live transaction data, seasonality, and regional demand signals.
 *
 * Formula (documented so it's easy to swap out):
 *   1. Take the last N PriceTrend rows for (cropType, municipality),
 *      ordered by recordedAt desc.
 *   2. Average them (simple moving average, not weighted).
 *   3. Apply a quality multiplier:
 *        GRADE_A        -> +8%
 *        ORGANIC        -> +15%
 *        GAP_CERTIFIED  -> +10%
 *        STANDARD       -> +0%
 *   4. If no history exists for that crop/municipality, fall back to a
 *      province-wide average for the crop, then to a flat default.
 */

const QUALITY_MULTIPLIER: Record<string, number> = {
  GRADE_A: 1.08,
  ORGANIC: 1.15,
  GAP_CERTIFIED: 1.1,
  STANDARD: 1.0,
};

const MOVING_AVERAGE_WINDOW = 6;
const FALLBACK_PRICE_PER_KG = 25; // last-resort default (₱/kg), e.g. palay wet season

export async function suggestFairPrice(
  cropType: string,
  municipality: string,
  qualityTag: string
): Promise<number> {
  const multiplier = QUALITY_MULTIPLIER[qualityTag] ?? 1.0;

  const local = await prisma.priceTrend.findMany({
    where: { cropType, municipality },
    orderBy: { recordedAt: "desc" },
    take: MOVING_AVERAGE_WINDOW,
  });

  if (local.length > 0) {
    const avg = local.reduce((s, r) => s + r.avgPricePerKg, 0) / local.length;
    return round2(avg * multiplier);
  }

  const provinceWide = await prisma.priceTrend.findMany({
    where: { cropType },
    orderBy: { recordedAt: "desc" },
    take: MOVING_AVERAGE_WINDOW,
  });

  if (provinceWide.length > 0) {
    const avg =
      provinceWide.reduce((s, r) => s + r.avgPricePerKg, 0) / provinceWide.length;
    return round2(avg * multiplier);
  }

  return round2(FALLBACK_PRICE_PER_KG * multiplier);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

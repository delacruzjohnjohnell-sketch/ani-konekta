import { prisma } from "@/lib/prisma";
import { suggestFairPrice } from "@/lib/pricing";
import { audit } from "@/lib/audit";
import type { CropCategory, GrainGrade, PackagingType, ProduceClass, OwnerType } from "@prisma/client";

/**
 * Single writer for Listing rows — the seller web form, SMS `LIST`, the
 * cooperative dashboard and the admin Offline Listing Desk all go through
 * createListingRecord(), so they produce identical backend records.
 *
 * Dual-track invariant (also enforced by the DB CHECK constraint
 * `listing_owner_invariant`):
 *   INDIVIDUAL_SELLER -> sellerId set, cooperativeId null
 *   COOPERATIVE       -> cooperativeId set, sellerId null
 */

const GRAIN_GRADES: GrainGrade[] = ["GRADE_1", "GRADE_2", "GRADE_3", "WET_UNCLASSIFIED"];
const PRODUCE_CLASSES: ProduceClass[] = ["CLASS_EXTRA", "CLASS_I", "CLASS_II", "SUBSTANDARD"];
const PACKAGING: PackagingType[] = ["CRATE", "SACK", "BOX", "BUNDLE"];
const CATEGORIES: CropCategory[] = ["GRAIN", "VEGETABLE", "FRUIT"];

export interface CommodityQuality {
  cropCategory: CropCategory;
  isGrainWet: boolean | null;
  moistureContentPercent: number | null;
  grainGrade: GrainGrade | null;
  produceClass: ProduceClass | null;
  packagingType: PackagingType | null;
  harvestTimestamp: Date | null;
}

/**
 * Commodity-adaptive quality validation: grain and fresh produce carry
 * different, non-interchangeable data. Irrelevant fields are nulled out.
 */
export function parseCommodityQuality(
  get: (key: string) => string | null,
  harvestDateFallback?: Date
): { ok: true; data: CommodityQuality } | { ok: false; error: string } {
  const cropCategory = (get("cropCategory") ?? "") as CropCategory;
  if (!CATEGORIES.includes(cropCategory)) return { ok: false, error: "Choose a crop category (Grain, Vegetable or Fruit)." };

  const empty = {
    isGrainWet: null,
    moistureContentPercent: null,
    grainGrade: null,
    produceClass: null,
    packagingType: null,
    harvestTimestamp: null,
  };

  if (cropCategory === "GRAIN") {
    const isGrainWet = get("isGrainWet") === "on" || get("isGrainWet") === "true";
    const moisture = Number(get("moistureContentPercent"));
    if (get("moistureContentPercent") === null || get("moistureContentPercent") === "" || !Number.isFinite(moisture) || moisture < 0 || moisture > 100) {
      return { ok: false, error: "Grain listings need a moisture content reading (0–100%)." };
    }
    let grainGrade = (get("grainGrade") ?? "") as GrainGrade;
    if (isGrainWet) grainGrade = "WET_UNCLASSIFIED"; // wet grain can't carry a standard grade
    if (!GRAIN_GRADES.includes(grainGrade)) return { ok: false, error: "Choose a grain grade." };
    if (!isGrainWet && grainGrade === "WET_UNCLASSIFIED") {
      return { ok: false, error: "Wet/unclassified grain must be flagged as wet." };
    }
    return { ok: true, data: { ...empty, cropCategory, isGrainWet, moistureContentPercent: moisture, grainGrade } };
  }

  const produceClass = (get("produceClass") ?? "") as ProduceClass;
  const packagingType = (get("packagingType") ?? "") as PackagingType;
  if (!PRODUCE_CLASSES.includes(produceClass)) return { ok: false, error: "Choose a produce class." };
  if (!PACKAGING.includes(packagingType)) return { ok: false, error: "Choose a packaging type." };
  const rawTs = get("harvestTimestamp");
  const harvestTimestamp = rawTs ? new Date(rawTs) : harvestDateFallback ?? null;
  if (!harvestTimestamp || Number.isNaN(harvestTimestamp.getTime())) {
    return { ok: false, error: "Fresh produce needs a harvest date/time." };
  }
  return { ok: true, data: { ...empty, cropCategory, produceClass, packagingType, harvestTimestamp } };
}

export interface CreateListingInput {
  ownerType: OwnerType;
  sellerId?: string | null;
  cooperativeId?: string | null;
  postedByUserId: string;
  cropType: string;
  variety?: string | null;
  volumeKg: number;
  harvestDate: Date;
  askingPricePerKg: number;
  qualityTag?: string;
  municipality: string;
  minOrderQtyKg?: number | null;
  description?: string | null;
  photoBlobKey?: string | null;
  requiresColdChain?: boolean;
  quality: CommodityQuality;
  assistedEntrySource?: string | null;
  assistedByUserId?: string | null;
}

export async function createListingRecord(input: CreateListingInput) {
  if (input.ownerType === "INDIVIDUAL_SELLER") {
    if (!input.sellerId || input.cooperativeId) {
      throw new Error("Individual listings need a seller and must not belong to a cooperative.");
    }
  } else if (!input.cooperativeId || input.sellerId) {
    throw new Error("Cooperative listings need a cooperative and must not have an individual seller.");
  }

  const aiSuggestedPricePerKg = await suggestFairPrice(input.cropType, input.municipality, input.qualityTag ?? "STANDARD");
  const q = input.quality;

  const listing = await prisma.listing.create({
    data: {
      ownerType: input.ownerType,
      sellerId: input.ownerType === "INDIVIDUAL_SELLER" ? input.sellerId! : null,
      cooperativeId: input.ownerType === "COOPERATIVE" ? input.cooperativeId! : null,
      postedByUserId: input.postedByUserId,
      assistedEntrySource: input.assistedEntrySource ?? null,
      assistedByUserId: input.assistedByUserId ?? null,
      cropType: input.cropType,
      variety: input.variety ?? null,
      volumeKg: input.volumeKg,
      harvestDate: input.harvestDate,
      askingPricePerKg: input.askingPricePerKg,
      aiSuggestedPricePerKg,
      qualityTag: (input.qualityTag ?? "STANDARD") as never,
      municipality: input.municipality,
      minOrderQtyKg: input.minOrderQtyKg ?? null,
      description: input.description ?? null,
      photoBlobKey: input.photoBlobKey ?? null,
      requiresColdChain: input.requiresColdChain ?? false,
      cropCategory: q.cropCategory,
      isGrainWet: q.isGrainWet,
      moistureContentPercent: q.moistureContentPercent,
      grainGrade: q.grainGrade,
      produceClass: q.produceClass,
      packagingType: q.packagingType,
      harvestTimestamp: q.harvestTimestamp,
    },
  });

  await audit(input.postedByUserId, "LISTING_CREATED", "Listing", listing.id, {
    ownerType: input.ownerType,
    sellerId: listing.sellerId,
    cooperativeId: listing.cooperativeId,
    cropCategory: q.cropCategory,
    assistedEntrySource: input.assistedEntrySource ?? null,
    assistedByUserId: input.assistedByUserId ?? null,
  });
  return listing;
}

/** The user account acting for the listing's owner (farmer, or the coop admin who posted it). */
export function actingSellerUserId(listing: { sellerId: string | null; postedByUserId: string | null }): string {
  const id = listing.sellerId ?? listing.postedByUserId;
  if (!id) throw new Error("Listing has no acting seller account.");
  return id;
}

/** Grouping key so a cart/bulk order never mixes owners. */
export function listingOwnerKey(listing: { sellerId: string | null; cooperativeId: string | null }): string {
  return listing.cooperativeId ? `coop:${listing.cooperativeId}` : `seller:${listing.sellerId}`;
}

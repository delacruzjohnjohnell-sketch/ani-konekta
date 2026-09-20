"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { createListingRecord, parseCommodityQuality } from "@/lib/listing-service";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";
import type { ActionState } from "@/components/ui/action-form";

const SOURCES = ["PHONE_CALL", "WALK_IN", "FIELD_AGENT", "SMS"];

/**
 * Offline Listing Desk: an admin keys in a listing on behalf of a farmer who
 * called or walked in. The FARMER remains the owner (sellerId = farmer,
 * ownerType INDIVIDUAL_SELLER, cooperativeId null); the admin is recorded only
 * as postedByUserId / assistedByUserId with the assisted-entry source.
 */
export async function createOfflineListing(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : null;
  };

  const phone = (get("farmerPhone") ?? "").trim();
  const farmer = phone ? await prisma.user.findUnique({ where: { phone } }) : null;
  if (!farmer || farmer.role !== "SELLER") {
    return { error: "No seller account with that phone number. The farmer must be registered first (they stay the listing owner)." };
  }
  const source = get("assistedEntrySource") ?? "";
  if (!SOURCES.includes(source)) return { error: "Choose how this listing was received." };

  const cropType = (get("cropType") ?? "").trim();
  const municipality = (get("municipality") ?? farmer.municipality ?? "").trim();
  const volumeKg = Number(get("volumeKg"));
  const askingPricePerKg = Number(get("askingPricePerKg"));
  const harvestDate = new Date(get("harvestDate") ?? "");
  if (!cropType || !municipality || !(volumeKg > 0) || !(askingPricePerKg > 0) || Number.isNaN(harvestDate.getTime())) {
    return { error: "Crop, municipality, volume, price and harvest date are required." };
  }

  const q = parseCommodityQuality(get, harvestDate);
  if (!q.ok) return { error: q.error };

  let photoBlobKey: string | null = null;
  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      photoBlobKey = await uploadPhoto(photo, "listings");
    } catch (e) {
      if (e instanceof PhotoValidationError) return { error: e.message };
      throw e;
    }
  }

  await createListingRecord({
    ownerType: "INDIVIDUAL_SELLER",
    sellerId: farmer.id,
    cooperativeId: null,
    postedByUserId: admin.id,
    cropType,
    variety: (get("variety") ?? "").trim() || null,
    volumeKg,
    harvestDate,
    askingPricePerKg,
    qualityTag: get("qualityTag") ?? "STANDARD",
    municipality,
    description: (get("description") ?? "").trim() || null,
    photoBlobKey,
    quality: q.data,
    assistedEntrySource: source,
    assistedByUserId: admin.id,
  });
  revalidatePath("/admin/offline-desk");
  revalidatePath("/buyer/dashboard");
  return { success: true };
}

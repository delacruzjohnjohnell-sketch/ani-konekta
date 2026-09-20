"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/action-form";

/**
 * A hauler's self-declared return/inbound availability. It is what dispatch
 * Level 4 (verified return hauler) reads — nothing here is inferred or
 * invented; it exists only if the hauler declared it.
 */
export async function declareReturnAvailability(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("HAULER");
  const origin = String(fd.get("originMunicipality") ?? "").trim();
  const destination = String(fd.get("destinationMunicipality") ?? "").trim();
  const capacityKg = Number(fd.get("capacityKg"));
  const availableFrom = new Date(String(fd.get("availableFrom")));
  if (!origin || !destination || !(capacityKg > 0) || Number.isNaN(availableFrom.getTime())) {
    return { error: "Origin, destination, spare capacity (kg) and availability time are required." };
  }
  const row = await prisma.haulerAvailability.create({
    data: { haulerId: user.id, originMunicipality: origin, destinationMunicipality: destination, capacityKg, availableFrom },
  });
  await audit(user.id, "HAULER_AVAILABILITY_DECLARED", "HaulerAvailability", row.id, { origin, destination, capacityKg });
  revalidatePath("/hauler/dashboard");
  return { success: true };
}

export async function deactivateAvailability(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("HAULER");
  const c = await prisma.haulerAvailability.updateMany({
    where: { id: String(fd.get("availabilityId")), haulerId: user.id, active: true },
    data: { active: false },
  });
  if (c.count === 0) return { error: "Availability not found." };
  revalidatePath("/hauler/dashboard");
  return { success: true };
}

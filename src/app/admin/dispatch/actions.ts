"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { evaluateDueTrips, evaluateTrip } from "@/lib/dispatch-engine";
import type { ActionState } from "@/components/ui/action-form";

export async function evaluateRouteNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  try {
    await evaluateTrip(String(fd.get("routeId")), admin.id);
  } catch (e) {
    console.error("[admin/dispatch] evaluateTrip", e);
    return { error: "Could not evaluate this trip." };
  }
  revalidatePath("/admin/dispatch");
  return { success: true };
}

export async function evaluateAllDue(): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  try {
    await evaluateDueTrips(new Date(), admin.id);
  } catch (e) {
    console.error("[admin/dispatch] evaluateDueTrips", e);
    return { error: "Evaluation failed." };
  }
  revalidatePath("/admin/dispatch");
  return { success: true };
}

/** Real return-load record for the Hauler Backhaul Finder. A missing price stays "not quoted". */
export async function addBackhaulCargo(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser("ADMIN");
  const pickup = String(fd.get("pickupMunicipality") ?? "").trim();
  const dest = String(fd.get("destinationMunicipality") ?? "").trim();
  const cargoType = String(fd.get("cargoType") ?? "").trim();
  const weightKg = Number(fd.get("weightKg"));
  const availableFrom = new Date(String(fd.get("availableFrom")));
  const priceRaw = String(fd.get("offeredPricePHP") ?? "").trim();
  const offeredPricePHP = priceRaw === "" ? null : Number(priceRaw);
  if (!pickup || !dest || !cargoType || !(weightKg > 0) || Number.isNaN(availableFrom.getTime())) {
    return { error: "Pickup, destination, cargo type, weight and availability date are required." };
  }
  if (offeredPricePHP != null && !(offeredPricePHP >= 0)) return { error: "Offered price must be zero or more." };
  const row = await prisma.backhaulCargo.create({
    data: {
      pickupMunicipality: pickup,
      destinationMunicipality: dest,
      cargoType,
      weightKg,
      availableFrom,
      offeredPricePHP,
      notes: String(fd.get("notes") ?? "").trim() || null,
    },
  });
  await audit(admin.id, "BACKHAUL_CARGO_ADDED", "BackhaulCargo", row.id, { pickup, dest, cargoType, weightKg, offeredPricePHP });
  revalidatePath("/admin/dispatch");
  return { success: true };
}

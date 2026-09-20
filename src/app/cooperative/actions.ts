"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { createListingRecord, parseCommodityQuality } from "@/lib/listing-service";
import { uploadPhoto, PhotoValidationError } from "@/lib/blob-storage";
import type { ActionState } from "@/components/ui/action-form";

/** Resolves the acting cooperative admin and THEIR cooperative from the DB (never from client input). */
async function coopContext() {
  const user = await requireUser("COOPERATIVE_ADMIN");
  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { cooperativeId: true } });
  if (!db?.cooperativeId) throw new Error("No cooperative is linked to this account.");
  return { user, cooperativeId: db.cooperativeId };
}

function fail(e: unknown): ActionState {
  console.error("[cooperative]", e);
  return { error: e instanceof Error && e.message.startsWith("No cooperative") ? e.message : "Something went wrong. Please try again." };
}

async function ownMember(memberId: string, cooperativeId: string) {
  const m = await prisma.cooperativeMember.findUnique({ where: { id: memberId } });
  return m && m.cooperativeId === cooperativeId ? m : null;
}

export async function addMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const name = String(fd.get("name") ?? "").trim();
    const pct = Number(fd.get("deductionPct") ?? 0);
    if (!name) return { error: "Member name is required." };
    if (!(pct >= 0 && pct <= 100)) return { error: "Deduction % must be between 0 and 100." };
    const m = await prisma.cooperativeMember.create({
      data: {
        cooperativeId,
        name,
        phone: String(fd.get("phone") ?? "").trim() || null,
        deductionPct: new Prisma.Decimal(pct).div(100).toString(),
      },
    });
    await audit(user.id, "COOP_MEMBER_ADDED", "CooperativeMember", m.id, { cooperativeId, name });
    revalidatePath("/cooperative/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberDeduction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const member = await ownMember(String(fd.get("memberId")), cooperativeId);
    if (!member) return { error: "Member not found." };
    const pct = Number(fd.get("deductionPct"));
    if (!(pct >= 0 && pct <= 100)) return { error: "Deduction % must be between 0 and 100." };
    await prisma.cooperativeMember.update({ where: { id: member.id }, data: { deductionPct: new Prisma.Decimal(pct).div(100).toString() } });
    await audit(user.id, "COOP_MEMBER_DEDUCTION_RATE_SET", "CooperativeMember", member.id, {
      before: Number(member.deductionPct), after: pct / 100,
    });
    revalidatePath("/cooperative/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

/** Issues a loan: debt increases atomically and an immutable ledger row records the new balance. */
export async function issueLoan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const member = await ownMember(String(fd.get("memberId")), cooperativeId);
    if (!member) return { error: "Member not found." };
    const amount = Number(fd.get("amountPHP"));
    if (!(amount > 0)) return { error: "Enter a loan amount above zero." };
    const note = String(fd.get("note") ?? "").trim() || null;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.cooperativeMember.update({
        where: { id: member.id },
        data: { outstandingDebtPHP: { increment: amount.toFixed(2) } },
      });
      await tx.loanLedgerEntry.create({
        data: { memberId: member.id, type: "LOAN_ISSUED", amountPHP: amount.toFixed(2), balanceAfterPHP: updated.outstandingDebtPHP, note },
      });
      await audit(user.id, "COOP_LOAN_ISSUED", "CooperativeMember", member.id, { amount, balanceAfter: updated.outstandingDebtPHP.toString() }, tx);
    });
    revalidatePath("/cooperative/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

/** Consolidated bulk lot: creates the COOPERATIVE-owned listing plus per-member contributions (w_<memberId> fields). */
export async function createBulkLot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : null;
    };
    const coop = await prisma.cooperative.findUniqueOrThrow({ where: { id: cooperativeId } });
    const members = await prisma.cooperativeMember.findMany({ where: { cooperativeId } });

    const cropType = (get("cropType") ?? "").trim();
    const askingPricePerKg = Number(get("askingPricePerKg"));
    const harvestDate = new Date(get("harvestDate") ?? "");
    const municipality = (get("municipality") ?? coop.municipality).trim();
    if (!cropType || !(askingPricePerKg > 0) || Number.isNaN(harvestDate.getTime())) {
      return { error: "Crop, asking price and harvest date are required." };
    }

    const contributions = members
      .map((m) => ({ memberId: m.id, weightKg: Number(get(`w_${m.id}`) ?? 0) }))
      .filter((c) => c.weightKg > 0);
    if (contributions.length === 0) return { error: "Enter at least one member's contributed weight." };
    const totalWeightKg = contributions.reduce((s, c) => s + c.weightKg, 0);

    const q = parseCommodityQuality(get, harvestDate);
    if (!q.ok) return { error: q.error };

    const photo = fd.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return { error: "A lot photo is required." };
    let photoBlobKey: string;
    try {
      photoBlobKey = await uploadPhoto(photo, "listings");
    } catch (e) {
      return { error: e instanceof PhotoValidationError ? e.message : "Photo upload failed." };
    }

    const listing = await createListingRecord({
      ownerType: "COOPERATIVE",
      sellerId: null,
      cooperativeId,
      postedByUserId: user.id,
      cropType,
      volumeKg: totalWeightKg,
      harvestDate,
      askingPricePerKg,
      qualityTag: get("qualityTag") ?? "STANDARD",
      municipality,
      description: (get("description") ?? "").trim() || null,
      photoBlobKey,
      quality: q.data,
    });

    await prisma.$transaction(async (tx) => {
      const lot = await tx.consolidatedLot.create({
        data: { cooperativeId, cropType, cropCategory: q.data.cropCategory, totalWeightKg, listingId: listing.id },
      });
      await tx.lotContribution.createMany({ data: contributions.map((c) => ({ lotId: lot.id, ...c })) });
      await audit(user.id, "COOP_LOT_CREATED", "ConsolidatedLot", lot.id, { listingId: listing.id, totalWeightKg, members: contributions.length }, tx);
    });
    revalidatePath("/cooperative/dashboard");
    revalidatePath("/buyer/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staging-hub weighbridge tickets: DROP_OFF (member delivers) and DISPATCH (lot leaves for a buyer/route). */
export async function createStagingTicket(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const kind = String(fd.get("kind"));
    if (kind !== "DROP_OFF" && kind !== "DISPATCH") return { error: "Choose a ticket type." };
    const ticketNo = String(fd.get("weighbridgeTicketNo") ?? "").trim();
    const cropType = String(fd.get("cropType") ?? "").trim();
    const weightKg = Number(fd.get("weightKg"));
    if (!ticketNo || !cropType || !(weightKg > 0)) return { error: "Ticket number, crop and weight are required." };

    let memberId: string | null = null;
    const memberRaw = String(fd.get("memberId") ?? "");
    if (memberRaw) {
      const m = await ownMember(memberRaw, cooperativeId);
      if (!m) return { error: "Member not found." };
      memberId = m.id;
    }
    let orderId: string | null = null;
    const orderRaw = String(fd.get("orderId") ?? "").trim();
    if (orderRaw) {
      const o = await prisma.order.findUnique({ where: { id: orderRaw }, select: { id: true, cooperativeId: true } });
      if (!o || o.cooperativeId !== cooperativeId) return { error: "That order does not belong to your cooperative." };
      orderId = o.id;
    }
    const t = await prisma.stagingHubTicket.create({
      data: {
        cooperativeId, kind, memberId, orderId, weighbridgeTicketNo: ticketNo, cropType, weightKg,
        batchCode: String(fd.get("batchCode") ?? "").trim() || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
      },
    });
    await audit(user.id, "STAGING_TICKET_CREATED", "StagingHubTicket", t.id, { kind, ticketNo, weightKg, orderId });
    revalidatePath("/cooperative/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

/** Settlement bank / e-wallet details. Stored on the cooperative, readable only by its admin and ADMIN. */
export async function saveBankInfo(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user, cooperativeId } = await coopContext();
    const info = String(fd.get("bankInfo") ?? "").trim();
    await prisma.cooperative.update({ where: { id: cooperativeId }, data: { bankInfo: info || null } });
    await audit(user.id, "COOP_BANK_INFO_UPDATED", "Cooperative", cooperativeId, { updated: true }); // value deliberately not logged
    revalidatePath("/cooperative/dashboard");
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentProvider } from "@/lib/payments";
import { audit } from "@/lib/audit";
import { createInvoiceDocuments } from "@/lib/invoicing";
import { walletReleaseForOrder, walletPartialRelease, walletResolveHeld } from "@/lib/wallet";

/**
 * Third-party SETTLEMENT service. ANI-KONEKTA does not hold customer funds:
 * every movement goes through `paymentProvider` (src/lib/payments.ts), which
 * is a simulated settlement-partner abstraction until a real, authorized
 * partner is integrated.
 *
 * Every release path (buyer receipt, 24h auto-release, admin dual approval,
 * dispute mediation) funnels through this file so payout math, cooperative
 * loan deductions, wallet accounting, invoices and audit rows are identical
 * everywhere. Each mutation is guarded by a compare-and-swap on the order's
 * current status/escrowStatus, so retries and races can never double-pay.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const r2d = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const r2 = (n: number) => r2d(D(n)).toNumber();

export class SettlementError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "SettlementError";
  }
}

// --------------------------------------------------------------------------
// Pure money math (unit-tested in scripts/acceptance-tests.ts)
// --------------------------------------------------------------------------

/** Undisputed fraction = acceptedWeight / baseline; only the disputed fraction is held. */
export function splitPartialRelease(
  sellerNetPHP: number,
  commissionPHP: number,
  acceptedKg: number,
  baselineKg: number
) {
  const releasedSellerNet = r2d(D(sellerNetPHP).mul(acceptedKg).div(baselineKg));
  const releasedCommission = r2d(D(commissionPHP).mul(acceptedKg).div(baselineKg));
  return {
    acceptedRatio: D(acceptedKg).div(baselineKg).toNumber(),
    releasedSellerNet: releasedSellerNet.toNumber(),
    heldSellerNet: D(sellerNetPHP).minus(releasedSellerNet).toNumber(),
    releasedCommission: releasedCommission.toNumber(),
    heldCommission: D(commissionPHP).minus(releasedCommission).toNumber(),
  };
}

/** Distributes the held amounts per the mediation outcome. sellerPct is 0-100. */
export function resolveHeldAmounts(
  heldSellerNetPHP: number,
  heldCommissionPHP: number,
  type: "SELLER_RELEASE" | "BUYER_REFUND" | "SPLIT",
  sellerPct?: number | null
) {
  const share = type === "SELLER_RELEASE" ? D(1) : type === "BUYER_REFUND" ? D(0) : D(sellerPct ?? 0).div(100);
  if (share.lessThan(0) || share.greaterThan(1)) throw new SettlementError("Split percentage must be 0–100.");
  const sellerNet = r2d(D(heldSellerNetPHP).mul(share));
  const commission = r2d(D(heldCommissionPHP).mul(share));
  const refund = D(heldSellerNetPHP).plus(heldCommissionPHP).minus(sellerNet).minus(commission);
  return { sellerNet: sellerNet.toNumber(), commission: commission.toNumber(), refund: refund.toNumber() };
}

/**
 * Cooperative member deduction for one proceeds tranche: never exceeds the
 * outstanding debt (nor the tranche's proceeds).
 */
export function computeMemberDeduction(proceedsPHP: number, deductionPct: number, outstandingDebtPHP: number) {
  const wanted = r2d(D(proceedsPHP).mul(deductionPct));
  const deduction = Prisma.Decimal.min(wanted, D(outstandingDebtPHP), D(proceedsPHP));
  const d = deduction.lessThan(0) ? D(0) : deduction;
  return { deduction: d.toNumber(), memberNet: D(proceedsPHP).minus(d).toNumber() };
}

// --------------------------------------------------------------------------
// Amounts snapshot for an order
// --------------------------------------------------------------------------
type OrderMoney = {
  totalAmount: number;
  sellerCommissionAmountPHP: number | null;
  netPayoutToSellerPHP: number | null;
  haulerPayoutAmountPHP: number | null;
};
export function orderAmounts(order: OrderMoney) {
  const commission = order.sellerCommissionAmountPHP ?? 0;
  // Independent seller payout = merchandise - platform commission ONLY.
  const sellerNet = order.netPayoutToSellerPHP ?? r2(order.totalAmount - commission);
  return { merchandise: order.totalAmount, commission, sellerNet, haulerPayout: order.haulerPayoutAmountPHP ?? 0 };
}

// --------------------------------------------------------------------------
// Cooperative proceeds -> members, with capped loan deductions
// --------------------------------------------------------------------------
/**
 * Applies ONLY to cooperative-owned orders (independent sellers never
 * reach this code path). Allocates `amountPHP` across the contributors of
 * the consolidated lot backing the listing, pro rata by contributed weight,
 * and takes each member's configured deduction — capped at their
 * outstanding debt. Idempotent per (order, member, tranche).
 */
export async function distributeCooperativeProceeds(
  order: { id: string; ownerType: string; cooperativeId: string | null; listingId: string },
  amountPHP: number,
  tranche: string
) {
  if (order.ownerType !== "COOPERATIVE" || !order.cooperativeId || amountPHP <= 0) return;

  const lots = await prisma.consolidatedLot.findMany({
    where: { listingId: order.listingId, cooperativeId: order.cooperativeId },
    include: { contributions: true },
  });
  const contributions = lots.flatMap((l) => l.contributions);
  const totalWeight = contributions.reduce((s, c) => s.plus(c.weightKg), D(0));
  if (contributions.length === 0 || totalWeight.lessThanOrEqualTo(0)) return; // whole amount stays with the cooperative

  // Merge repeated members; allocate pro rata with the rounding remainder on the last member.
  const byMember = new Map<string, Prisma.Decimal>();
  for (const c of contributions) byMember.set(c.memberId, (byMember.get(c.memberId) ?? D(0)).plus(c.weightKg));
  const entries = [...byMember.entries()];
  let allocated = D(0);

  for (let i = 0; i < entries.length; i++) {
    const [memberId, weight] = entries[i];
    const proceeds =
      i === entries.length - 1 ? D(amountPHP).minus(allocated) : r2d(D(amountPHP).mul(weight).div(totalWeight));
    allocated = allocated.plus(proceeds);

    await prisma.$transaction(async (tx) => {
      const already = await tx.memberSettlement.findUnique({
        where: { orderId_memberId_tranche: { orderId: order.id, memberId, tranche } },
      });
      if (already) return;
      const member = await tx.cooperativeMember.findUniqueOrThrow({ where: { id: memberId } });
      if (member.cooperativeId !== order.cooperativeId) return; // never cross cooperatives
      const { deduction, memberNet } = computeMemberDeduction(
        proceeds.toNumber(),
        Number(member.deductionPct),
        Number(member.outstandingDebtPHP)
      );
      await tx.memberSettlement.create({
        data: {
          orderId: order.id,
          memberId,
          tranche,
          proceedsPHP: proceeds.toString(),
          deductionPHP: deduction.toString(),
          memberNetPHP: memberNet.toString(),
        },
      });
      if (deduction > 0) {
        const balanceAfter = D(member.outstandingDebtPHP).minus(deduction);
        await tx.cooperativeMember.update({
          where: { id: memberId },
          data: { outstandingDebtPHP: balanceAfter.toString() },
        });
        await tx.loanLedgerEntry.create({
          data: {
            memberId,
            type: "REPAYMENT_DEDUCTION",
            amountPHP: deduction.toString(),
            balanceAfterPHP: balanceAfter.toString(),
            orderId: order.id,
            note: `Auto-deduction from ${tranche} proceeds`,
          },
        });
        await audit(null, "COOP_MEMBER_DEDUCTION", "CooperativeMember", memberId, {
          orderId: order.id, tranche, proceeds: proceeds.toNumber(), deduction,
        }, tx);
      }
    });
  }
}

/** Seller-side payout: routes to the cooperative or the individual seller, never mixing the two. */
async function payoutSeller(
  order: { id: string; sellerId: string; ownerType: string; cooperativeId: string | null; listingId: string },
  amountPHP: number,
  tranche: string
) {
  if (amountPHP <= 0) return;
  const recipient = order.ownerType === "COOPERATIVE" && order.cooperativeId ? `coop:${order.cooperativeId}` : order.sellerId;
  await paymentProvider.releaseFunds({ orderId: order.id, amount: amountPHP, sellerId: recipient });
  await distributeCooperativeProceeds(order, amountPHP, tranche);
}

// --------------------------------------------------------------------------
// Full release (buyer full acceptance, auto-timeout, admin dual approval)
// --------------------------------------------------------------------------
export async function releaseFullSettlement(
  orderId: string,
  opts: {
    triggerType: "BUYER_CONFIRM" | "AUTO_TIMEOUT" | "ADMIN_DUAL_APPROVAL";
    actorId: string; // userId or "SYSTEM"
    fromStatus: "DELIVERED" | "DISPUTED";
    metadata?: Prisma.InputJsonValue;
  }
): Promise<boolean> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { route: true, inspection: true },
  });
  const baseline = order.inspection?.actualPickupWeightKg ?? order.volumeKg;

  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: opts.fromStatus, escrowStatus: "HELD" },
    data: {
      status: "SETTLED",
      escrowStatus: "RELEASED",
      acceptedWeightKg: order.acceptedWeightKg ?? baseline,
      disputedWeightKg: order.disputedWeightKg ?? 0,
    },
  });
  if (claimed.count === 0) return false; // already settled through another path

  const a = orderAmounts(order);
  await payoutSeller(order, a.sellerNet, "FINAL");
  if (a.haulerPayout > 0 && order.route) {
    await paymentProvider.payHauler({ orderId, amount: a.haulerPayout, haulerId: order.route.haulerId });
  }
  await prisma.$transaction((tx) => walletReleaseForOrder(tx, orderId));

  await prisma.escrowEvent.create({
    data: {
      orderId,
      fromStatus: opts.fromStatus,
      toStatus: "SETTLED",
      triggeredBy: opts.actorId,
      triggerType: opts.triggerType,
      metadata: opts.metadata,
    },
  });
  await audit(opts.actorId === "SYSTEM" ? null : opts.actorId, "SETTLEMENT_RELEASED_FULL", "Order", orderId, {
    triggerType: opts.triggerType, sellerNetPHP: a.sellerNet, haulerPayoutPHP: a.haulerPayout,
  });
  await createInvoiceDocuments(orderId);
  return true;
}

// --------------------------------------------------------------------------
// Dockside receiving: full or partial acceptance
// --------------------------------------------------------------------------
export interface ReceiptInput {
  acceptedWeightKg: number;
  disputedWeightKg: number;
  reason?: string | null;
  dockPhotoUrls: string[];
}

export async function applyReceipt(orderId: string, buyerId: string, input: ReceiptInput) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { inspection: true, receipt: true, route: true, proofOfDelivery: true },
  });
  if (!order) throw new SettlementError("Order not found.", 404);
  if (order.buyerId !== buyerId) throw new SettlementError("Not your order.", 403);
  if (order.receipt || order.status === "SETTLED" || order.status === "DISPUTED") {
    throw new SettlementError("Receipt was already confirmed for this order.", 409);
  }
  if (order.status !== "DELIVERED") throw new SettlementError("Order is not delivered yet.", 409);
  if (!order.proofOfDelivery) throw new SettlementError("No proof of delivery on record for this order.", 409);

  const accepted = Number(input.acceptedWeightKg);
  const disputed = Number(input.disputedWeightKg);
  if (!Number.isFinite(accepted) || !Number.isFinite(disputed) || accepted < 0 || disputed < 0) {
    throw new SettlementError("Weights must be non-negative numbers.", 422);
  }
  // Baseline = locked origin (Gate Pass) weight; legacy orders fall back to the ordered volume.
  const baseline = order.inspection?.actualPickupWeightKg ?? order.volumeKg;
  if (Math.abs(accepted + disputed - baseline) > 0.01) {
    throw new SettlementError(
      `Accepted + disputed weight (${accepted + disputed} kg) must equal the delivered baseline (${baseline} kg).`,
      422
    );
  }

  if (disputed > 0) {
    // The 2-hour window runs from the SERVER-recorded dock arrival — the buyer's clock is never consulted.
    if (order.receivingWindowEndsAt && new Date() > order.receivingWindowEndsAt) {
      throw new SettlementError("The 2-hour receiving inspection window has closed; a partial dispute can no longer be filed.", 409);
    }
    if (!input.reason?.trim()) throw new SettlementError("A reason is required when disputing weight.", 422);
    if (input.dockPhotoUrls.length === 0) throw new SettlementError("Dock photo evidence is required when disputing weight.", 422);
  }

  const a = orderAmounts(order);

  if (disputed === 0) {
    const released = await releaseFullSettlement(orderId, {
      triggerType: "BUYER_CONFIRM",
      actorId: buyerId,
      fromStatus: "DELIVERED",
      metadata: { proofOfDeliveryId: order.proofOfDelivery.id, acceptedWeightKg: accepted },
    });
    if (!released) return { outcome: "ALREADY_PROCESSED" as const };

    await prisma.orderReceipt.create({
      data: { orderId, buyerId, baselineWeightKg: baseline, acceptedWeightKg: accepted, disputedWeightKg: 0, reason: input.reason ?? null, dockPhotoUrls: input.dockPhotoUrls },
    });
    await prisma.proofOfDelivery.update({ where: { orderId }, data: { confirmedByBuyer: true } });
    await prisma.reputationEvent.create({ data: { userId: order.sellerId, orderId, type: "ON_TIME", delta: 5 } });
    await prisma.reputationEvent.create({ data: { userId: order.buyerId, orderId, type: "ON_TIME", delta: 2 } });
    await prisma.user.update({ where: { id: order.sellerId }, data: { reputationScore: { increment: 5 } } });
    await prisma.user.update({ where: { id: order.buyerId }, data: { reputationScore: { increment: 2 } } });
    return { outcome: "FULL_RELEASE" as const, releasedRatio: 1 };
  }

  // ---- Partial: release the undisputed fraction now, hold ONLY the disputed fraction ----
  const split = splitPartialRelease(a.sellerNet, a.commission, accepted, baseline);
  const proceeded = await prisma.$transaction(async (tx) => {
    const c = await tx.order.updateMany({
      where: { id: orderId, status: "DELIVERED", escrowStatus: "HELD" },
      data: {
        status: "DISPUTED",
        escrowStatus: "PARTIALLY_RELEASED",
        acceptedWeightKg: accepted,
        disputedWeightKg: disputed,
        heldSellerNetPHP: split.heldSellerNet,
        heldCommissionPHP: split.heldCommission,
      },
    });
    if (c.count === 0) return false;
    await tx.orderReceipt.create({
      data: { orderId, buyerId, baselineWeightKg: baseline, acceptedWeightKg: accepted, disputedWeightKg: disputed, reason: input.reason!.trim(), dockPhotoUrls: input.dockPhotoUrls },
    });
    await tx.orderSettlementDispute.create({
      data: { orderId, disputedWeightKg: disputed, heldSellerNetPHP: split.heldSellerNet, heldCommissionPHP: split.heldCommission, reason: input.reason!.trim() },
    });
    await walletPartialRelease(tx, orderId, split.heldSellerNet + split.heldCommission);
    await tx.escrowEvent.create({
      data: {
        orderId, fromStatus: "DELIVERED", toStatus: "PARTIALLY_RELEASED", triggeredBy: buyerId, triggerType: "BUYER_PARTIAL_RECEIPT",
        metadata: { acceptedWeightKg: accepted, disputedWeightKg: disputed, baselineWeightKg: baseline, ...split },
      },
    });
    await audit(buyerId, "RECEIPT_PARTIAL_DISPUTE", "Order", orderId, { accepted, disputed, baseline, ...split }, tx);
    return true;
  });
  if (!proceeded) return { outcome: "ALREADY_PROCESSED" as const };

  await payoutSeller(order, split.releasedSellerNet, "INITIAL");
  if (a.haulerPayout > 0 && order.route) {
    await paymentProvider.payHauler({ orderId, amount: a.haulerPayout, haulerId: order.route.haulerId });
  }
  return {
    outcome: "PARTIAL_RELEASE" as const,
    releasedRatio: split.acceptedRatio,
    releasedSellerNetPHP: split.releasedSellerNet,
    heldSellerNetPHP: split.heldSellerNet,
  };
}

// --------------------------------------------------------------------------
// Dispute mediation (two distinct admins: propose, then approve)
// --------------------------------------------------------------------------
export async function proposeResolution(
  disputeId: string,
  adminId: string,
  p: { type: "SELLER_RELEASE" | "BUYER_REFUND" | "SPLIT"; sellerPct?: number | null; notes: string; damageOrigin?: string | null }
) {
  if (!p.notes.trim()) throw new SettlementError("Resolution notes are required.", 422);
  if (p.type === "SPLIT" && !(p.sellerPct != null && p.sellerPct >= 0 && p.sellerPct <= 100)) {
    throw new SettlementError("A split needs a seller percentage between 0 and 100.", 422);
  }
  const c = await prisma.orderSettlementDispute.updateMany({
    where: { id: disputeId, status: { in: ["OPEN", "RESOLUTION_PROPOSED"] } },
    data: {
      status: "RESOLUTION_PROPOSED",
      proposedType: p.type,
      proposedSellerPct: p.type === "SPLIT" ? p.sellerPct : null,
      proposedNotes: p.notes.trim(),
      proposedById: adminId,
      damageOrigin: p.damageOrigin ?? "UNDETERMINED",
    },
  });
  if (c.count === 0) throw new SettlementError("Dispute is not open for a proposal.", 409);
  await audit(adminId, "DISPUTE_RESOLUTION_PROPOSED", "OrderSettlementDispute", disputeId, { ...p });
}

export async function approveResolution(disputeId: string, adminId: string) {
  const dispute = await prisma.orderSettlementDispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: { order: { include: { route: true } } },
  });
  if (dispute.status !== "RESOLUTION_PROPOSED" || !dispute.proposedType) {
    throw new SettlementError("No pending resolution proposal.", 409);
  }
  if (dispute.proposedById === adminId) {
    throw new SettlementError("A different admin must approve this resolution (dual control).", 403);
  }

  const amounts = resolveHeldAmounts(dispute.heldSellerNetPHP, dispute.heldCommissionPHP, dispute.proposedType, dispute.proposedSellerPct);
  const order = dispute.order;

  const proceeded = await prisma.$transaction(async (tx) => {
    // CAS on the dispute: exactly one approval can ever execute.
    const c = await tx.orderSettlementDispute.updateMany({
      where: { id: disputeId, status: "RESOLUTION_PROPOSED" },
      data: { status: "RESOLVED", approvedById: adminId, resolvedAt: new Date() },
    });
    if (c.count === 0) return false;
    await tx.order.update({
      where: { id: order.id },
      data: { status: "SETTLED", escrowStatus: "RELEASED", heldSellerNetPHP: 0, heldCommissionPHP: 0 },
    });
    await walletResolveHeld(tx, order.id, { toSeller: amounts.sellerNet + amounts.commission, refundToBuyer: amounts.refund });
    await tx.escrowEvent.create({
      data: {
        orderId: order.id, fromStatus: "DISPUTED", toStatus: "SETTLED", triggeredBy: adminId, triggerType: "ADMIN_MEDIATION",
        metadata: { disputeId, type: dispute.proposedType, proposedBy: dispute.proposedById, approvedBy: adminId, ...amounts },
      },
    });
    await audit(adminId, "DISPUTE_RESOLUTION_APPROVED", "OrderSettlementDispute", disputeId, {
      type: dispute.proposedType, notes: dispute.proposedNotes, damageOrigin: dispute.damageOrigin, proposedBy: dispute.proposedById, ...amounts,
      // In-transit damage goes to the configured hauler/insurance claims workflow only if a policy/provider
      // exists — none is configured, so it is flagged for MANUAL follow-up, never auto-claimed.
      claimsWorkflow: dispute.damageOrigin === "IN_TRANSIT" ? "IN_TRANSIT_CLAIM_MANUAL_REVIEW (no insurance provider configured)" : null,
    }, tx);
    return true;
  });
  if (!proceeded) return false;

  await payoutSeller(order, amounts.sellerNet, "HELD_RELEASE");
  if (amounts.refund > 0) {
    await paymentProvider.refundFunds({ orderId: order.id, amount: amounts.refund, buyerId: order.buyerId });
  }
  await createInvoiceDocuments(order.id);
  return true;
}

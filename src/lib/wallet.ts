import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// A real-feeling buyer-side balance ledger sitting in front of the
// already-mocked src/lib/payments.ts — no real money moves either way (see
// prisma/schema.prisma's Wallet/WalletTransaction comment). Every mutating
// helper here runs inside the caller's own transaction (or opens one of its
// own) so the Wallet row and its WalletTransaction log line never drift.

export class InsufficientWalletBalanceError extends Error {
  constructor() {
    super("Insufficient ANI-Wallet balance.");
    this.name = "InsufficientWalletBalanceError";
  }
}

type Tx = Prisma.TransactionClient;

export async function getOrCreateWallet(userId: string, db: Tx | typeof prisma = prisma) {
  const existing = await db.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.wallet.create({ data: { userId } });
}

export async function topUpWallet(userId: string, amountPHP: number, note?: string) {
  if (amountPHP <= 0) throw new Error("Top-up amount must be greater than zero.");
  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(userId, tx);
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { availableBalancePHP: { increment: amountPHP } },
    });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: "TOP_UP", amountPHP, note },
    });
    return updated;
  });
}

export async function withdrawFromWallet(userId: string, amountPHP: number, note?: string) {
  if (amountPHP <= 0) throw new Error("Withdrawal amount must be greater than zero.");
  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(userId, tx);
    if (wallet.availableBalancePHP < amountPHP) {
      throw new InsufficientWalletBalanceError();
    }
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { availableBalancePHP: { decrement: amountPHP } },
    });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: "WITHDRAWAL", amountPHP, note },
    });
    return updated;
  });
}

/**
 * Move funds from Available -> Protected for a single order at checkout
 * time, mirroring Order.escrowStatus HELD. Runs inside the caller's own
 * transaction (checkoutCart's per-seller order-creation loop) so the hold
 * and the Order row are created atomically together.
 */
export async function walletHoldForOrder(
  tx: Tx,
  userId: string,
  orderId: string,
  amountPHP: number
) {
  const wallet = await getOrCreateWallet(userId, tx);
  if (wallet.availableBalancePHP < amountPHP) {
    throw new InsufficientWalletBalanceError();
  }
  await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalancePHP: { decrement: amountPHP },
      protectedBalancePHP: { increment: amountPHP },
    },
  });
  await tx.walletTransaction.create({
    data: { walletId: wallet.id, type: "HOLD", amountPHP, orderId },
  });
}

/**
 * Clear the Protected hold on delivery confirmation. Looks up the matching
 * HOLD transaction by orderId so it never double-releases and never touches
 * an order that wasn't wallet-funded in the first place.
 */
export async function walletReleaseForOrder(tx: Tx, orderId: string) {
  const hold = await tx.walletTransaction.findFirst({
    where: { orderId, type: "HOLD" },
    include: { wallet: true },
  });
  if (!hold) return null; // not a wallet-funded order — nothing to release

  await tx.wallet.update({
    where: { id: hold.walletId },
    data: { protectedBalancePHP: { decrement: hold.amountPHP } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: hold.walletId,
      type: "RELEASE",
      amountPHP: hold.amountPHP,
      orderId,
    },
  });
  return hold;
}

/**
 * Dockside PARTIAL acceptance: releases everything from the buyer's
 * Protected balance except `heldMerchandisePHP` (the disputed fraction),
 * which stays Protected until mediation resolves it. No-op for orders that
 * weren't wallet-funded.
 */
export async function walletPartialRelease(tx: Tx, orderId: string, heldMerchandisePHP: number) {
  const hold = await tx.walletTransaction.findFirst({ where: { orderId, type: "HOLD" } });
  if (!hold) return null;
  const releaseNow = Math.max(0, Math.round((hold.amountPHP - heldMerchandisePHP + Number.EPSILON) * 100) / 100);
  await tx.wallet.update({
    where: { id: hold.walletId },
    data: { protectedBalancePHP: { decrement: releaseNow } },
  });
  await tx.walletTransaction.create({
    data: { walletId: hold.walletId, type: "RELEASE", amountPHP: releaseNow, orderId, note: "Partial acceptance — undisputed portion released" },
  });
  return hold;
}

/**
 * Mediation outcome for the held fraction: `toSeller`+`refundToBuyer` leave
 * Protected; the refund returns to the buyer's Available balance.
 */
export async function walletResolveHeld(
  tx: Tx,
  orderId: string,
  amounts: { toSeller: number; refundToBuyer: number }
) {
  const hold = await tx.walletTransaction.findFirst({ where: { orderId, type: "HOLD" } });
  if (!hold) return null;
  const out = amounts.toSeller + amounts.refundToBuyer;
  await tx.wallet.update({
    where: { id: hold.walletId },
    data: {
      protectedBalancePHP: { decrement: out },
      availableBalancePHP: { increment: amounts.refundToBuyer },
    },
  });
  if (amounts.toSeller > 0) {
    await tx.walletTransaction.create({
      data: { walletId: hold.walletId, type: "RELEASE", amountPHP: amounts.toSeller, orderId, note: "Dispute resolved — released" },
    });
  }
  if (amounts.refundToBuyer > 0) {
    await tx.walletTransaction.create({
      data: { walletId: hold.walletId, type: "REFUND", amountPHP: amounts.refundToBuyer, orderId, note: "Dispute resolved — refunded" },
    });
  }
  return hold;
}

/**
 * Defined for symmetry with the existing (also-unwired) paymentProvider
 * .refundFunds — no dispute-resolution path calls either one today. Returns
 * Protected funds to Available if a wallet-funded order is ever refunded.
 */
export async function walletRefundForOrder(tx: Tx, orderId: string) {
  const hold = await tx.walletTransaction.findFirst({
    where: { orderId, type: "HOLD" },
  });
  if (!hold) return null;

  await tx.wallet.update({
    where: { id: hold.walletId },
    data: {
      protectedBalancePHP: { decrement: hold.amountPHP },
      availableBalancePHP: { increment: hold.amountPHP },
    },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: hold.walletId,
      type: "REFUND",
      amountPHP: hold.amountPHP,
      orderId,
    },
  });
  return hold;
}

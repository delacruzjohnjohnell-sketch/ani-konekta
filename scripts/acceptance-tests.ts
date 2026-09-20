/**
 * Acceptance tests for the dual-track / commodity-freight / partial-acceptance
 * revision. Run: npx tsx scripts/acceptance-tests.ts
 *
 * Pure-math checks run offline; the scenario checks run against the
 * configured DATABASE_URL using dedicated "ZZ Acceptance" test accounts (never
 * the demo accounts). The tariff-change test edits Manila VEGETABLE's floor
 * and ALWAYS restores it in a finally block.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { computeFreight, quoteFreight, DEFAULT_TARIFFS } from "../src/lib/freight";
import { resolveCommissionForOrder } from "../src/lib/commission";
import {
  splitPartialRelease,
  resolveHeldAmounts,
  computeMemberDeduction,
  applyReceipt,
  proposeResolution,
  approveResolution,
  SettlementError,
} from "../src/lib/settlement";
import { createListingRecord, parseCommodityQuality, actingSellerUserId } from "../src/lib/listing-service";
import { createEscrowedOrderForLines } from "../src/lib/order-fulfillment";

const prisma = new PrismaClient();
const results: { name: string; ok: boolean; detail?: string }[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

const tariff = (zone: string, cat: string) =>
  DEFAULT_TARIFFS.find((t) => t.routeZone === zone && t.cropCategory === cat)!;

async function upsertUser(phone: string, name: string, role: "SELLER" | "BUYER" | "COOPERATIVE_ADMIN", municipality: string, cooperativeId?: string) {
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, name, role, municipality, passwordHash: "x", cooperativeId: cooperativeId ?? null },
  });
}

function grainForm(extra: Record<string, string> = {}) {
  const m: Record<string, string> = { cropCategory: "GRAIN", moistureContentPercent: "13.5", grainGrade: "GRADE_1", ...extra };
  return (k: string) => m[k] ?? null;
}

async function makeListing(owner: { sellerId?: string; cooperativeId?: string; postedBy: string }, kg: number, price: number, cat: "GRAIN" | "VEGETABLE" = "GRAIN") {
  const q = parseCommodityQuality(
    cat === "GRAIN"
      ? grainForm()
      : (k) => ({ cropCategory: "VEGETABLE", produceClass: "CLASS_I", packagingType: "CRATE" } as Record<string, string>)[k] ?? null,
    new Date()
  );
  assert.ok(q.ok);
  return createListingRecord({
    ownerType: owner.cooperativeId ? "COOPERATIVE" : "INDIVIDUAL_SELLER",
    sellerId: owner.sellerId ?? null,
    cooperativeId: owner.cooperativeId ?? null,
    postedByUserId: owner.postedBy,
    cropType: cat === "GRAIN" ? "ZZ Test Palay" : "ZZ Test Pechay",
    volumeKg: kg,
    harvestDate: new Date(),
    askingPricePerKg: price,
    municipality: "Cabanatuan City",
    quality: q.data,
  });
}

async function makeOrder(buyerId: string, listing: Awaited<ReturnType<typeof makeListing>>, qty: number, partial = false) {
  return createEscrowedOrderForLines({
    buyerId,
    sellerId: actingSellerUserId(listing),
    lines: [{ listingId: listing.id, cropType: listing.cropType, qtyKg: qty, pricePerKg: listing.askingPricePerKg }],
    isBulkMatch: false,
    decrementStock: partial,
  });
}

async function markDelivered(orderId: string, windowOpen = true) {
  const arrival = new Date();
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "DELIVERED",
      dockArrivalAt: arrival,
      receivingWindowEndsAt: new Date(arrival.getTime() + (windowOpen ? 2 * 3600_000 : -60_000)),
      escrowEligibleAt: arrival,
    },
  });
  await prisma.proofOfDelivery.create({ data: { orderId, notes: "acceptance test" } });
}

async function main() {
  // ---------------- pure freight math ----------------
  await test("Manila 40 kg VEGETABLE uses the ₱175 floor", () => {
    const f = computeFreight(tariff("REGIONAL_MANILA", "VEGETABLE"), 40);
    assert.equal(f.floorApplied, true);
    assert.equal(f.grossFreight, 175);
  });

  await test("Manila 4,000 kg GRAIN: gross 10,000 / base 8,900 / platform 1,068 / hauler 8,932", () => {
    const f = computeFreight(tariff("REGIONAL_MANILA", "GRAIN"), 4000);
    assert.equal(f.grossFreight, 10000);
    assert.equal(f.freightBase, 8900);
    assert.equal(f.platformMargin, 1068);
    assert.equal(f.haulerPayout, 8932);
  });

  await test("Manila 2,500 kg VEGETABLE: gross 9,375 / base 8,275 / platform 993 / hauler 8,382", () => {
    const f = computeFreight(tariff("REGIONAL_MANILA", "VEGETABLE"), 2500);
    assert.equal(f.grossFreight, 9375);
    assert.equal(f.freightBase, 8275);
    assert.equal(f.platformMargin, 993);
    assert.equal(f.haulerPayout, 8382);
  });

  await test("hauler + platform shares must total 1.0000", () => {
    assert.throws(() => computeFreight({ ...tariff("REGIONAL_MANILA", "GRAIN"), platformSharePct: "0.20" }, 100));
  });

  // ---------------- commission ----------------
  await test("commission: <1000 kg = 6.00%, >=1000 kg = 4.50%", async () => {
    const small = await resolveCommissionForOrder("Palay", 999, 10000);
    const big = await resolveCommissionForOrder("Palay", 1000, 10000);
    assert.equal(small.appliedSellerCommissionRatePercent, 6);
    assert.equal(big.appliedSellerCommissionRatePercent, 4.5);
  });

  // ---------------- partial acceptance / deductions (pure) ----------------
  await test("4,000 kg delivered, 3,600 accepted + 400 disputed => release 90%, hold 10%", () => {
    const s = splitPartialRelease(76400, 3600, 3600, 4000);
    assert.equal(s.acceptedRatio, 0.9);
    assert.equal(s.releasedSellerNet, 68760);
    assert.equal(s.heldSellerNet, 7640);
    assert.equal(s.heldCommission, 360);
  });

  await test("mediation split conserves every centavo", () => {
    const r = resolveHeldAmounts(7640, 360, "SPLIT", 33.33);
    assert.equal(Math.round((r.sellerNet + r.commission + r.refund) * 100), 800000);
  });

  await test("cooperative deduction never exceeds outstanding debt", () => {
    assert.equal(computeMemberDeduction(11460, 0.5, 500).deduction, 500);
    assert.equal(computeMemberDeduction(7640, 0.5, 0).deduction, 0);
  });

  // ---------------- DB scenarios ----------------
  const indSeller = await upsertUser("09990000001", "ZZ Acceptance Farmer", "SELLER", "Cabanatuan City");
  const localBuyer = await upsertUser("09990000002", "ZZ Acceptance Buyer (local)", "BUYER", "Cabanatuan City");
  const manilaBuyer = await upsertUser("09990000003", "ZZ Acceptance Buyer (Manila)", "BUYER", "Metro Manila");
  const adminA = await prisma.user.findFirstOrThrow({ where: { phone: "09179000001" } });
  const adminB = await prisma.user.findFirstOrThrow({ where: { phone: "09179000002" } });

  await test("independent farmer completes a transaction with cooperativeId=null and no cooperative deductions", async () => {
    const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 500, 20);
    assert.equal(listing.ownerType, "INDIVIDUAL_SELLER");
    assert.equal(listing.cooperativeId, null);
    assert.equal(listing.sellerId, indSeller.id);
    const order = await makeOrder(localBuyer.id, listing, 500);
    assert.equal(order.cooperativeId, null);
    assert.equal(order.appliedSellerCommissionRatePercent, 6);
    await markDelivered(order.id);
    const r = await applyReceipt(order.id, localBuyer.id, { acceptedWeightKg: 500, disputedWeightKg: 0, dockPhotoUrls: [] });
    assert.equal(r.outcome, "FULL_RELEASE");
    const settled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(settled.status, "SETTLED");
    assert.equal(settled.netPayoutToSellerPHP, 9400); // 10,000 - 6% only
    assert.equal(await prisma.memberSettlement.count({ where: { orderId: order.id } }), 0);
    // idempotent: a retried confirmation must not pay twice
    await assert.rejects(() => applyReceipt(order.id, localBuyer.id, { acceptedWeightKg: 500, disputedWeightKg: 0, dockPhotoUrls: [] }), SettlementError);
    assert.equal(await prisma.escrowEvent.count({ where: { orderId: order.id } }), 1);
  });

  await test("Manila 4,000 kg GRAIN order snapshots ₱10,000 freight (hauler ₱8,932) and 4.5% commission", async () => {
    const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 4000, 20);
    const order = await makeOrder(manilaBuyer.id, listing, 4000);
    assert.equal(order.routeZone, "REGIONAL_MANILA");
    assert.equal(order.logisticsFeeAmountPHP, 10000);
    assert.equal(order.haulerPayoutAmountPHP, 8932);
    assert.equal(order.appliedSellerCommissionRatePercent, 4.5);
    assert.equal((order.freightSnapshot as { platformMargin: number }).platformMargin, 1068);
  });

  await test("partial dispute: 3,600 accepted / 400 disputed releases 90%, holds 10%, order DISPUTED", async () => {
    const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 4000, 20);
    const order = await makeOrder(manilaBuyer.id, listing, 4000);
    await markDelivered(order.id);
    const r = await applyReceipt(order.id, manilaBuyer.id, { acceptedWeightKg: 3600, disputedWeightKg: 400, reason: "wet sacks", dockPhotoUrls: ["blob://x"] });
    assert.equal(r.outcome, "PARTIAL_RELEASE");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { settlementDispute: true } });
    assert.equal(o.status, "DISPUTED");
    assert.equal(o.escrowStatus, "PARTIALLY_RELEASED");
    assert.equal(o.heldSellerNetPHP, 7640);
    assert.ok(o.settlementDispute);
    // dual control: proposer cannot approve
    await proposeResolution(o.settlementDispute!.id, adminA.id, { type: "SPLIT", sellerPct: 50, notes: "50/50 per evidence", damageOrigin: "FARM_ORIGIN" });
    await assert.rejects(() => approveResolution(o.settlementDispute!.id, adminA.id), SettlementError);
    assert.equal(await approveResolution(o.settlementDispute!.id, adminB.id), true);
    assert.equal(await approveResolution(o.settlementDispute!.id, adminB.id).catch(() => false), false);
    const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(done.status, "SETTLED");
    assert.equal(done.heldSellerNetPHP, 0);
  });

  await test("dispute after the 2-hour server window is rejected", async () => {
    const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 100, 20);
    const order = await makeOrder(localBuyer.id, listing, 100);
    await markDelivered(order.id, false);
    await assert.rejects(
      () => applyReceipt(order.id, localBuyer.id, { acceptedWeightKg: 90, disputedWeightKg: 10, reason: "late", dockPhotoUrls: ["x"] }),
      /window/
    );
  });

  await test("only the order's buyer can confirm receipt", async () => {
    const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 100, 20);
    const order = await makeOrder(localBuyer.id, listing, 100);
    await markDelivered(order.id);
    await assert.rejects(() => applyReceipt(order.id, manilaBuyer.id, { acceptedWeightKg: 100, disputedWeightKg: 0, dockPhotoUrls: [] }), /Not your order/);
  });

  await test("cooperative order: loan deduction capped at debt; independent seller untouched", async () => {
    const coop = (await prisma.cooperative.findFirst({ where: { name: "ZZ Acceptance Cooperative" } })) ??
      (await prisma.cooperative.create({ data: { name: "ZZ Acceptance Cooperative", municipality: "Cabanatuan City" } }));
    const coopAdmin = await upsertUser("09990000004", "ZZ Coop Admin", "COOPERATIVE_ADMIN", "Cabanatuan City", coop.id);
    await prisma.user.update({ where: { id: coopAdmin.id }, data: { role: "COOPERATIVE_ADMIN", cooperativeId: coop.id } });
    const a = await prisma.cooperativeMember.create({ data: { cooperativeId: coop.id, name: "Member A", outstandingDebtPHP: "500", deductionPct: "0.5" } });
    const b = await prisma.cooperativeMember.create({ data: { cooperativeId: coop.id, name: "Member B", outstandingDebtPHP: "0", deductionPct: "0.5" } });
    const listing = await makeListing({ cooperativeId: coop.id, postedBy: coopAdmin.id }, 1000, 20);
    assert.equal(listing.sellerId, null);
    assert.equal(listing.ownerType, "COOPERATIVE");
    await prisma.consolidatedLot.create({
      data: {
        cooperativeId: coop.id, cropType: listing.cropType, cropCategory: "GRAIN", totalWeightKg: 1000, listingId: listing.id,
        contributions: { create: [{ memberId: a.id, weightKg: 600 }, { memberId: b.id, weightKg: 400 }] },
      },
    });
    const order = await makeOrder(localBuyer.id, listing, 1000);
    assert.equal(order.ownerType, "COOPERATIVE");
    assert.equal(order.appliedSellerCommissionRatePercent, 4.5);
    await markDelivered(order.id);
    await applyReceipt(order.id, localBuyer.id, { acceptedWeightKg: 1000, disputedWeightKg: 0, dockPhotoUrls: [] });
    const aAfter = await prisma.cooperativeMember.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(Number(aAfter.outstandingDebtPHP), 0); // 500 debt fully repaid, never overdrawn
    const bAfter = await prisma.cooperativeMember.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(Number(bAfter.outstandingDebtPHP), 0);
    const ledger = await prisma.loanLedgerEntry.findMany({ where: { memberId: a.id } });
    assert.equal(ledger.length, 1);
    assert.equal(Number(ledger[0].amountPHP), 500);
    assert.equal(await prisma.loanLedgerEntry.count({ where: { memberId: b.id } }), 0);
    // immutable history
    await assert.rejects(() => prisma.loanLedgerEntry.update({ where: { id: ledger[0].id }, data: { note: "tamper" } }));
  });

  await test("changing Manila VEGETABLE floor 175 -> 200 changes the very next checkout (no restart)", async () => {
    const before = await prisma.commodityFreightTariff.findUniqueOrThrow({
      where: { routeZone_cropCategory: { routeZone: "REGIONAL_MANILA", cropCategory: "VEGETABLE" } },
    });
    try {
      const listing = await makeListing({ sellerId: indSeller.id, postedBy: indSeller.id }, 1000, 30, "VEGETABLE");
      const o1 = await makeOrder(manilaBuyer.id, listing, 40, true);
      assert.equal(o1.logisticsFeeAmountPHP, Number(before.baseFloorFee));
      await prisma.commodityFreightTariff.update({ where: { id: before.id }, data: { baseFloorFee: "200" } });
      const quote = await quoteFreight("REGIONAL_MANILA", "VEGETABLE", 40);
      assert.equal(quote.grossFreight, 200);
      const o2 = await makeOrder(manilaBuyer.id, listing, 40, true);
      assert.equal(o2.logisticsFeeAmountPHP, 200);
      // historical order is unchanged by the tariff edit
      const o1Again = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
      assert.equal(o1Again.logisticsFeeAmountPHP, Number(before.baseFloorFee));
    } finally {
      await prisma.commodityFreightTariff.update({ where: { id: before.id }, data: { baseFloorFee: before.baseFloorFee } });
    }
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      -> ${r.detail}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

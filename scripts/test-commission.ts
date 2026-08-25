/**
 * Lightweight, dependency-free tests for the pure commission-engine
 * functions (no database needed). Run with:
 *
 *   npx tsx scripts/test-commission.ts
 *
 * Exits non-zero on any failed assertion.
 */
import assert from "node:assert/strict";
import {
  selectApplicableCommissionConfig,
  computeCommissionBreakdown,
  type CommissionConfigLike,
} from "../src/lib/commission";

function cfg(overrides: Partial<CommissionConfigLike>): CommissionConfigLike {
  return {
    id: "test",
    cropType: null,
    minOrderVolumeKg: null,
    sellerCommissionRatePercent: 6,
    buyerLogisticsFeePercent: 2,
    haulerPayoutPercentOfLogisticsFee: 75,
    minFeeFloorPHP: 20,
    effectiveFrom: new Date("2024-01-01"),
    effectiveTo: null,
    ...overrides,
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}

console.log("selectApplicableCommissionConfig");
test("falls back to the default rule when nothing more specific matches", () => {
  const defaultRule = cfg({ id: "default" });
  const result = selectApplicableCommissionConfig([defaultRule], "Palay (Rice)", 100);
  assert.equal(result?.id, "default");
});

test("crop-specific rule beats the default", () => {
  const defaultRule = cfg({ id: "default" });
  const cropRule = cfg({ id: "crop-only", cropType: "Onion" });
  const result = selectApplicableCommissionConfig(
    [defaultRule, cropRule],
    "Onion",
    100
  );
  assert.equal(result?.id, "crop-only");
});

test("volume-tier-only rule beats the default when the order is heavy enough", () => {
  const defaultRule = cfg({ id: "default" });
  const bulkRule = cfg({ id: "bulk-only", minOrderVolumeKg: 1000 });
  const result = selectApplicableCommissionConfig(
    [defaultRule, bulkRule],
    "Palay (Rice)",
    1500
  );
  assert.equal(result?.id, "bulk-only");
});

test("volume-tier-only rule does NOT apply below its threshold", () => {
  const defaultRule = cfg({ id: "default" });
  const bulkRule = cfg({ id: "bulk-only", minOrderVolumeKg: 1000 });
  const result = selectApplicableCommissionConfig(
    [defaultRule, bulkRule],
    "Palay (Rice)",
    500
  );
  assert.equal(result?.id, "default");
});

test("crop + volume tier beats crop-only and volume-only", () => {
  const defaultRule = cfg({ id: "default" });
  const cropOnly = cfg({ id: "crop-only", cropType: "Palay (Rice)" });
  const volumeOnly = cfg({ id: "volume-only", minOrderVolumeKg: 1000 });
  const cropAndVolume = cfg({
    id: "crop-and-volume",
    cropType: "Palay (Rice)",
    minOrderVolumeKg: 1000,
  });
  const result = selectApplicableCommissionConfig(
    [defaultRule, cropOnly, volumeOnly, cropAndVolume],
    "Palay (Rice)",
    1500
  );
  assert.equal(result?.id, "crop-and-volume");
});

test("a different crop's rule never matches", () => {
  const onionRule = cfg({ id: "onion-only", cropType: "Onion" });
  const result = selectApplicableCommissionConfig([onionRule], "Palay (Rice)", 100);
  assert.equal(result, null);
});

test("among multiple matching volume tiers, the higher (more specific) tier wins", () => {
  const tier1000 = cfg({ id: "tier-1000", minOrderVolumeKg: 1000 });
  const tier5000 = cfg({ id: "tier-5000", minOrderVolumeKg: 5000 });
  const result = selectApplicableCommissionConfig(
    [tier1000, tier5000],
    "Palay (Rice)",
    6000
  );
  assert.equal(result?.id, "tier-5000");
});

console.log("computeCommissionBreakdown");
test("splits a simple order correctly with default 6% / 2% / 75% rates", () => {
  const b = computeCommissionBreakdown(cfg({}), 27000);
  assert.equal(b.sellerCommissionAmountPHP, 1620); // 27000 * 6%
  assert.equal(b.logisticsFeeAmountPHP, 540); // 27000 * 2%
  assert.equal(b.haulerPayoutAmountPHP, 405); // 540 * 75%
  assert.equal(b.platformLogisticsMarginAmountPHP, 135); // 540 - 405
  assert.equal(b.platformNetRevenueAmountPHP, 1755); // 1620 + 135
  assert.equal(b.netPayoutToSellerPHP, 25380); // 27000 - 1620
  assert.equal(b.buyerGrandTotalPHP, 27540); // 27000 + 540
  assert.equal(b.floorApplied, false);
});

test("applies the minimum fee floor on a tiny order without touching seller/hauler payouts", () => {
  // producePrice = 100 -> commission 6, logistics 2, hauler payout 1.5,
  // margin 0.5, raw platform net = 6.5, below the 20 floor.
  const b = computeCommissionBreakdown(cfg({}), 100);
  assert.equal(b.sellerCommissionAmountPHP, 6);
  assert.equal(b.haulerPayoutAmountPHP, 1.5);
  assert.equal(b.netPayoutToSellerPHP, 94); // untouched by the floor
  assert.equal(b.platformNetRevenueAmountPHP, 20); // floored
  assert.equal(b.floorApplied, true);
});

test("bulk tier lowers the seller commission rate as configured", () => {
  const bulkRule = cfg({ id: "bulk", minOrderVolumeKg: 1000, sellerCommissionRatePercent: 4.5 });
  const b = computeCommissionBreakdown(bulkRule, 50000);
  assert.equal(b.sellerCommissionAmountPHP, 2250); // 50000 * 4.5%
  assert.equal(b.netPayoutToSellerPHP, 47750);
});

console.log(`\n${passed} test(s) passed.`);

-- FEATURE 1 — Escrow Release Lockdown: DB-level enforcement that an Order's
-- financial snapshot fields can never change once it is SETTLED/RELEASED,
-- regardless of which code path (or future bug) tries to write them.
-- Complements the app-layer guard in src/lib/escrow-guard.ts.
--
-- This is NOT applied by `prisma db push` (Prisma doesn't manage raw
-- triggers) — you must run it yourself, once, against each database:
--
--   Dev (local):
--     psql "$DATABASE_URL" -f prisma/escrow-immutability-trigger.sql
--
--   Production (Supabase):
--     Open the Supabase SQL Editor for the production project and paste/run
--     this file's contents, OR:
--     psql "<production DATABASE_URL>" -f prisma/escrow-immutability-trigger.sql
--
-- Safe to run more than once (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
-- Nothing in the app writes these fields after order creation today, so
-- this trigger should never actually fire in normal operation — it's a
-- backstop, not a behavior change.

CREATE OR REPLACE FUNCTION enforce_order_financial_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."escrowStatus" = 'RELEASED' THEN
    IF (
      NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount" OR
      NEW."agreedPricePerKg" IS DISTINCT FROM OLD."agreedPricePerKg" OR
      NEW."volumeKg" IS DISTINCT FROM OLD."volumeKg" OR
      NEW."commissionConfigId" IS DISTINCT FROM OLD."commissionConfigId" OR
      NEW."appliedSellerCommissionRatePercent" IS DISTINCT FROM OLD."appliedSellerCommissionRatePercent" OR
      NEW."appliedBuyerLogisticsFeePercent" IS DISTINCT FROM OLD."appliedBuyerLogisticsFeePercent" OR
      NEW."appliedHaulerPayoutPercent" IS DISTINCT FROM OLD."appliedHaulerPayoutPercent" OR
      NEW."sellerCommissionAmountPHP" IS DISTINCT FROM OLD."sellerCommissionAmountPHP" OR
      NEW."logisticsFeeAmountPHP" IS DISTINCT FROM OLD."logisticsFeeAmountPHP" OR
      NEW."haulerPayoutAmountPHP" IS DISTINCT FROM OLD."haulerPayoutAmountPHP" OR
      NEW."platformNetRevenueAmountPHP" IS DISTINCT FROM OLD."platformNetRevenueAmountPHP" OR
      NEW."netPayoutToSellerPHP" IS DISTINCT FROM OLD."netPayoutToSellerPHP"
    ) THEN
      RAISE EXCEPTION 'Order %: financial fields are immutable once escrowStatus = RELEASED', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_financial_immutability ON "Order";

CREATE TRIGGER trg_order_financial_immutability
  BEFORE UPDATE ON "Order"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_financial_immutability();

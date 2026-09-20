/**
 * DB-level guards Prisma's schema language can't express. Idempotent — safe to
 * run on every deploy (chained into the package.json "build" script):
 *   npx tsx prisma/apply-revision-constraints.ts
 *
 * 1. Listing ownership invariant (dual-track supply model):
 *      INDIVIDUAL_SELLER -> sellerId NOT NULL and cooperativeId NULL
 *      COOPERATIVE       -> cooperativeId NOT NULL and sellerId NULL
 * 2. Append-only tables: UPDATE/DELETE on AuditLog, LoanLedgerEntry and
 *    EscrowEvent raise an exception (immutable history).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_owner_invariant') THEN
        ALTER TABLE "Listing" ADD CONSTRAINT listing_owner_invariant CHECK (
          ("ownerType" = 'INDIVIDUAL_SELLER' AND "sellerId" IS NOT NULL AND "cooperativeId" IS NULL)
          OR
          ("ownerType" = 'COOPERATIVE' AND "cooperativeId" IS NOT NULL AND "sellerId" IS NULL)
        );
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of ["AuditLog", "LoanLedgerEntry", "EscrowEvent"]) {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_append_only ON "${table}";`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_append_only
        BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
    `);
  }

  console.log("Revision constraints applied (listing_owner_invariant + append-only triggers).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

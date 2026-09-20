import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Append-only audit trail (AuditLog table — a DB trigger blocks UPDATE/
 * DELETE). Used for listing creation, freight/tariff snapshots, inspections,
 * receipts, dispute steps, cooperative deductions and Admin overrides.
 * Pass a transaction client so the audit row commits atomically with the
 * change it describes.
 */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
  db: Db = prisma
) {
  await db.auditLog.create({
    data: { actorId, action, entityType, entityId, metadata: metadata ?? undefined },
  });
}

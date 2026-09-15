import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import {
  resolveDispute,
  initiateDisputeRelease,
  approveDisputeRelease,
  rejectDisputeRelease,
  runAutoReleaseSweep,
} from "@/app/actions";
import { findLegacyPhotoRecords } from "@/lib/legacy-photos";
import { AUTO_RELEASE_WINDOW_MS } from "@/lib/escrow-auto-release";

export default async function AdminPage() {
  const session = await auth();
  const currentAdminId = session!.user.id;

  const [orders, disputed, escrowHeld, settledOrders, pendingReleaseRequests, reconciliation] =
    await Promise.all([
      prisma.order.findMany({
        include: { listing: true, buyer: true, seller: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.order.findMany({
        where: { status: "DISPUTED" },
        include: { listing: true, buyer: true, seller: true },
      }),
      prisma.order.findMany({
        where: { escrowStatus: "HELD" },
      }),
      prisma.order.findMany({
        where: { status: "SETTLED" },
      }),
      prisma.disputeReleaseRequest.findMany({
        where: { status: "PENDING" },
        include: { order: { include: { listing: true, buyer: true, seller: true } } },
        orderBy: { createdAt: "asc" },
      }),
      // FEATURE 1 — reconciliation: since there's no real payment gateway to
      // compare against yet, these two checks instead flag *internal*
      // inconsistency — states that should never happen if every release
      // went through one of the three legitimate, audit-logged trigger
      // paths. Any row found here means something bypassed the lockdown.
      Promise.all([
        prisma.order.findMany({
          where: { escrowStatus: "RELEASED", escrowEvents: { none: {} } },
          select: { id: true, totalAmount: true },
        }),
        prisma.order.findMany({
          where: { status: "SETTLED", NOT: { escrowStatus: "RELEASED" } },
          select: { id: true, totalAmount: true, escrowStatus: true },
        }),
      ]),
    ]);
  const [releasedWithoutAuditEvent, settledWithoutReleasedEscrow] = reconciliation;

  const pipelineCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalEscrowHeld = escrowHeld.reduce((s, o) => s + o.totalAmount, 0);

  // Revenue report: sums seller commissions and platform logistics margin
  // across SETTLED orders, from each order's permanent snapshot fields.
  // Orders predating the commission engine (no snapshot yet) are counted
  // separately so the totals below aren't silently understated.
  const withSnapshot = settledOrders.filter((o) => o.platformNetRevenueAmountPHP != null);
  const missingSnapshot = settledOrders.length - withSnapshot.length;
  const totalSellerCommissions = withSnapshot.reduce((s, o) => s + (o.sellerCommissionAmountPHP ?? 0), 0);
  const totalLogisticsMargin = withSnapshot.reduce(
    (s, o) => s + ((o.logisticsFeeAmountPHP ?? 0) - (o.haulerPayoutAmountPHP ?? 0)),
    0
  );
  const totalPlatformRevenue = withSnapshot.reduce((s, o) => s + (o.platformNetRevenueAmountPHP ?? 0), 0);

  const legacyPhotos = await findLegacyPhotoRecords();
  const legacyPhotoCount = legacyPhotos.listings.length + legacyPhotos.proofs.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Admin overview</h1>
          <p className="text-neutral-600">Order pipeline, disputes, and the escrow ledger.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/verification">
            <Button variant="outline">ID Verification →</Button>
          </Link>
          <Link href="/admin/kyc">
            <Button variant="outline">KYC Visits →</Button>
          </Link>
          <Link href="/admin/commission">
            <Button variant="outline">Manage commission rules →</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(ORDER_STATUS_LABELS).map(([key, label], i) => (
          <Card key={key} className="overflow-hidden">
            <div
              className={
                key === "DISPUTED"
                  ? "h-1.5 bg-gradient-to-r from-red-400 to-red-600"
                  : i % 2 === 0
                    ? "h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800"
                    : "h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700"
              }
            />
            <CardContent className="pt-5">
              <p className="text-xs text-neutral-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">
                {pipelineCounts[key] ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="h-1.5 harvest-band" />
        <CardHeader>
          <CardTitle>Escrow ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-600">
            Currently held in escrow across {escrowHeld.length} order(s):{" "}
            <span className="font-semibold text-brand-gold-600">{formatPeso(totalEscrowHeld)}</span>
          </p>
          <div className="flex items-center gap-3 border-t border-black/5 pt-3">
            <form action={runAutoReleaseSweep}>
              <Button type="submit" variant="outline" size="sm">
                Run auto-release eligibility sweep now
              </Button>
            </form>
            <p className="text-xs text-neutral-500">
              Auto-releases any DELIVERED, non-disputed order past its{" "}
              {AUTO_RELEASE_WINDOW_MS / 3_600_000}-hour window. Also runs nightly via Vercel Cron
              (Hobby plan allows once/day — this button covers the gap in between).
            </p>
          </div>
        </CardContent>
      </Card>

      {(releasedWithoutAuditEvent.length > 0 || settledWithoutReleasedEscrow.length > 0) && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-red-400 to-red-600" />
          <CardHeader>
            <CardTitle>⚠️ Reconciliation flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-neutral-600">
              No real payment gateway is connected yet, so this can&apos;t reconcile against a
              gateway&apos;s payout records — these are internal-consistency checks instead: a
              state that should never occur if every release went through BUYER_CONFIRM,
              AUTO_TIMEOUT, or ADMIN_DUAL_APPROVAL.
            </p>
            {releasedWithoutAuditEvent.map((o) => (
              <div key={o.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
                Order {o.id.slice(-8)} ({formatPeso(o.totalAmount)}) is RELEASED with no EscrowEvent
                audit row.
              </div>
            ))}
            {settledWithoutReleasedEscrow.map((o) => (
              <div key={o.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
                Order {o.id.slice(-8)} ({formatPeso(o.totalAmount)}) is SETTLED but escrowStatus is{" "}
                {o.escrowStatus}, not RELEASED.
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingReleaseRequests.length > 0 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
          <CardHeader>
            <CardTitle>Pending dispute-release approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">
              A different admin must approve — the admin who opened a request can never approve
              it themselves.
            </p>
            {pendingReleaseRequests.map((r) => {
              const iAmOpener = r.openedBy === currentAdminId;
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-gold-300 bg-brand-gold-50 p-3"
                >
                  <div>
                    <p className="font-medium text-neutral-900">
                      {r.order.listing.cropType} · {r.order.seller.name} → {r.order.buyer.name}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {formatPeso(r.order.totalAmount)} · opened by admin {r.openedBy.slice(-8)}
                      {iAmOpener ? " (you)" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approveDisputeRelease}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <Button type="submit" size="sm" disabled={iAmOpener} title={iAmOpener ? "You opened this request — a different admin must approve it." : undefined}>
                        Approve release
                      </Button>
                    </form>
                    <form action={rejectDisputeRelease}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-green-500 via-brand-gold-400 to-brand-gold-700" />
        <CardHeader>
          <CardTitle>Revenue report (settled orders)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-neutral-500">Seller commissions</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">
                {formatPeso(totalSellerCommissions)}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Logistics margin</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">
                {formatPeso(totalLogisticsMargin)}
              </p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total platform revenue</p>
              <p className="mt-1 text-xl font-bold text-brand-green-700">
                {formatPeso(totalPlatformRevenue)}
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Across {withSnapshot.length} settled order(s) with a commission snapshot.
            {missingSnapshot > 0 && (
              <>
                {" "}
                {missingSnapshot} older settled order(s) predate the commission engine and are
                excluded until{" "}
                <code className="rounded bg-neutral-100 px-1">
                  prisma/backfill-commission-snapshots.ts
                </code>{" "}
                is run.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {legacyPhotoCount > 0 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-red-400 to-red-600" />
          <CardHeader>
            <CardTitle>Legacy photo values flagged for re-upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">
              These records hold a value that wasn&apos;t produced by the photo upload flow
              (e.g. a pasted URL or local file path entered before direct file attachment was
              required). They still render if the value happens to be a reachable URL, but
              should be re-uploaded as a real photo by the seller/hauler.
            </p>
            {legacyPhotos.listings.map((l) => (
              <div key={l.id} className="rounded-lg border border-red-200 bg-red-50/40 p-3 text-sm">
                <p className="font-medium text-neutral-900">
                  Listing {l.id.slice(-8)} · {l.cropType} (seller {l.sellerId.slice(-8)})
                </p>
                <p className="truncate text-neutral-500">{l.photoBlobKey}</p>
              </div>
            ))}
            {legacyPhotos.proofs.map((p) => (
              <div key={p.id} className="rounded-lg border border-red-200 bg-red-50/40 p-3 text-sm">
                <p className="font-medium text-neutral-900">
                  Proof of delivery {p.id.slice(-8)} · order {p.orderId.slice(-8)}
                </p>
                <p className="truncate text-neutral-500">{p.photoBlobKey}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Disputed orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {disputed.length === 0 && (
            <p className="text-sm text-neutral-500">No open disputes.</p>
          )}
          {disputed.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {o.listing.cropType} · {o.seller.name} → {o.buyer.name}
                </p>
                <p className="text-sm text-neutral-500">{formatPeso(o.totalAmount)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={resolveDispute}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Resolve → restore to Delivered
                  </Button>
                </form>
                <form action={initiateDisputeRelease}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={pendingReleaseRequests.some((r) => r.orderId === o.id)}
                  >
                    {pendingReleaseRequests.some((r) => r.orderId === o.id)
                      ? "Release requested — awaiting 2nd admin"
                      : "Request release to seller"}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 py-2 text-sm last:border-0"
            >
              <span className="text-neutral-700">
                {o.listing.cropType} · {o.seller.name} → {o.buyer.name} ·{" "}
                {formatPeso(o.totalAmount)}
              </span>
              <Badge tone={o.status === "DISPUTED" ? "red" : o.status === "SETTLED" ? "green" : "gold"}>
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { resolveDispute } from "@/app/actions";

export default async function AdminPage() {
  const [orders, disputed, escrowHeld] = await Promise.all([
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
  ]);

  const pipelineCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalEscrowHeld = escrowHeld.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Admin overview</h1>
        <p className="text-neutral-600">Order pipeline, disputes, and the escrow ledger.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
          <Card key={key}>
            <CardContent className="pt-5">
              <p className="text-xs text-neutral-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">
                {pipelineCounts[key] ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escrow ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">
            Currently held in escrow across {escrowHeld.length} order(s):{" "}
            <span className="font-semibold text-[#C98A1A]">{formatPeso(totalEscrowHeld)}</span>
          </p>
        </CardContent>
      </Card>

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
              <form action={resolveDispute}>
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="restoreStatus" value="DELIVERED" />
                <Button type="submit" variant="outline" size="sm">
                  Resolve → restore to Delivered
                </Button>
              </form>
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

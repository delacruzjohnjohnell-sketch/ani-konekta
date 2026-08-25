import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { placeOrder, bulkMatchOrder } from "@/app/actions";

const MUNICIPALITIES = [
  "Cabanatuan City",
  "Gapan City",
  "San Jose City",
  "Palayan City",
  "Muñoz",
  "Talavera",
  "Guimba",
  "Jaen",
  "Zaragoza",
];

export default async function BuyerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ crop?: string; municipality?: string; quality?: string; maxPrice?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;

  const [listings, orders, priceTrends] = await Promise.all([
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(params.crop ? { cropType: { contains: params.crop, mode: "insensitive" } } : {}),
        ...(params.municipality ? { municipality: params.municipality } : {}),
        ...(params.quality ? { qualityTag: params.quality as never } : {}),
        ...(params.maxPrice ? { askingPricePerKg: { lte: Number(params.maxPrice) } } : {}),
      },
      include: { seller: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { buyerId: userId },
      include: { listing: true, seller: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.priceTrend.findMany({
      orderBy: { recordedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Buyer dashboard</h1>
        <p className="text-neutral-600">Browse listings, place orders, track delivery.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Browse listings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" method="get">
            <div>
              <Label htmlFor="crop">Crop</Label>
              <Input id="crop" name="crop" defaultValue={params.crop} placeholder="Palay" />
            </div>
            <div>
              <Label htmlFor="municipality">Municipality</Label>
              <Select id="municipality" name="municipality" defaultValue={params.municipality ?? ""}>
                <option value="">Any</option>
                {MUNICIPALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="quality">Quality tag</Label>
              <Select id="quality" name="quality" defaultValue={params.quality ?? ""}>
                <option value="">Any</option>
                <option value="STANDARD">Standard</option>
                <option value="GRADE_A">Grade A</option>
                <option value="ORGANIC">Organic</option>
                <option value="GAP_CERTIFIED">GAP-certified</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="maxPrice">Max ₱/kg</Label>
              <Input id="maxPrice" name="maxPrice" type="number" defaultValue={params.maxPrice} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Button type="submit" variant="outline">
                Apply filters
              </Button>
            </div>
          </form>

          <form action={bulkMatchOrder} className="space-y-3">
            {listings.length === 0 && (
              <p className="text-sm text-neutral-500">No listings match your filters.</p>
            )}
            {listings.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 p-3"
              >
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="listingIds" value={l.id} className="h-4 w-4" />
                  <div>
                    <p className="font-medium text-neutral-900">
                      {l.cropType} {l.variety ? `— ${l.variety}` : ""} · {l.volumeKg} kg
                    </p>
                    <p className="text-sm text-neutral-500">
                      {formatPeso(l.askingPricePerKg)}/kg · {l.municipality} · seller{" "}
                      {l.seller.name} ·{" "}
                      <Badge tone="gold" className="ml-1">
                        {l.qualityTag}
                      </Badge>
                    </p>
                  </div>
                </label>
                <form action={placeOrder}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <Button type="submit" size="sm">
                    Order this ({formatPeso(l.volumeKg * l.askingPricePerKg)})
                  </Button>
                </form>
              </div>
            ))}
            {listings.length >= 2 && (
              <Button type="submit" variant="secondary">
                Bulk-match selected listings into one order
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>My orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 && <p className="text-sm text-neutral-500">No orders yet.</p>}
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/buyer/order/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 hover:border-[#1E7A3D]"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {o.listing.cropType} · {o.volumeKg} kg · from {o.seller.name}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {formatPeso(o.totalAmount)} · escrow {o.escrowStatus}
                  </p>
                </div>
                <Badge tone={o.status === "SETTLED" ? "green" : "gold"}>
                  {ORDER_STATUS_LABELS[o.status] ?? o.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price trend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {priceTrends.length === 0 && (
              <p className="text-sm text-neutral-500">No price history yet.</p>
            )}
            {priceTrends.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  {t.cropType} · {t.municipality}
                </span>
                <span className="font-medium text-neutral-900">
                  {formatPeso(t.avgPricePerKg)}/kg
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

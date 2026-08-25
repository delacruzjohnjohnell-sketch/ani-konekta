import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListingPricePreview } from "@/components/listing-price-preview";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { createListing } from "@/app/actions";
import { getActiveCommissionConfigs, selectApplicableCommissionConfig } from "@/lib/commission";
import Link from "next/link";

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

export default async function SellerDashboard() {
  const session = await auth();
  const userId = session!.user.id;

  const [me, listings, orders, activeCommissionConfigs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.listing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { sellerId: userId },
      include: { listing: true, buyer: true },
      orderBy: { createdAt: "desc" },
    }),
    getActiveCommissionConfigs(),
  ]);

  // Preview-only default rate for the listing form — the true rate for any
  // given order is resolved (possibly to a more specific rule) at order
  // creation time, never here.
  const defaultCommissionConfig = selectApplicableCommissionConfig(activeCommissionConfigs, "", 0);
  const previewSellerCommissionRatePercent = defaultCommissionConfig?.sellerCommissionRatePercent ?? 6;

  const settledOrders = orders.filter((o) => o.status === "SETTLED");
  // Sellers are paid totalAmount minus commission — netPayoutToSellerPHP is
  // the correct figure. Orders that predate the commission engine (not yet
  // backfilled) fall back to totalAmount so old settled earnings don't
  // silently disappear from this card.
  const earnings = settledOrders.reduce((s, o) => s + (o.netPayoutToSellerPHP ?? o.totalAmount), 0);
  const pendingEscrow = orders
    .filter((o) => o.escrowStatus === "HELD")
    .reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Seller dashboard</h1>
        <p className="text-neutral-600">Welcome back, {me.name}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Settled earnings</p>
            <p className="mt-1 text-2xl font-bold text-brand-green-700">{formatPeso(earnings)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Pending in escrow</p>
            <p className="mt-1 text-2xl font-bold text-brand-gold-600">{formatPeso(pendingEscrow)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 via-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Reputation score</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{me.reputationScore}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Create a listing</CardTitle>
            <CardDescription>
              We&apos;ll show an AI-suggested fair price (placeholder heuristic) next to
              your asking price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createListing} className="space-y-4">
              <div>
                <Label htmlFor="cropType">Crop type</Label>
                <Input id="cropType" name="cropType" placeholder="Palay (Rice)" required />
              </div>
              <div>
                <Label htmlFor="variety">Variety (optional)</Label>
                <Input id="variety" name="variety" placeholder="RC-160" />
              </div>
              <ListingPricePreview sellerCommissionRatePercent={previewSellerCommissionRatePercent} />
              <div>
                <Label htmlFor="harvestDate">Harvest date</Label>
                <Input id="harvestDate" name="harvestDate" type="date" required />
              </div>
              <div>
                <Label htmlFor="qualityTag">Quality tag</Label>
                <Select id="qualityTag" name="qualityTag" defaultValue="STANDARD">
                  <option value="STANDARD">Standard</option>
                  <option value="GRADE_A">Grade A</option>
                  <option value="ORGANIC">Organic</option>
                  <option value="GAP_CERTIFIED">GAP-certified</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="municipality">Municipality</Label>
                <Select id="municipality" name="municipality" defaultValue={me.municipality ?? MUNICIPALITIES[0]}>
                  {MUNICIPALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="photoUrl">Photo URL (optional)</Label>
                <Textarea id="photoUrl" name="photoUrl" rows={2} placeholder="https://…" />
              </div>
              <Button type="submit" className="w-full">
                Post listing
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>My listings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listings.length === 0 && (
                <p className="text-sm text-neutral-500">No listings yet.</p>
              )}
              {listings.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3"
                >
                  <div>
                    <p className="font-medium text-neutral-900">
                      {l.cropType} {l.variety ? `— ${l.variety}` : ""} · {l.volumeKg} kg
                    </p>
                    <p className="text-sm text-neutral-500">
                      Asking {formatPeso(l.askingPricePerKg)}/kg · AI suggested{" "}
                      {formatPeso(l.aiSuggestedPricePerKg)}/kg · {l.municipality}
                    </p>
                  </div>
                  <Badge tone={l.status === "ACTIVE" ? "green" : "gray"}>{l.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length === 0 && (
                <p className="text-sm text-neutral-500">No orders yet.</p>
              )}
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 hover:border-brand-green-700"
                >
                  <div>
                    <p className="font-medium text-neutral-900">
                      {o.listing.cropType} · {o.volumeKg} kg · buyer {o.buyer.name}
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
        </div>
      </div>
    </div>
  );
}

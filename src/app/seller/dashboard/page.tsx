import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { ListingPricePreview } from "@/components/listing-price-preview";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { EditListingForm } from "@/components/seller/edit-listing-form";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { createListing, deleteListing } from "@/app/actions";
import { DeleteListingButton } from "@/components/ui/delete-listing-button";
import { getActiveCommissionConfigs, selectApplicableCommissionConfig } from "@/lib/commission";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { VerificationStatusCard } from "@/components/verification/verification-status-card";
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
  const locale = await getLocale();

  const [me, listings, orders, activeCommissionConfigs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.listing.findMany({
      where: { sellerId: userId, status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      include: { orders: { select: { status: true } } },
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
        <h1 className="text-2xl font-bold text-neutral-900">{t("seller.title", locale)}</h1>
        <p className="text-neutral-600">{t("seller.welcome", locale, { name: me.name })}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("seller.settledEarnings", locale)}</p>
            <p className="mt-1 text-2xl font-bold text-brand-green-700">{formatPeso(earnings)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("seller.pendingEscrow", locale)}</p>
            <p className="mt-1 text-2xl font-bold text-brand-gold-600">{formatPeso(pendingEscrow)}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-green-500 via-brand-gold-400 to-brand-gold-700" />
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("seller.yourRating", locale)}</p>
            <p className="mt-1">
              <StarRatingDisplay sum={me.ratingSum} count={me.ratingCount} size="lg" />
            </p>
          </CardContent>
        </Card>
      </div>

      <VerificationStatusCard idVerificationStatus={me.idVerificationStatus} kycStatus={me.kycStatus} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("seller.createListing.title", locale)}</CardTitle>
            <CardDescription>{t("seller.createListing.subtitle", locale)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createListing} className="space-y-4">
              <div>
                <Label htmlFor="cropType">{t("seller.field.cropType", locale)}</Label>
                <Input id="cropType" name="cropType" placeholder="Palay (Rice)" required />
              </div>
              <div>
                <Label htmlFor="variety">{t("seller.field.variety", locale)} ({t("common.optional", locale)})</Label>
                <Input id="variety" name="variety" placeholder="RC-160" />
              </div>
              <ListingPricePreview sellerCommissionRatePercent={previewSellerCommissionRatePercent} />
              <div>
                <Label htmlFor="harvestDate">{t("seller.field.harvestDate", locale)}</Label>
                <Input id="harvestDate" name="harvestDate" type="date" required />
              </div>
              <div>
                <Label htmlFor="qualityTag">{t("seller.field.qualityTag", locale)}</Label>
                <Select id="qualityTag" name="qualityTag" defaultValue="STANDARD">
                  <option value="STANDARD">{t("quality.STANDARD", locale)}</option>
                  <option value="GRADE_A">{t("quality.GRADE_A", locale)}</option>
                  <option value="ORGANIC">{t("quality.ORGANIC", locale)}</option>
                  <option value="GAP_CERTIFIED">{t("quality.GAP_CERTIFIED", locale)}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="municipality">{t("seller.field.municipality", locale)}</Label>
                <Select id="municipality" name="municipality" defaultValue={me.municipality ?? MUNICIPALITIES[0]}>
                  {MUNICIPALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="minOrderQtyKg">{t("seller.field.minOrderQty", locale)}</Label>
                <Input id="minOrderQtyKg" name="minOrderQtyKg" type="number" min="0" step="0.1" />
                <p className="mt-1 text-xs text-neutral-400">{t("seller.field.minOrderQtyHint", locale)}</p>
              </div>
              <div>
                <Label htmlFor="description">{t("seller.field.description", locale)}</Label>
                <Textarea id="description" name="description" rows={3} />
                <p className="mt-1 text-xs text-neutral-400">{t("seller.field.descriptionHint", locale)}</p>
              </div>
              <PhotoUpload name="photo" label={t("seller.field.photo", locale)} required />
              <SubmitButton
                className="w-full"
                label={t("seller.postListing", locale)}
                pendingLabel={t("seller.postListing.submitting", locale)}
              />
            </ActionForm>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("seller.myListings", locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listings.length === 0 && (
                <p className="text-sm text-neutral-500">{t("seller.noListingsYet", locale)}</p>
              )}
              {listings.map((l) => {
                const hasActiveOrder = l.orders.some((o) => o.status !== "SETTLED");
                return (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-black/10 p-3"
                  >
                    <div className="flex items-start gap-3">
                      {resolvePhotoUrl(l.photoBlobKey) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolvePhotoUrl(l.photoBlobKey)!}
                          alt={l.cropType}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium text-neutral-900">
                          {l.cropType} {l.variety ? `— ${l.variety}` : ""} · {l.volumeKg} kg
                        </p>
                        <p className="text-sm text-neutral-500">
                          Asking {formatPeso(l.askingPricePerKg)}/kg · AI suggested{" "}
                          {formatPeso(l.aiSuggestedPricePerKg)}/kg · {l.municipality}
                        </p>
                        {l.minOrderQtyKg != null && (
                          <p className="text-xs text-neutral-400">
                            {t("seller.minOrder", locale)}: {l.minOrderQtyKg} kg
                          </p>
                        )}
                        {l.description && (
                          <p className="mt-1 max-w-md text-xs text-neutral-500">{l.description}</p>
                        )}
                        {hasActiveOrder && (
                          <p className="text-xs text-brand-gold-700">Has an active order — can&apos;t delete</p>
                        )}
                        <EditListingForm
                          listing={{
                            id: l.id,
                            cropType: l.cropType,
                            variety: l.variety,
                            volumeKg: l.volumeKg,
                            harvestDate: l.harvestDate,
                            askingPricePerKg: l.askingPricePerKg,
                            qualityTag: l.qualityTag,
                            municipality: l.municipality,
                            minOrderQtyKg: l.minOrderQtyKg,
                            description: l.description,
                          }}
                          municipalities={MUNICIPALITIES}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={l.status === "ACTIVE" ? "green" : "gray"}>{l.status}</Badge>
                      <DeleteListingButton
                        listingId={l.id}
                        action={deleteListing}
                        disabled={hasActiveOrder}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("seller.myOrders", locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length === 0 && (
                <p className="text-sm text-neutral-500">{t("seller.noOrdersYet", locale)}</p>
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
                    {ORDER_STATUS_LABELS[o.status]
                      ? t(`order.status.${o.status}`, locale)
                      : o.status}
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

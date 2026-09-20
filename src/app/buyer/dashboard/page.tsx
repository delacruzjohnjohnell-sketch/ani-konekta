import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPeso } from "@/lib/utils";
import { bulkMatchOrder } from "@/app/actions";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { ListingCard, type ListingCardData } from "@/components/buyer/listing-card";
import { computeSellerBadges } from "@/lib/seller-badges";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { VerificationStatusCard } from "@/components/verification/verification-status-card";
import { getPublicVerificationBadge } from "@/lib/verification-badge";
import { countUnreadHaulerMessages } from "@/lib/hauler-messaging";
import { commodityQualitySummary } from "@/lib/commodity-labels";
import { PageHeader } from "@/components/ui/stat-card";

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

const CATEGORIES = [
  { key: "all", labelKey: "buyer.category.all", match: () => true },
  { key: "rice", labelKey: "buyer.category.rice", match: (crop: string) => /rice|palay/i.test(crop) },
  { key: "vegetables", labelKey: "buyer.category.vegetables", match: (crop: string) => /onion|tomato|cabbage|pepper|eggplant|carrot|repolyo|kamatis/i.test(crop) },
  { key: "fruits", labelKey: "buyer.category.fruits", match: (crop: string) => /mango|banana|calamansi|papaya|watermelon/i.test(crop) },
  { key: "leafy", labelKey: "buyer.category.leafy", match: (crop: string) => /lettuce|spinach|kangkong|pechay|malunggay/i.test(crop) },
  { key: "rootCrops", labelKey: "buyer.category.rootCrops", match: (crop: string) => /potato|sweet potato|cassava|ube|gabi|camote/i.test(crop) },
  { key: "herbs", labelKey: "buyer.category.herbs", match: (crop: string) => /basil|ginger|lemongrass|tanglad|luya/i.test(crop) },
] as const;

const SORTS = [
  { key: "recommended", labelKey: "buyer.sort.recommended" },
  { key: "priceLowHigh", labelKey: "buyer.sort.priceLowHigh" },
  { key: "newest", labelKey: "buyer.sort.newest" },
  { key: "highestRated", labelKey: "buyer.sort.highestRated" },
  { key: "mostSold", labelKey: "buyer.sort.mostSold" },
] as const;

export default async function BuyerDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    crop?: string;
    municipality?: string;
    quality?: string;
    maxPrice?: string;
    sellerName?: string;
    category?: string;
    sort?: string;
    source?: string;
  }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const locale = await getLocale();
  const category = params.category ?? "all";
  // Sourcing track: all listings | direct smallholder | verified cooperative bulk lots.
  const source = params.source === "direct" || params.source === "coop" ? params.source : "all";
  const sort = params.sort ?? "recommended";

  const [me, listingsRaw, orders, priceTrends, unreadHaulerChatCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(source === "direct" ? { ownerType: "INDIVIDUAL_SELLER" as const } : {}),
        ...(source === "coop"
          ? {
              ownerType: "COOPERATIVE" as const,
              // "Verified" = the cooperative's admin has passed the existing KYC workflow.
              cooperative: { members: { some: { role: "COOPERATIVE_ADMIN" as const, kycStatus: "KYC_VERIFIED" as const } } },
            }
          : {}),
        ...(params.crop ? { cropType: { contains: params.crop, mode: "insensitive" } } : {}),
        ...(params.municipality ? { municipality: params.municipality } : {}),
        ...(params.quality ? { qualityTag: params.quality as never } : {}),
        ...(params.maxPrice ? { askingPricePerKg: { lte: Number(params.maxPrice) } } : {}),
        ...(params.sellerName
          ? {
              OR: [
                { seller: { name: { contains: params.sellerName, mode: "insensitive" as const } } },
                { cooperative: { name: { contains: params.sellerName, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        seller: true,
        cooperative: {
          select: {
            name: true,
            members: { where: { role: "COOPERATIVE_ADMIN" }, select: { kycStatus: true, idVerificationStatus: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { buyerId: userId },
      include: { listing: true, seller: true, route: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.priceTrend.findMany({
      orderBy: { recordedAt: "desc" },
      take: 8,
    }),
    countUnreadHaulerMessages(userId),
  ]);

  const categoryDef = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];
  const filteredByCategory = listingsRaw.filter((l) => categoryDef.match(l.cropType));

  // The user account whose ratings/badges represent the listing's owner (the
  // farmer, or the cooperative admin who posted a cooperative bulk lot).
  const ownerUserId = (l: { sellerId: string | null; postedByUserId: string | null; id: string }) =>
    l.sellerId ?? l.postedByUserId ?? l.id;
  const sellerIds = [...new Set(filteredByCategory.map(ownerUserId))];
  const sellerStats = await computeSellerBadges(sellerIds);
  // "Most Sold" has no literal per-listing sales counter (a listing depletes
  // rather than accumulating sales) — defined as the seller's total
  // completed-order count, the same number used for badges.
  const soldCountBySeller = new Map(
    [...sellerStats.entries()].map(([id, s]) => [id, s.completedOrders])
  );

  const sorted = [...filteredByCategory].sort((a, b) => {
    switch (sort) {
      case "priceLowHigh":
        return a.askingPricePerKg - b.askingPricePerKg;
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "highestRated":
        return (
          (sellerStats.get(ownerUserId(b))?.avgRating ?? 0) -
          (sellerStats.get(ownerUserId(a))?.avgRating ?? 0)
        );
      case "mostSold":
        return (soldCountBySeller.get(ownerUserId(b)) ?? 0) - (soldCountBySeller.get(ownerUserId(a)) ?? 0);
      case "recommended":
      default: {
        const aScore = sellerStats.get(ownerUserId(a))?.badges.length ?? 0;
        const bScore = sellerStats.get(ownerUserId(b))?.badges.length ?? 0;
        return bScore - aScore;
      }
    }
  });

  function toCardData(l: (typeof sorted)[number], featuredLabel?: ListingCardData["featuredLabel"]): ListingCardData {
    const stats = sellerStats.get(ownerUserId(l));
    const coopAdmin = l.cooperative?.members[0];
    return {
      id: l.id,
      cropType: l.cropType,
      variety: l.variety,
      volumeKg: l.volumeKg,
      askingPricePerKg: l.askingPricePerKg,
      qualityTag: l.qualityTag,
      municipality: l.municipality,
      photoUrl: resolvePhotoUrl(l.photoBlobKey),
      minOrderQtyKg: l.minOrderQtyKg,
      sellerId: ownerUserId(l),
      sellerName: l.cooperative?.name ?? l.seller?.name ?? "—",
      sellerRatingSum: l.seller?.ratingSum ?? 0,
      sellerRatingCount: l.seller?.ratingCount ?? 0,
      sellerVerification: getPublicVerificationBadge(l.seller ?? coopAdmin ?? { kycStatus: "NOT_VERIFIED", idVerificationStatus: "NOT_VERIFIED" }),
      ownerType: l.ownerType,
      cropCategory: l.cropCategory,
      qualitySummary: commodityQualitySummary(l),
      requiresColdChain: l.requiresColdChain,
      badges: stats?.badges ?? [],
      featuredLabel,
      bulkMatchFormId: sorted.length >= 2 ? "bulk-match-form" : undefined,
    };
  }

  // Featured Harvests: up to 4 derived picks (highest-rated seller / lowest
  // price-per-kg for its crop / most recent harvest / most seller sales) —
  // deduplicated so the same listing doesn't appear twice.
  const featured: { listing: (typeof sorted)[number]; label: ListingCardData["featuredLabel"] }[] = [];
  const usedIds = new Set<string>();
  function pickFeatured(
    label: NonNullable<ListingCardData["featuredLabel"]>,
    compare: (a: (typeof sorted)[number], b: (typeof sorted)[number]) => number
  ) {
    const candidate = [...sorted].filter((l) => !usedIds.has(l.id)).sort(compare)[0];
    if (candidate) {
      featured.push({ listing: candidate, label });
      usedIds.add(candidate.id);
    }
  }
  pickFeatured("recommended", (a, b) => (sellerStats.get(ownerUserId(b))?.avgRating ?? 0) - (sellerStats.get(ownerUserId(a))?.avgRating ?? 0));
  pickFeatured("bestValue", (a, b) => a.askingPricePerKg - b.askingPricePerKg);
  pickFeatured("freshHarvest", (a, b) => b.harvestDate.getTime() - a.harvestDate.getTime());
  pickFeatured("popular", (a, b) => (soldCountBySeller.get(ownerUserId(b)) ?? 0) - (soldCountBySeller.get(ownerUserId(a)) ?? 0));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <PageHeader
        icon="🧺"
        title={t("buyer.title", locale)}
        subtitle={t("buyer.subtitle", locale)}
        actions={
          <div className="rounded-xl bg-white/80 px-3 py-2 text-right ring-1 ring-inset ring-brand-green-900/10">
            <p className="text-xs text-neutral-500">{t("seller.yourRating", locale)}</p>
            <StarRatingDisplay sum={me.ratingSum} count={me.ratingCount} />
          </div>
        }
      />

      <VerificationStatusCard idVerificationStatus={me.idVerificationStatus} kycStatus={me.kycStatus} />

      {featured.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-neutral-900">{t("buyer.featured.title", locale)}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map(({ listing, label }) => (
              <ListingCard key={listing.id} listing={toCardData(listing, label)} />
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("buyer.browseListings", locale)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5" method="get">
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="sort" value={sort} />
            <div>
              <Label htmlFor="crop">{t("buyer.filter.crop", locale)}</Label>
              <Input id="crop" name="crop" defaultValue={params.crop} placeholder="Palay" />
            </div>
            <div>
              <Label htmlFor="sellerName">{t("buyer.filter.sellerName", locale)}</Label>
              <Input id="sellerName" name="sellerName" defaultValue={params.sellerName} />
            </div>
            <div>
              <Label htmlFor="municipality">{t("common.municipality", locale)}</Label>
              <Select id="municipality" name="municipality" defaultValue={params.municipality ?? ""}>
                <option value="">{t("common.any", locale)}</option>
                {MUNICIPALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="quality">{t("buyer.filter.qualityTag", locale)}</Label>
              <Select id="quality" name="quality" defaultValue={params.quality ?? ""}>
                <option value="">{t("common.any", locale)}</option>
                <option value="STANDARD">{t("quality.STANDARD", locale)}</option>
                <option value="GRADE_A">{t("quality.GRADE_A", locale)}</option>
                <option value="ORGANIC">{t("quality.ORGANIC", locale)}</option>
                <option value="GAP_CERTIFIED">{t("quality.GAP_CERTIFIED", locale)}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="maxPrice">{t("buyer.filter.maxPrice", locale)}</Label>
              <Input id="maxPrice" name="maxPrice" type="number" defaultValue={params.maxPrice} />
            </div>
            <div className="col-span-2 sm:col-span-5">
              <Button type="submit" variant="outline">
                {t("buyer.filter.apply", locale)}
              </Button>
            </div>
          </form>

          <div className="mb-3 flex flex-wrap gap-2" aria-label="Sourcing track">
            {(
              [
                ["all", "All Listings"],
                ["direct", "Direct Smallholder Listings"],
                ["coop", "Verified Cooperative Bulk Lots"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={{ pathname: "/buyer/dashboard", query: { ...params, source: key } }}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  source === key
                    ? "border-brand-green-700 bg-brand-green-700 text-white shadow-sm"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-green-600 hover:bg-brand-green-50"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href={{
                  pathname: "/buyer/dashboard",
                  query: { ...params, category: c.key },
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === c.key
                    ? "border-brand-green-700 bg-brand-green-700 text-white"
                    : "border-black/15 bg-white text-neutral-700 hover:border-brand-green-700"
                }`}
              >
                {t(c.labelKey, locale)}
              </Link>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Label className="mb-0 whitespace-nowrap">{t("buyer.sort.label", locale)}</Label>
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={{
                    pathname: "/buyer/dashboard",
                    query: { ...params, category, sort: s.key },
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    sort === s.key
                      ? "border-brand-gold-500 bg-brand-gold-500 text-white"
                      : "border-black/15 bg-white text-neutral-600 hover:border-brand-gold-500"
                  }`}
                >
                  {t(s.labelKey, locale)}
                </Link>
              ))}
            </div>
          </div>

          {/* NOTE: these must NOT be nested <form> elements — a <form> inside
              another <form> is invalid HTML and causes a React hydration
              mismatch that leaves buttons inert. Each ListingCard's "Buy
              Now" is its own standalone form; "Add to Cart" is a plain
              onClick (no form at all — see cart-context.tsx); the
              bulk-match checkboxes live outside any form and associate
              with the bulk-match form purely via the HTML5 form="..."
              attribute. */}
          {sorted.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("buyer.listing.noListings", locale)}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {sorted.map((l) => (
                <ListingCard key={l.id} listing={toCardData(l)} />
              ))}
            </div>
          )}
          {sorted.length >= 2 && (
            <form id="bulk-match-form" action={bulkMatchOrder} className="mt-4">
              <Button type="submit" variant="secondary">
                {t("buyer.bulkMatch", locale)}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("buyer.myOrders", locale)}
              {unreadHaulerChatCount > 0 && (
                <Badge tone="gold" className="text-[10px]">
                  {unreadHaulerChatCount} new hauler message{unreadHaulerChatCount === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 && <p className="text-sm text-neutral-500">{t("buyer.noOrdersYet", locale)}</p>}
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/buyer/order/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 hover:border-brand-green-700"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {o.listing.cropType} · {o.volumeKg} kg · {t("buyer.listing.seller", locale)} {o.seller.name}
                  </p>
                  <p className="text-sm text-neutral-500">{formatPeso(o.totalAmount)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={o.escrowStatus === "RELEASED" ? "green" : "gold"} className="text-[10px]">
                      {t("buyer.order.escrowStatus", locale)}: {t(`escrow.${o.escrowStatus}`, locale)}
                    </Badge>
                    {o.route && (
                      <Badge tone="blue" className="text-[10px]">
                        {t("buyer.order.logisticsStatus", locale)}: {t(`route.status.${o.route.status}`, locale)}
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge tone={o.status === "SETTLED" ? "green" : "gold"}>
                  {t(`order.status.${o.status}`, locale)}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("buyer.priceTrend", locale)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {priceTrends.length === 0 && (
              <p className="text-sm text-neutral-500">No price history yet.</p>
            )}
            {priceTrends.map((pt) => (
              <div key={pt.id} className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  {pt.cropType} · {pt.municipality}
                </span>
                <span className="font-medium text-neutral-900">
                  {formatPeso(pt.avgPricePerKg)}/kg
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

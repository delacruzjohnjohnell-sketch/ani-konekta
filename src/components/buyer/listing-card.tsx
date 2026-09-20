"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { placeOrder } from "@/app/actions";
import { startConversation } from "@/app/messages/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { formatPeso } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { SellerBadge } from "@/lib/seller-badges";
import type { PublicVerificationBadge } from "@/lib/verification-badge";

export type ListingCardData = {
  id: string;
  cropType: string;
  variety: string | null;
  volumeKg: number;
  askingPricePerKg: number;
  qualityTag: string;
  municipality: string;
  photoUrl: string | null;
  minOrderQtyKg: number | null;
  sellerId: string;
  sellerName: string;
  sellerRatingSum: number;
  sellerRatingCount: number;
  sellerVerification: PublicVerificationBadge;
  requiresColdChain: boolean;
  ownerType: "INDIVIDUAL_SELLER" | "COOPERATIVE";
  cropCategory: "GRAIN" | "VEGETABLE" | "FRUIT";
  qualitySummary: string;
  badges: SellerBadge[];
  featuredLabel?: "recommended" | "bestValue" | "freshHarvest" | "popular";
  bulkMatchFormId?: string;
};

// Visual-only stock chip threshold: below this many kg the card shows "Low stock".
const LOW_STOCK_KG = 200;

const VERIFICATION_LABEL_KEY: Record<PublicVerificationBadge, string> = {
  KYC_VERIFIED: "buyer.verification.kycVerified",
  PENDING: "buyer.verification.pending",
  NOT_VERIFIED: "buyer.verification.notVerified",
};
const VERIFICATION_TONE: Record<PublicVerificationBadge, "green" | "gold" | "gray"> = {
  KYC_VERIFIED: "green",
  PENDING: "gold",
  NOT_VERIFIED: "gray",
};

const BADGE_LABEL_KEY: Record<SellerBadge, string> = {
  TOP_SELLER: "buyer.badge.topSeller",
  RECOMMENDED: "buyer.badge.recommended",
  HIGHLY_RATED: "buyer.badge.highlyRated",
};

const FEATURED_LABEL_KEY: Record<NonNullable<ListingCardData["featuredLabel"]>, string> = {
  recommended: "buyer.featured.recommended",
  bestValue: "buyer.featured.bestValue",
  freshHarvest: "buyer.featured.freshHarvest",
  popular: "buyer.featured.popular",
};

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const t = useT();
  const { addItem } = useCart();
  const [qty, setQty] = useState(Math.min(listing.minOrderQtyKg ?? 1, listing.volumeKg) || 1);
  const [added, setAdded] = useState(false);

  const total = listing.volumeKg * listing.askingPricePerKg;

  function handleAddToCart() {
    addItem(
      {
        listingId: listing.id,
        sellerId: listing.sellerId,
        sellerName: listing.sellerName,
        cropType: listing.cropType,
        variety: listing.variety,
        photoUrl: listing.photoUrl,
        pricePerKg: listing.askingPricePerKg,
        availableKg: listing.volumeKg,
        minOrderQtyKg: listing.minOrderQtyKg,
        municipality: listing.municipality,
      },
      qty
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-green-900/10 bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-green-700/25 hover:shadow-lift">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-brand-green-50 to-brand-gold-50">
        {listing.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photoUrl} alt={listing.cropType} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">🌾</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <span
          className={`absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
            listing.volumeKg < LOW_STOCK_KG ? "bg-brand-gold-100 text-brand-gold-900" : "bg-white/95 text-brand-green-800"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${listing.volumeKg < LOW_STOCK_KG ? "bg-brand-gold-500" : "bg-brand-green-500"}`}
          />
          {listing.volumeKg < LOW_STOCK_KG ? "Low stock" : "Available"}
        </span>
        {listing.featuredLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-gold-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
            {t(FEATURED_LABEL_KEY[listing.featuredLabel])}
          </span>
        )}
        {listing.bulkMatchFormId && (
          <input
            type="checkbox"
            name="listingIds"
            value={listing.id}
            form={listing.bulkMatchFormId}
            className="absolute right-2 top-2 h-5 w-5 rounded border-2 border-white bg-white/80 accent-brand-green-700"
            aria-label="Select for bulk match"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {listing.badges.map((b) => (
            <Badge key={b} tone={b === "TOP_SELLER" ? "gold" : "green"} className="text-[10px]">
              {t(BADGE_LABEL_KEY[b])}
            </Badge>
          ))}
          <Badge tone="gray" className="text-[10px]">
            {t(`quality.${listing.qualityTag}`)}
          </Badge>
          <Badge tone={listing.ownerType === "COOPERATIVE" ? "blue" : "green"} className="text-[10px]">
            {listing.ownerType === "COOPERATIVE" ? "Cooperative bulk lot" : "Direct smallholder"}
          </Badge>
        </div>

        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug text-brand-green-950">
            {listing.cropType}
            {listing.variety ? ` — ${listing.variety}` : ""}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-neutral-500">{listing.qualitySummary}</p>
        </div>

        <div className="space-y-1 text-xs text-neutral-600">
          <p className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-neutral-400">👤</span>
            <span className="min-w-0 truncate">
              {t("buyer.listing.seller")}: <span className="font-medium text-neutral-800">{listing.sellerName}</span>
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-neutral-400">📍</span>
            <span className="min-w-0 truncate">{listing.municipality}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StarRatingDisplay sum={listing.sellerRatingSum} count={listing.sellerRatingCount} size="sm" />
          <Badge tone={VERIFICATION_TONE[listing.sellerVerification]} className="text-[10px]">
            {listing.sellerVerification === "KYC_VERIFIED" && <span aria-hidden="true">✓</span>}
            {t(VERIFICATION_LABEL_KEY[listing.sellerVerification])}
          </Badge>
          {listing.requiresColdChain && (
            <Badge tone="blue" className="text-[10px]">
              🧊 {t("coldChain.badge")}
            </Badge>
          )}
        </div>

        <div className="rounded-xl bg-brand-green-50 px-3 py-2.5 ring-1 ring-inset ring-brand-green-700/10">
          <p className="text-xl font-bold leading-none tracking-tight text-brand-green-700">
            {formatPeso(listing.askingPricePerKg)}
            <span className="ml-0.5 text-xs font-medium text-neutral-500">/kg</span>
          </p>
          <p className="mt-1.5 text-xs leading-snug text-neutral-600">
            {t("buyer.listing.availableStock")}: <span className="font-semibold text-neutral-800">{listing.volumeKg} kg</span>
            {listing.minOrderQtyKg != null && ` · ${t("seller.minOrder")} ${listing.minOrderQtyKg} kg`}
          </p>
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={listing.minOrderQtyKg ?? 0.1}
              max={listing.volumeKg}
              step="0.1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 0)}
              aria-label="Quantity (kg)"
              className="h-9 w-24 shrink-0 text-center"
            />
            <Button variant="outline" size="sm" type="button" className="min-w-0 flex-1" onClick={handleAddToCart}>
              {added ? "✓" : t("buyer.listing.addToCart")}
            </Button>
          </div>

          <form action={placeOrder}>
            <input type="hidden" name="listingId" value={listing.id} />
            <Button type="submit" size="sm" className="w-full">
              {t("buyer.listing.orderTotal", { total: formatPeso(total) })}
            </Button>
          </form>

          <form action={startConversation}>
            <input type="hidden" name="counterpartId" value={listing.sellerId} />
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              {t("messages.messageSeller")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

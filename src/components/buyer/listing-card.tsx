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
  badges: SellerBadge[];
  featuredLabel?: "recommended" | "bestValue" | "freshHarvest" | "popular";
  bulkMatchFormId?: string;
};

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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full bg-brand-green-50">
        {listing.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photoUrl} alt={listing.cropType} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🌾</div>
        )}
        {listing.featuredLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-gold-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
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

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {listing.badges.map((b) => (
            <Badge key={b} tone={b === "TOP_SELLER" ? "gold" : "green"} className="text-[10px]">
              {t(BADGE_LABEL_KEY[b])}
            </Badge>
          ))}
          <Badge tone="gray" className="text-[10px]">
            {t(`quality.${listing.qualityTag}`)}
          </Badge>
        </div>
        <p className="font-semibold text-neutral-900">
          {listing.cropType}
          {listing.variety ? ` — ${listing.variety}` : ""}
        </p>
        <p className="text-xs text-neutral-500">
          {t("buyer.listing.seller")}: {listing.sellerName} · {listing.municipality}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <StarRatingDisplay sum={listing.sellerRatingSum} count={listing.sellerRatingCount} size="sm" />
          <Badge tone={VERIFICATION_TONE[listing.sellerVerification]} className="text-[10px]">
            {t(VERIFICATION_LABEL_KEY[listing.sellerVerification])}
          </Badge>
          {listing.requiresColdChain && (
            <Badge tone="blue" className="text-[10px]">
              🧊 {t("coldChain.badge")}
            </Badge>
          )}
        </div>
        <p className="text-lg font-bold text-brand-green-700">
          {formatPeso(listing.askingPricePerKg)}
          <span className="text-xs font-normal text-neutral-500">/kg</span>
        </p>
        <p className="text-xs text-neutral-500">
          {t("buyer.listing.availableStock")}: {listing.volumeKg} kg
          {listing.minOrderQtyKg != null && ` · ${t("seller.minOrder")} ${listing.minOrderQtyKg} kg`}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            min={listing.minOrderQtyKg ?? 0.1}
            max={listing.volumeKg}
            step="0.1"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 0)}
            className="h-8 w-20"
          />
          <Button variant="outline" size="sm" type="button" className="flex-1" onClick={handleAddToCart}>
            {added ? "✓" : t("buyer.listing.addToCart")}
          </Button>
        </div>

        <form action={placeOrder} className="mt-1">
          <input type="hidden" name="listingId" value={listing.id} />
          <Button type="submit" size="sm" className="w-full">
            {t("buyer.listing.orderTotal", { total: formatPeso(total) })}
          </Button>
        </form>

        <form action={startConversation} className="mt-1">
          <input type="hidden" name="counterpartId" value={listing.sellerId} />
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            {t("messages.messageSeller")}
          </Button>
        </form>
      </div>
    </div>
  );
}

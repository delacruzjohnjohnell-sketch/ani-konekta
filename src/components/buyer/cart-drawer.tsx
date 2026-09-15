"use client";

import { useCart } from "@/lib/cart/cart-context";
import { checkoutCart, type CheckoutCartState } from "@/app/actions";
import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { formatPeso } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/lib/i18n/client";

const PREVIEW_LOGISTICS_FEE_PERCENT = 2; // matches the platform default rate; real fee is locked in server-side at checkout

export function CartDrawer({
  onClose,
  walletBalancePHP,
}: {
  onClose: () => void;
  walletBalancePHP: number;
}) {
  const { lines, updateQty, removeItem, clear } = useCart();
  const t = useT();
  const [fundingSource, setFundingSource] = useState<"ESCROW" | "WALLET">("ESCROW");
  const [state, formAction] = useActionState<CheckoutCartState, FormData>(
    checkoutCart,
    null
  );

  if (state?.success) {
    clear();
  }

  const subtotal = lines.reduce((s, l) => s + l.qtyKg * l.pricePerKg, 0);
  const estLogisticsFee = (subtotal * PREVIEW_LOGISTICS_FEE_PERCENT) / 100;
  const estGrandTotal = subtotal + estLogisticsFee;

  // Rendered via a portal straight into <body> — nested inside the navbar's
  // backdrop-blur header otherwise, and `backdrop-filter` (like `filter`)
  // creates a new CSS containing block for `position: fixed` descendants,
  // so this drawer was sizing itself to the ~64px header instead of the
  // full screen (found while checking mobile layout — reproduces at every
  // viewport width, not mobile-specific).
  return createPortal(
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 p-4">
          <h2 className="text-lg font-bold text-neutral-900">{t("cart.title")}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {lines.length === 0 && (
            <p className="text-sm text-neutral-500">{t("cart.empty")}</p>
          )}
          {lines.map((line) => {
            const belowMin = line.minOrderQtyKg != null && line.qtyKg < line.minOrderQtyKg;
            const aboveStock = line.qtyKg > line.availableKg;
            return (
              <div key={line.listingId} className="rounded-lg border border-black/10 p-3">
                <div className="flex items-start gap-3">
                  {line.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.photoUrl} alt={line.cropType} className="h-12 w-12 rounded-md object-cover" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">
                      {line.cropType}
                      {line.variety ? ` — ${line.variety}` : ""}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t("buyer.listing.seller")}: {line.sellerName} · {formatPeso(line.pricePerKg)}/kg
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(line.listingId)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t("common.remove")}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    {t("cart.quantity")}
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={line.qtyKg}
                      onChange={(e) => updateQty(line.listingId, Number(e.target.value) || 0)}
                      className="h-8 w-24"
                    />
                  </label>
                  <span className="text-sm font-medium text-neutral-900">
                    {formatPeso(line.qtyKg * line.pricePerKg)}
                  </span>
                </div>
                {belowMin && (
                  <p className="mt-1 text-xs text-red-600">
                    {t("cart.errorBelowMinimum", { min: line.minOrderQtyKg! })}
                  </p>
                )}
                {aboveStock && (
                  <p className="mt-1 text-xs text-red-600">
                    {t("cart.errorAboveStock", { available: line.availableKg })}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {lines.length > 0 && (
          <form action={formAction} className="border-t border-black/10 p-4">
            <input
              type="hidden"
              name="cartJson"
              value={JSON.stringify(lines.map((l) => ({ listingId: l.listingId, qtyKg: l.qtyKg })))}
            />
            {state?.error && (
              <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </div>
            )}
            <input type="hidden" name="fundingSource" value={fundingSource} />
            <div className="mb-3 space-y-1.5">
              <p className="text-xs font-medium text-neutral-600">{t("cart.fundingSource")}</p>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="radio"
                  name="fundingSourceChoice"
                  checked={fundingSource === "ESCROW"}
                  onChange={() => setFundingSource("ESCROW")}
                />
                {t("cart.fundingSource.escrow")}
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="radio"
                  name="fundingSourceChoice"
                  checked={fundingSource === "WALLET"}
                  onChange={() => setFundingSource("WALLET")}
                />
                {t("cart.fundingSource.wallet")}
              </label>
              {fundingSource === "WALLET" && (
                <p className="pl-6 text-xs text-neutral-500">
                  {t("cart.fundingSource.walletBalance", { balance: formatPeso(walletBalancePHP) })}
                </p>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>{t("cart.subtotal")}</span>
                <span>{formatPeso(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>{t("cart.estLogisticsFee")}</span>
                <span>{formatPeso(estLogisticsFee)}</span>
              </div>
              <div className="flex justify-between border-t border-black/10 pt-1 font-semibold text-brand-green-700">
                <span>{t("cart.estGrandTotal")}</span>
                <span>{formatPeso(estGrandTotal)}</span>
              </div>
            </div>
            <SubmitButton
              className="mt-3 w-full"
              label={t("cart.checkout")}
              pendingLabel={t("cart.checkout.submitting")}
            />
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

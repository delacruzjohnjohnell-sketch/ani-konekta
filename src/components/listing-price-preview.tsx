"use client";

import * as React from "react";
import { Input, Label } from "@/components/ui/input";
import { formatPeso } from "@/lib/utils";

export interface ListingPricePreviewProps {
  /** Default seller commission rate (%) to preview with, from the currently
   * active default CommissionConfig. This is a PREVIEW ONLY — the real rate
   * is resolved and snapshotted server-side in placeOrder/bulkMatchOrder,
   * which may pick a different (more specific) rule at order time. */
  sellerCommissionRatePercent: number;
}

/**
 * Live "order value / commission / you receive" breakdown shown under the
 * volume + asking-price inputs on the seller's listing form. Purely a
 * preview to set expectations — actual commission is computed and
 * snapshotted per-order via src/lib/commission.ts.
 */
export function ListingPricePreview({ sellerCommissionRatePercent }: ListingPricePreviewProps) {
  const [volumeKg, setVolumeKg] = React.useState<number>(0);
  const [pricePerKg, setPricePerKg] = React.useState<number>(0);

  const orderValue = volumeKg * pricePerKg;
  const commission = (orderValue * sellerCommissionRatePercent) / 100;
  const youReceive = orderValue - commission;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="volumeKg">Volume (kg)</Label>
          <Input
            id="volumeKg"
            name="volumeKg"
            type="number"
            min="1"
            step="1"
            required
            onChange={(e) => setVolumeKg(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label htmlFor="askingPricePerKg">Asking price / kg (₱)</Label>
          <Input
            id="askingPricePerKg"
            name="askingPricePerKg"
            type="number"
            min="0"
            step="0.01"
            required
            onChange={(e) => setPricePerKg(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      {orderValue > 0 && (
        <div className="rounded-lg border border-brand-green-700/20 bg-brand-green-50 p-3 text-sm">
          <div className="flex justify-between text-neutral-700">
            <span>Order value</span>
            <span className="font-medium">{formatPeso(orderValue)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Platform commission ({sellerCommissionRatePercent}%)</span>
            <span>− {formatPeso(commission)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-brand-green-700/20 pt-1 font-semibold text-brand-green-700">
            <span>You receive</span>
            <span>{formatPeso(youReceive)}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Estimate at current rates. The buyer separately pays a logistics fee on top of the
            order value; the exact rate applied to your order is locked in when it&apos;s placed.
          </p>
        </div>
      )}
    </div>
  );
}

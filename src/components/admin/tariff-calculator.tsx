"use client";

import { useActionState } from "react";
import { calculateFreightTest, type CalcState } from "@/app/admin/tariffs/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatPeso } from "@/lib/utils";

/** Non-saving what-if calculator: nothing here ever writes a tariff. */
export function TariffCalculator() {
  const [state, formAction, pending] = useActionState<CalcState, FormData>(calculateFreightTest, null);
  const r = state?.result;

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="calc-zone">Route zone</Label>
          <Select id="calc-zone" name="routeZone" defaultValue="REGIONAL_MANILA">
            <option value="REGIONAL_MANILA">REGIONAL_MANILA</option>
            <option value="LOCAL_PROVINCIAL">LOCAL_PROVINCIAL</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="calc-cat">Commodity</Label>
          <Select id="calc-cat" name="cropCategory" defaultValue="GRAIN">
            <option value="GRAIN">GRAIN</option>
            <option value="VEGETABLE">VEGETABLE</option>
            <option value="FRUIT">FRUIT</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="calc-w">Weight (kg)</Label>
          <Input id="calc-w" name="weightKg" type="number" step="0.01" min="0" defaultValue="4000" required />
        </div>
        <div className="hidden sm:block" />
        <p className="col-span-2 text-xs text-neutral-500 sm:col-span-4">
          Optional what-if overrides (blank = use the saved tariff):
        </p>
        <div>
          <Label htmlFor="calc-rate">₱/kg</Label>
          <Input id="calc-rate" name="ratePerKg" type="number" step="0.0001" min="0" />
        </div>
        <div>
          <Label htmlFor="calc-floor">Floor ₱</Label>
          <Input id="calc-floor" name="baseFloorFee" type="number" step="0.01" min="0" />
        </div>
        <div>
          <Label htmlFor="calc-toll">Toll ₱</Label>
          <Input id="calc-toll" name="tollPassThrough" type="number" step="0.01" min="0" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="calc-h">Hauler %</Label>
            <Input id="calc-h" name="haulerSharePct" type="number" step="0.01" min="0" max="100" />
          </div>
          <div>
            <Label htmlFor="calc-p">Platform %</Label>
            <Input id="calc-p" name="platformSharePct" type="number" step="0.01" min="0" max="100" />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Calculating…" : "Calculate (does not save)"}
          </Button>
        </div>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {r && (
        <div className="rounded-lg border border-brand-green-700/20 bg-brand-green-50 p-3 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-green-800">
            Test calculation — not saved
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <div className="flex justify-between"><dt>Weight × rate</dt><dd>{formatPeso(r.weightFreight)}</dd></div>
            <div className="flex justify-between"><dt>Floor applied?</dt><dd className="font-medium">{r.floorApplied ? `Yes (₱${r.baseFloorFee})` : "No"}</dd></div>
            <div className="flex justify-between"><dt>Buyer freight (gross)</dt><dd className="font-semibold">{formatPeso(r.grossFreight)}</dd></div>
            <div className="flex justify-between"><dt>Toll component</dt><dd>{formatPeso(r.tollApplied)}</dd></div>
            <div className="flex justify-between"><dt>Freight base</dt><dd>{formatPeso(r.freightBase)}</dd></div>
            <div className="flex justify-between"><dt>Platform margin</dt><dd>{formatPeso(r.platformMargin)}</dd></div>
            <div className="flex justify-between sm:col-span-3"><dt className="font-semibold">Hauler payout (share + full toll)</dt><dd className="font-semibold text-brand-green-700">{formatPeso(r.haulerPayout)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

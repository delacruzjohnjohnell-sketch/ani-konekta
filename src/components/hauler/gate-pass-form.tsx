"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface GatePassSummary {
  actualPickupWeightKg: number;
  signedOff: boolean;
}

/**
 * Adaptive pre-dispatch Gate Pass. Grain → weight + moisture + evidence;
 * vegetable/fruit → weight + package count + condition + evidence. POSTs
 * multipart to /api/haulers/inspections; the server validates the same rules.
 */
export function GatePassForm({
  orderId,
  cropCategory,
  declaredKg,
  existing,
}: {
  orderId: string;
  cropCategory: "GRAIN" | "VEGETABLE" | "FRUIT" | null;
  declaredKg: number;
  existing: GatePassSummary | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grain = cropCategory === "GRAIN";

  if (existing?.signedOff) {
    return <p className="text-xs text-brand-green-700">✓ Gate Pass signed off · locked at {existing.actualPickupWeightKg} kg</p>;
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {existing && (
          <span className="text-xs text-neutral-600">Recorded {existing.actualPickupWeightKg} kg — awaiting seller sign-off.</span>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {existing ? "Redo Gate Pass" : "Start Gate Pass"}
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/haulers/inspections", { method: "POST", body: new FormData(e.currentTarget) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save the Gate Pass.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg border border-brand-gold-400/40 bg-amber-50 p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-xs font-semibold">
        Pre-dispatch Gate Pass · {grain ? "Grain" : cropCategory === "FRUIT" ? "Fruit" : "Vegetable"} · declared {declaredKg} kg
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`gp-w-${orderId}`}>Actual weight (kg)</Label>
          <Input id={`gp-w-${orderId}`} name="actualPickupWeightKg" type="number" step="0.01" min="0" required />
        </div>
        {grain ? (
          <div>
            <Label htmlFor={`gp-m-${orderId}`}>Moisture reading %</Label>
            <Input id={`gp-m-${orderId}`} name="moistureReadingPercent" type="number" step="0.1" min="0" max="100" required />
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor={`gp-p-${orderId}`}>Package count</Label>
              <Input id={`gp-p-${orderId}`} name="packageCount" type="number" step="1" min="1" required />
            </div>
            <div className="col-span-2">
              <Label htmlFor={`gp-c-${orderId}`}>Condition</Label>
              <Input id={`gp-c-${orderId}`} name="qualityCondition" placeholder="e.g. firm, no bruising, uniform size" required />
            </div>
          </>
        )}
      </div>
      <div>
        <Label htmlFor={`gp-f-${orderId}`}>Evidence photos (1–6)</Label>
        <input
          id={`gp-f-${orderId}`}
          name="photos"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          required
          className="block w-full text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Submit for seller sign-off"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

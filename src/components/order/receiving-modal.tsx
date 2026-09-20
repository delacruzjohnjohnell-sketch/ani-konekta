"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  orderId: string;
  baselineKg: number;
  /** Where the baseline came from: the locked Gate Pass, or the ordered volume for legacy orders. */
  baselineSource: "GATE_PASS" | "ORDERED_VOLUME";
  originPhotos: string[];
  originNote: string | null;
  dockArrivalAtISO: string;
  windowEndsAtISO: string | null;
  /** Server clock at render time — the countdown uses this offset, not the buyer's device clock. */
  serverNowISO: string;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

export function ReceivingModal(p: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(String(p.baselineKg));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Countdown runs on SERVER time: start from the server's render timestamp and advance by the
  // elapsed time on this device, so a wrong device clock/timezone can't shift the window.
  const [now, setNow] = useState(() => new Date(p.serverNowISO).getTime());
  useEffect(() => {
    const serverStart = new Date(p.serverNowISO).getTime();
    const clientStart = Date.now();
    const t = setInterval(() => setNow(serverStart + (Date.now() - clientStart)), 1000);
    return () => clearInterval(t);
  }, [p.serverNowISO]);

  const endsAt = p.windowEndsAtISO ? new Date(p.windowEndsAtISO).getTime() : null;
  const remaining = endsAt == null ? null : endsAt - now;
  const windowOpen = remaining == null || remaining > 0;

  const acceptedNum = Number(accepted);
  const validNum = Number.isFinite(acceptedNum) && acceptedNum >= 0 && acceptedNum <= p.baselineKg;
  const disputed = validNum ? Math.round((p.baselineKg - acceptedNum) * 100) / 100 : 0;
  const releasePct = validNum && p.baselineKg > 0 ? Math.round((acceptedNum / p.baselineKg) * 1000) / 10 : 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validNum) {
      setError(`Accepted weight must be between 0 and ${p.baselineKg} kg.`);
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("acceptedWeightKg", String(acceptedNum));
    fd.set("disputedWeightKg", String(disputed));
    try {
      const res = await fetch(`/api/buyers/orders/${p.orderId}/confirm-receipt`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not record the receipt.");
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
    <div className="space-y-3">
      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        <p>
          Origin baseline: <b>{p.baselineKg} kg</b>{" "}
          <span className="text-xs text-neutral-500">
            ({p.baselineSource === "GATE_PASS" ? "locked at pickup Gate Pass" : "ordered volume — no Gate Pass on this legacy order"})
          </span>
        </p>
        {p.originNote && <p className="text-xs text-neutral-600">{p.originNote}</p>}
        <p className="text-xs text-neutral-500">Dock arrival (server time): {new Date(p.dockArrivalAtISO).toLocaleString()}</p>
        {remaining != null && (
          <p className={`text-xs font-medium ${windowOpen ? "text-brand-green-700" : "text-red-600"}`}>
            {windowOpen ? `Dispute window closes in ${fmt(remaining)}` : "The 2-hour dispute window has closed — you can still accept the full delivery."}
          </p>
        )}
        {p.originPhotos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {p.originPhotos.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Origin evidence" className="h-14 w-14 rounded-md border border-black/10 object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {!open ? (
        <Button type="button" onClick={() => setOpen(true)}>Receive delivery</Button>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-brand-green-700/20 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rc-acc">Weight you accept (kg)</Label>
              <Input
                id="rc-acc"
                type="number"
                step="0.01"
                min="0"
                max={p.baselineKg}
                value={accepted}
                onChange={(e) => setAccepted(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Weight disputed (kg)</Label>
              <p className="flex h-10 items-center text-sm font-semibold">{validNum ? disputed : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-neutral-600">
            {disputed > 0
              ? `Releases ${releasePct}% of the merchandise payment to the seller now and holds ${Math.round((100 - releasePct) * 10) / 10}% for Admin mediation (simulated third-party settlement).`
              : "Accepting the full delivery releases the payment to the seller."}
          </p>
          {disputed > 0 && (
            <>
              {!windowOpen && <p className="text-sm text-red-600">The dispute window has closed; you can only accept the full weight.</p>}
              <div>
                <Label htmlFor="rc-reason">Reason for dispute</Label>
                <Textarea id="rc-reason" name="reason" rows={2} required />
              </div>
              <div>
                <Label htmlFor="rc-photos">Dock evidence photos (1–6)</Label>
                <input id="rc-photos" name="photos" type="file" accept="image/*" capture="environment" multiple required className="block w-full text-sm" />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !validNum || (disputed > 0 && !windowOpen)}>
              {pending ? "Saving…" : disputed > 0 ? "Accept partial & dispute rest" : "Confirm full receipt"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

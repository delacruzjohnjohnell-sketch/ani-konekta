import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatPeso } from "@/lib/utils";
import {
  approveDisputeResolution,
  correctInspectionBaseline,
  proposeDisputeResolution,
} from "@/app/admin/disputes/actions";

function Photos({ keys, label }: { keys: string[]; label: string }) {
  if (keys.length === 0) return <p className="text-xs text-neutral-400">No {label} photos.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => {
        const url = resolvePhotoUrl(k);
        return url ? (
          <a key={k} href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="h-20 w-20 rounded-md border border-black/10 object-cover" />
          </a>
        ) : null;
      })}
    </div>
  );
}

export default async function AdminDisputesPage() {
  const session = await auth();
  const adminId = session?.user?.id;
  const disputes = await prisma.orderSettlementDispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      order: { include: { listing: true, buyer: true, seller: true, inspection: true, receipt: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dispute mediation</h1>
          <p className="text-sm text-neutral-600">
            Compare pre-dispatch (origin) evidence with dockside evidence. One admin proposes; a different admin approves
            (dual control). Funds shown are held in the simulated third-party settlement layer — ANI-KONEKTA does not custody funds.
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← Admin</Button></Link>
      </div>

      {disputes.length === 0 && <p className="text-sm text-neutral-500">No settlement disputes.</p>}

      {disputes.map((d) => {
        const o = d.order;
        const insp = o.inspection;
        const rcpt = o.receipt;
        const open = d.status !== "RESOLVED";
        const iProposed = d.proposedById === adminId;
        return (
          <Card key={d.id} className="overflow-hidden">
            <div className={`h-1.5 ${open ? "bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" : "bg-brand-green-700"}`} />
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>Order …{o.id.slice(-6)} · {o.listing.cropType}</span>
                <Badge>{d.status}</Badge>
                <Link href={`/orders/${o.id}`} className="text-xs font-normal text-brand-green-700 underline">view order</Link>
              </CardTitle>
              <p className="text-xs text-neutral-500">Buyer {o.buyer.name} · Seller {o.seller.name}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-black/10 p-3 text-sm">
                  <h3 className="mb-2 font-semibold">Origin — Gate Pass (pre-dispatch)</h3>
                  {insp ? (
                    <div className="space-y-1">
                      <p>Weight at pickup: <b>{insp.actualPickupWeightKg} kg</b></p>
                      {insp.moistureReadingPercent != null && <p>Moisture: {insp.moistureReadingPercent}%</p>}
                      {insp.packageCount != null && <p>Packages: {insp.packageCount}</p>}
                      {insp.qualityCondition && <p>Condition: {insp.qualityCondition}</p>}
                      <p className="text-xs text-neutral-500">
                        Recorded {insp.serverTimestamp.toLocaleString()} ·{" "}
                        {insp.sellerSignedAt ? `seller sign-off ${insp.sellerSignedAt.toLocaleString()}` : "not signed off"}
                        {insp.lockedAt ? " · locked" : ""}
                      </p>
                      <Photos keys={insp.originPhotoUrls} label="origin" />
                    </div>
                  ) : (
                    <p className="text-neutral-500">No Gate Pass on file (legacy order).</p>
                  )}
                </div>
                <div className="rounded-lg border border-black/10 p-3 text-sm">
                  <h3 className="mb-2 font-semibold">Dock — buyer receiving</h3>
                  {rcpt ? (
                    <div className="space-y-1">
                      <p>Baseline: {rcpt.baselineWeightKg} kg</p>
                      <p>Accepted: <b>{rcpt.acceptedWeightKg} kg</b> · Disputed: <b className="text-red-600">{rcpt.disputedWeightKg} kg</b></p>
                      {rcpt.reason && <p>Reason: {rcpt.reason}</p>}
                      <p className="text-xs text-neutral-500">
                        Dock arrival (server) {o.dockArrivalAt?.toLocaleString() ?? "—"} · confirmed {rcpt.confirmedAt.toLocaleString()}
                      </p>
                      <Photos keys={rcpt.dockPhotoUrls} label="dock" />
                    </div>
                  ) : (
                    <p className="text-neutral-500">No receipt recorded.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                Held: seller net <b>{formatPeso(d.heldSellerNetPHP)}</b> + commission <b>{formatPeso(d.heldCommissionPHP)}</b> for {d.disputedWeightKg} kg disputed.
                {d.reason && <> Buyer reason: “{d.reason}”.</>}
              </div>

              {d.proposedType && (
                <div className="rounded-lg border border-brand-gold-400/50 bg-amber-50 p-3 text-sm">
                  Proposed: <b>{d.proposedType}</b>
                  {d.proposedType === "SPLIT" && <> ({d.proposedSellerPct}% to seller)</>} · origin of damage: {d.damageOrigin}
                  <p className="mt-1 text-neutral-700">Notes: {d.proposedNotes}</p>
                  <p className="text-xs text-neutral-500">Proposed by admin …{d.proposedById?.slice(-6)}</p>
                </div>
              )}

              {open && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <ActionForm action={proposeDisputeResolution} className="space-y-2">
                    <input type="hidden" name="disputeId" value={d.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`t-${d.id}`}>Resolution</Label>
                        <Select id={`t-${d.id}`} name="type" required defaultValue="">
                          <option value="" disabled>Select…</option>
                          <option value="SELLER_RELEASE">Release to seller</option>
                          <option value="BUYER_REFUND">Refund buyer</option>
                          <option value="SPLIT">Split</option>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`p-${d.id}`}>Seller % (split)</Label>
                        <Input id={`p-${d.id}`} name="sellerPct" type="number" min="0" max="100" step="0.01" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`o-${d.id}`}>Damage origin</Label>
                      <Select id={`o-${d.id}`} name="damageOrigin" defaultValue="UNDETERMINED">
                        <option value="UNDETERMINED">Undetermined</option>
                        <option value="FARM_ORIGIN">Farm origin</option>
                        <option value="IN_TRANSIT">In transit</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`n-${d.id}`}>Mediation notes (required)</Label>
                      <Textarea id={`n-${d.id}`} name="notes" rows={2} required />
                    </div>
                    <SubmitButton size="sm" label="Propose resolution" pendingLabel="Saving…" />
                  </ActionForm>

                  <div className="space-y-3">
                    {d.status === "RESOLUTION_PROPOSED" && (
                      <ActionForm action={approveDisputeResolution}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <SubmitButton size="sm" label="Approve & execute" pendingLabel="Executing…" disabled={iProposed} />
                        {iProposed && <p className="mt-1 text-xs text-neutral-500">A different admin must approve your proposal.</p>}
                      </ActionForm>
                    )}
                    {insp && (
                      <ActionForm action={correctInspectionBaseline} className="space-y-2 rounded-lg border border-black/10 p-3">
                        <input type="hidden" name="orderId" value={o.id} />
                        <p className="text-xs font-semibold">Audited origin-baseline correction</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label htmlFor={`w-${d.id}`}>Corrected kg</Label><Input id={`w-${d.id}`} name="actualPickupWeightKg" type="number" step="0.01" min="0" required /></div>
                          <div><Label htmlFor={`r-${d.id}`}>Reason</Label><Input id={`r-${d.id}`} name="reason" required /></div>
                        </div>
                        <SubmitButton size="sm" variant="outline" label="Record correction" pendingLabel="Saving…" />
                      </ActionForm>
                    )}
                  </div>
                </div>
              )}
              {!open && (
                <p className="text-xs text-neutral-500">
                  Resolved {d.resolvedAt?.toLocaleString()} · approved by admin …{d.approvedById?.slice(-6)}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

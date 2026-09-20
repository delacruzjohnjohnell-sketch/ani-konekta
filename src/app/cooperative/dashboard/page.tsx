import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { CommodityFields } from "@/components/listing/commodity-fields";
import { PendingSignoffs } from "@/components/gate-pass/pending-signoffs";
import { PriceBenchmarks } from "@/components/seller/price-benchmarks";
import { VerificationStatusCard } from "@/components/verification/verification-status-card";
import { commodityQualitySummary } from "@/lib/commodity-labels";
import { PageHeader, StatCard } from "@/components/ui/stat-card";
import { formatPeso, ORDER_STATUS_LABELS } from "@/lib/utils";
import { addMember, createBulkLot, createStagingTicket, issueLoan, saveBankInfo, setMemberDeduction } from "@/app/cooperative/actions";

export default async function CooperativeDashboard() {
  const session = await auth();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  if (!me.cooperativeId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-neutral-600">No cooperative is linked to this account. Contact an ANI-KONEKTA admin.</p>
      </div>
    );
  }

  const cooperativeId = me.cooperativeId;
  const [coop, members, lots, tickets, orders] = await Promise.all([
    prisma.cooperative.findUniqueOrThrow({ where: { id: cooperativeId } }),
    prisma.cooperativeMember.findMany({
      where: { cooperativeId },
      orderBy: { name: "asc" },
      include: { ledger: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.consolidatedLot.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { contributions: { include: { member: { select: { name: true } } } }, listing: true },
    }),
    prisma.stagingHubTicket.findMany({ where: { cooperativeId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.order.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { listing: true, buyer: { select: { name: true } } },
    }),
  ]);

  const totalDebt = members.reduce((s, m) => s + Number(m.outstandingDebtPHP), 0);
  const bankLast4 = coop.bankInfo ? coop.bankInfo.replace(/\s/g, "").slice(-4) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <PageHeader icon="🤝" title={coop.name} subtitle={`Cooperative dashboard · ${coop.municipality}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon="👥" tone="green" label="Members" value={members.length} />
        <StatCard icon="🧾" tone="gold" label="Member debt outstanding" value={formatPeso(totalDebt)} />
        <StatCard icon="📦" tone="neutral" label="Bulk lots" value={lots.length} />
      </div>

      <VerificationStatusCard idVerificationStatus={me.idVerificationStatus} kycStatus={me.kycStatus} />

      <PendingSignoffs cooperativeId={cooperativeId} />

      <PriceBenchmarks />

      {/* ---------- Consolidated bulk lots ---------- */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Create consolidated bulk lot</CardTitle>
            <CardDescription>Pools member harvests into one cooperative-owned listing. Proceeds are allocated back to contributors pro rata.</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-neutral-500">Add members first — each lot records who contributed how many kg.</p>
            ) : (
              <ActionForm action={createBulkLot} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="lot-crop">Crop</Label><Input id="lot-crop" name="cropType" placeholder="Palay (Rice)" required /></div>
                  <div><Label htmlFor="lot-price">Asking ₱/kg</Label><Input id="lot-price" name="askingPricePerKg" type="number" min="0" step="0.01" required /></div>
                  <div><Label htmlFor="lot-h">Harvest date</Label><Input id="lot-h" name="harvestDate" type="date" required /></div>
                  <div><Label htmlFor="lot-m">Municipality</Label><Input id="lot-m" name="municipality" defaultValue={coop.municipality} required /></div>
                  <div>
                    <Label htmlFor="lot-q">Quality tag</Label>
                    <Select id="lot-q" name="qualityTag" defaultValue="STANDARD">
                      <option value="STANDARD">Standard</option>
                      <option value="GRADE_A">Grade A</option>
                      <option value="ORGANIC">Organic</option>
                      <option value="GAP_CERTIFIED">GAP certified</option>
                    </Select>
                  </div>
                  <div><Label htmlFor="lot-photo">Lot photo</Label><Input id="lot-photo" name="photo" type="file" accept="image/*" required /></div>
                </div>
                <CommodityFields idPrefix="lot" />
                <div>
                  <p className="mb-1 text-sm font-medium">Member contributions (kg)</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {members.map((m) => (
                      <div key={m.id}>
                        <Label htmlFor={`w_${m.id}`}>{m.name}</Label>
                        <Input id={`w_${m.id}`} name={`w_${m.id}`} type="number" min="0" step="0.1" />
                      </div>
                    ))}
                  </div>
                </div>
                <div><Label htmlFor="lot-d">Description</Label><Textarea id="lot-d" name="description" rows={2} /></div>
                <SubmitButton className="w-full" label="Publish bulk lot" pendingLabel="Publishing…" />
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent lots</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lots.length === 0 && <p className="text-sm text-neutral-500">No lots yet.</p>}
            {lots.map((l) => (
              <div key={l.id} className="rounded-lg border border-black/10 p-3 text-sm">
                <p className="font-medium">{l.cropType} · {l.totalWeightKg} kg <Badge tone="green">{l.cropCategory}</Badge></p>
                {l.listing && <p className="text-xs text-neutral-500">{formatPeso(l.listing.askingPricePerKg)}/kg · {commodityQualitySummary(l.listing)}</p>}
                <p className="text-xs text-neutral-500">{l.contributions.map((c) => `${c.member.name} ${c.weightKg} kg`).join(" · ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Member loan manager ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Member loan manager</CardTitle>
          <CardDescription>
            Deductions are taken from each member&apos;s share of cooperative proceeds and never exceed their outstanding debt. Ledger entries are permanent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={addMember} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Label htmlFor="am-n">Member name</Label><Input id="am-n" name="name" required /></div>
            <div><Label htmlFor="am-p">Phone</Label><Input id="am-p" name="phone" /></div>
            <div><Label htmlFor="am-d">Deduction %</Label><Input id="am-d" name="deductionPct" type="number" min="0" max="100" step="0.01" defaultValue="0" /></div>
            <div className="flex items-end"><SubmitButton size="sm" label="Add member" pendingLabel="Adding…" /></div>
          </ActionForm>

          {members.map((m) => (
            <div key={m.id} className="rounded-lg border border-black/10 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{m.name}{m.phone ? ` · ${m.phone}` : ""}</p>
                <p>Debt <b className="text-brand-gold-700">{formatPeso(Number(m.outstandingDebtPHP))}</b> · deduction {(Number(m.deductionPct) * 100).toFixed(2)}%</p>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                <ActionForm action={issueLoan} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="memberId" value={m.id} />
                  <div><Label htmlFor={`ln-${m.id}`}>Issue loan ₱</Label><Input id={`ln-${m.id}`} name="amountPHP" type="number" min="0" step="0.01" required /></div>
                  <div><Label htmlFor={`lnn-${m.id}`}>Note</Label><Input id={`lnn-${m.id}`} name="note" /></div>
                  <SubmitButton size="sm" label="Issue" pendingLabel="…" />
                </ActionForm>
                <ActionForm action={setMemberDeduction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="memberId" value={m.id} />
                  <div><Label htmlFor={`dp-${m.id}`}>Deduction %</Label><Input id={`dp-${m.id}`} name="deductionPct" type="number" min="0" max="100" step="0.01" defaultValue={(Number(m.deductionPct) * 100).toFixed(2)} /></div>
                  <SubmitButton size="sm" variant="outline" label="Set rate" pendingLabel="…" />
                </ActionForm>
              </div>
              {m.ledger.length > 0 && (
                <ul className="mt-2 divide-y divide-black/5 text-xs text-neutral-600">
                  {m.ledger.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2 py-1">
                      <span>{e.createdAt.toLocaleDateString()} · {e.type.replace(/_/g, " ").toLowerCase()}{e.note ? ` — ${e.note}` : ""}</span>
                      <span>{formatPeso(Number(e.amountPHP))} → balance {formatPeso(Number(e.balanceAfterPHP))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- Staging hub ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Staging hub</CardTitle>
          <CardDescription>Weighbridge tickets for member drop-offs and outbound dispatches. Cooperative hubs also serve as cross-dock points for the load-deficit dispatch engine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={createStagingTicket} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="st-k">Type</Label>
              <Select id="st-k" name="kind" defaultValue="DROP_OFF">
                <option value="DROP_OFF">Member drop-off</option>
                <option value="DISPATCH">Dispatch out</option>
              </Select>
            </div>
            <div><Label htmlFor="st-t">Weighbridge ticket #</Label><Input id="st-t" name="weighbridgeTicketNo" required /></div>
            <div><Label htmlFor="st-c">Crop</Label><Input id="st-c" name="cropType" required /></div>
            <div><Label htmlFor="st-w">Weight (kg)</Label><Input id="st-w" name="weightKg" type="number" min="0" step="0.01" required /></div>
            <div>
              <Label htmlFor="st-m">Member (drop-off)</Label>
              <Select id="st-m" name="memberId" defaultValue="">
                <option value="">—</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="st-b">Batch code</Label><Input id="st-b" name="batchCode" /></div>
            <div>
              <Label htmlFor="st-o">Order (dispatch)</Label>
              <Select id="st-o" name="orderId" defaultValue="">
                <option value="">—</option>
                {orders.map((o) => <option key={o.id} value={o.id}>#{o.id.slice(-8)} · {o.listing.cropType}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="st-n">Notes</Label><Input id="st-n" name="notes" /></div>
            <div className="col-span-2 sm:col-span-4"><SubmitButton size="sm" label="Record ticket" pendingLabel="Saving…" /></div>
          </ActionForm>
          {tickets.length === 0 ? (
            <p className="text-sm text-neutral-500">No tickets yet.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><Badge tone={t.kind === "DROP_OFF" ? "green" : "gold"}>{t.kind.replace("_", " ")}</Badge> #{t.weighbridgeTicketNo} · {t.cropType} · {t.weightKg} kg</span>
                  <span className="text-neutral-500">{t.createdAt.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---------- Orders ---------- */}
      <Card>
        <CardHeader><CardTitle>Cooperative orders</CardTitle></CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-neutral-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/orders/${o.id}`} className="text-brand-green-700 underline">#{o.id.slice(-8)} · {o.listing.cropType} · {o.volumeKg} kg</Link>
                  <span>{o.buyer.name} · <Badge tone={o.status === "SETTLED" ? "green" : "gold"}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---------- Bank info (protected) ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Settlement account</CardTitle>
          <CardDescription>Visible only to your cooperative admin and ANI-KONEKTA admins. Never shown to buyers or on listings.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-neutral-600">{bankLast4 ? `On file: ••••${bankLast4}` : "Nothing on file."}</p>
          <ActionForm action={saveBankInfo} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1"><Label htmlFor="bank">Bank / e-wallet details (replaces current; blank clears)</Label><Input id="bank" name="bankInfo" autoComplete="off" /></div>
            <SubmitButton size="sm" label="Save" pendingLabel="Saving…" />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

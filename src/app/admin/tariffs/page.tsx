import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { TariffCalculator } from "@/components/admin/tariff-calculator";
import { saveTariff, addBenchmark } from "@/app/admin/tariffs/actions";
import { DEFAULT_TARIFFS } from "@/lib/freight";

export default async function AdminTariffsPage() {
  const [tariffs, benchmarks] = await Promise.all([
    prisma.commodityFreightTariff.findMany(),
    prisma.benchmarkPrice.findMany({ orderBy: { asOfDate: "desc" }, take: 10 }),
  ]);
  const byKey = new Map(tariffs.map((t) => [`${t.routeZone}|${t.cropCategory}`, t]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Commodity freight tariffs</h1>
          <p className="text-sm text-neutral-600">
            Live, database-driven rates per route zone × crop category. Saving applies to the very next
            checkout — no restart or redeploy. Existing orders keep the tariff snapshot they were created with.
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← Admin</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Freight calculator</CardTitle></CardHeader>
        <CardContent><TariffCalculator /></CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {DEFAULT_TARIFFS.map((d) => {
          const t = byKey.get(`${d.routeZone}|${d.cropCategory}`);
          const id = `${d.routeZone}-${d.cropCategory}`;
          return (
            <Card key={id} className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
              <CardHeader>
                <CardTitle>
                  {d.routeZone} · {d.cropCategory}
                  {!t && <span className="ml-2 text-xs font-normal text-red-600">not configured — checkout blocked</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={saveTariff} className="grid grid-cols-2 gap-3">
                  <input type="hidden" name="routeZone" value={d.routeZone} />
                  <input type="hidden" name="cropCategory" value={d.cropCategory} />
                  <div><Label htmlFor={`${id}-rate`}>Rate ₱/kg</Label><Input id={`${id}-rate`} name="ratePerKg" type="number" step="0.0001" min="0" defaultValue={t ? Number(t.ratePerKg) : ""} required /></div>
                  <div><Label htmlFor={`${id}-floor`}>Base floor ₱</Label><Input id={`${id}-floor`} name="baseFloorFee" type="number" step="0.01" min="0" defaultValue={t ? Number(t.baseFloorFee) : ""} required /></div>
                  <div><Label htmlFor={`${id}-toll`}>Toll pass-through ₱</Label><Input id={`${id}-toll`} name="tollPassThrough" type="number" step="0.01" min="0" defaultValue={t ? Number(t.tollPassThrough) : 0} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label htmlFor={`${id}-h`}>Hauler %</Label><Input id={`${id}-h`} name="haulerSharePct" type="number" step="0.01" min="0" max="100" defaultValue={t ? Number(t.haulerSharePct) * 100 : ""} required /></div>
                    <div><Label htmlFor={`${id}-p`}>Platform %</Label><Input id={`${id}-p`} name="platformSharePct" type="number" step="0.01" min="0" max="100" defaultValue={t ? Number(t.platformSharePct) * 100 : ""} required /></div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <p className="text-xs text-neutral-400">
                      {t ? `Last updated ${t.updatedAt.toLocaleString()}${t.updatedByAdminId ? ` by admin …${t.updatedByAdminId.slice(-6)}` : ""}` : "Using seed defaults only when a row is missing."}
                    </p>
                    <SubmitButton size="sm" label="Save tariff" pendingLabel="Saving…" />
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Price intelligence — DA/PSA Central Luzon benchmarks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">
            No live DA/PSA price feed is connected. Benchmarks appear to sellers only when a record with a real
            source and date is entered here — nothing is fabricated.
          </p>
          <ActionForm action={addBenchmark} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div><Label htmlFor="bm-crop">Crop</Label><Input id="bm-crop" name="cropType" placeholder="Palay (Rice)" required /></div>
            <div><Label htmlFor="bm-price">₱/kg</Label><Input id="bm-price" name="pricePerKg" type="number" step="0.01" min="0" required /></div>
            <div><Label htmlFor="bm-src">Source</Label><Input id="bm-src" name="source" placeholder="DA Bantay Presyo, Cabanatuan" required /></div>
            <div><Label htmlFor="bm-date">As of</Label><Input id="bm-date" name="asOfDate" type="date" required /></div>
            <div className="flex items-end"><SubmitButton size="sm" label="Add benchmark" pendingLabel="Saving…" /></div>
          </ActionForm>
          {benchmarks.length === 0 ? (
            <p className="text-sm text-neutral-500">No benchmark records yet.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {benchmarks.map((b) => (
                <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{b.cropType} · {b.region}</span>
                  <span>₱{b.pricePerKg.toFixed(2)}/kg · {b.source} · {b.asOfDate.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

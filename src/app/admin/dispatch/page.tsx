import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { VEHICLE_CAPACITY_KG, UTILIZATION_THRESHOLD } from "@/lib/dispatch-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { addBackhaulCargo, evaluateAllDue, evaluateRouteNow } from "@/app/admin/dispatch/actions";

type LogEntry = { level: number; action: string; result: string };

export default async function AdminDispatchPage() {
  const [routes, cargo] = await Promise.all([
    prisma.pooledRoute.findMany({
      where: { status: "ASSIGNED" },
      orderBy: { createdAt: "desc" },
      include: { hauler: true, orders: { select: { volumeKg: true } } },
    }),
    prisma.backhaulCargo.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Load-deficit dispatch</h1>
          <p className="text-sm text-neutral-600">
            Trips under {UTILIZATION_THRESHOLD * 100}% utilization at cutoff run four contingency levels: L1 right-size vehicle,
            L2 cooperative-hub cross-dock (no ownership transfer), L3 +20 km catchment, L4 verified return hauler.
            The level that resolved the deficit is recorded. A daily cron evaluates due trips; use the buttons for on-demand runs.
          </p>
        </div>
        <div className="flex gap-2">
          <ActionForm action={evaluateAllDue}>
            <SubmitButton size="sm" label="Evaluate all due trips" pendingLabel="Evaluating…" />
          </ActionForm>
          <Link href="/admin"><Button variant="outline" size="sm">← Admin</Button></Link>
        </div>
      </div>

      {routes.length === 0 && <p className="text-sm text-neutral-500">No trips awaiting dispatch.</p>}
      {routes.map((r) => {
        const booked = r.orders.reduce((s, o) => s + o.volumeKg, 0);
        const cap = r.capacityKg ?? (r.vehicleType ? VEHICLE_CAPACITY_KG[r.vehicleType] : null);
        const log = (r.dispatchLog as LogEntry[] | null) ?? [];
        return (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>Trip …{r.id.slice(-6)} · {r.hauler.name}</span>
                <Badge>{r.vehicleType ?? "vehicle n/a"}</Badge>
                {r.dispatchDecision && <Badge>{r.dispatchDecision}</Badge>}
              </CardTitle>
              <p className="text-xs text-neutral-500">
                Booked {booked.toLocaleString()} kg{cap ? ` of ${cap.toLocaleString()} kg` : ""}
                {r.utilizationPct != null ? ` · ${r.utilizationPct.toFixed(1)}% utilization` : ""}
                {r.cutoffAt ? ` · cutoff ${r.cutoffAt.toLocaleString()}` : " · no cutoff set"}
                {r.deficitResolvedLevel != null ? ` · resolved at level ${r.deficitResolvedLevel}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {log.length > 0 ? (
                <ol className="space-y-1 text-sm">
                  {log.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-xs text-neutral-500">L{e.level}</span>
                      <span><b>{e.action}</b> — {e.result}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-neutral-500">Not evaluated yet.</p>
              )}
              <ActionForm action={evaluateRouteNow}>
                <input type="hidden" name="routeId" value={r.id} />
                <SubmitButton size="sm" variant="outline" label="Evaluate now" pendingLabel="Evaluating…" />
              </ActionForm>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader><CardTitle>Backhaul cargo records</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">
            Real return-load offers only — the hauler Backhaul Finder shows nothing when none exist. Leave the price blank for “not quoted”.
          </p>
          <ActionForm action={addBackhaulCargo} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Label htmlFor="bh-p">Pickup municipality</Label><Input id="bh-p" name="pickupMunicipality" required /></div>
            <div><Label htmlFor="bh-d">Destination</Label><Input id="bh-d" name="destinationMunicipality" required /></div>
            <div><Label htmlFor="bh-c">Cargo type</Label><Input id="bh-c" name="cargoType" required /></div>
            <div><Label htmlFor="bh-w">Weight (kg)</Label><Input id="bh-w" name="weightKg" type="number" min="0" step="1" required /></div>
            <div><Label htmlFor="bh-a">Available from</Label><Input id="bh-a" name="availableFrom" type="datetime-local" required /></div>
            <div><Label htmlFor="bh-o">Offered ₱ (optional)</Label><Input id="bh-o" name="offeredPricePHP" type="number" min="0" step="0.01" /></div>
            <div className="col-span-2"><Label htmlFor="bh-n">Notes</Label><Input id="bh-n" name="notes" /></div>
            <div className="col-span-2 sm:col-span-4"><SubmitButton size="sm" label="Add cargo" pendingLabel="Saving…" /></div>
          </ActionForm>
          {cargo.length === 0 ? (
            <p className="text-sm text-neutral-500">No backhaul cargo recorded.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {cargo.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{c.pickupMunicipality} → {c.destinationMunicipality} · {c.cargoType} · {c.weightKg} kg</span>
                  <span>{c.offeredPricePHP != null ? `₱${c.offeredPricePHP.toFixed(2)}` : "not quoted"} · {c.active ? "active" : "inactive"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

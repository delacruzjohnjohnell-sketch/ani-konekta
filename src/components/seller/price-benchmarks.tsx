import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/lib/utils";

/**
 * Market price intelligence. Shows only admin-entered benchmark records, each
 * with its source and as-of date. No live DA/PSA feed is connected, so when
 * there is nothing on file we say so instead of showing any price.
 */
export async function PriceBenchmarks() {
  const rows = await prisma.benchmarkPrice.findMany({ orderBy: { asOfDate: "desc" }, take: 60 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.cropType}|${r.region}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  const list = Array.from(latest.values()).slice(0, 8);

  return (
    <Card>
      <CardHeader><CardTitle>Market price benchmarks</CardTitle></CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No benchmark prices on file. ANI-KONEKTA has no live DA/PSA price feed connected, so none are shown — check with your
            local market or municipal agriculture office.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 text-sm">
            {list.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium">{b.cropType}</span>
                <span>
                  {formatPeso(b.pricePerKg)}/kg
                  <span className="ml-2 text-xs text-neutral-500">{b.source} · as of {b.asOfDate.toISOString().slice(0, 10)} · {b.region}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

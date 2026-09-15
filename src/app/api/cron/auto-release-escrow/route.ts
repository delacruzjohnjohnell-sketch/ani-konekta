import { NextRequest, NextResponse } from "next/server";
import { sweepAutoReleaseEligibleOrders } from "@/lib/escrow-auto-release";

// Vercel Cron hits this on the schedule in vercel.json. Protected by
// CRON_SECRET (Vercel's standard pattern: it sends
// `Authorization: Bearer $CRON_SECRET` on cron-triggered requests) — set
// CRON_SECRET in the Vercel project's env vars for this to actually gate
// access; without it set, this route is intentionally left open only in
// environments where the env var is unset (e.g. local dev), matching how
// Vercel's own docs describe this pattern.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await sweepAutoReleaseEligibleOrders();
  return NextResponse.json({
    checked: results.length,
    released: results.filter((r) => r.released).length,
    results,
  });
}

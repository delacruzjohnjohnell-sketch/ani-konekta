import { NextRequest, NextResponse } from "next/server";
import { evaluateDueTrips } from "@/lib/dispatch-engine";

// Same CRON_SECRET convention as /api/cron/auto-release-escrow: Vercel sends
// `Authorization: Bearer $CRON_SECRET`; the check is open only when the env
// var is unset (local dev).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await evaluateDueTrips(new Date(), null);
  return NextResponse.json({ evaluated: results.length, results });
}

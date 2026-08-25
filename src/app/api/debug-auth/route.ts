import { NextResponse } from "next/server";

// Diagnostic route retired after confirming the secureCookie fix in
// proxy.ts. Left as a harmless 404 rather than deleted (see README/
// git history for the original investigation).
export async function GET() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

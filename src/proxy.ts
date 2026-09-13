import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Next.js 16 renamed middleware.js -> proxy.js (same runtime behavior).
// Role-based route protection for /seller, /buyer, /hauler, /admin.
const ROLE_PREFIXES: Record<string, string> = {
  "/seller": "SELLER",
  "/buyer": "BUYER",
  "/hauler": "HAULER",
  "/admin": "ADMIN",
};

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const matchedPrefix = Object.keys(ROLE_PREFIXES).find((p) =>
    pathname.startsWith(p)
  );
  if (!matchedPrefix) return NextResponse.next();

  // getToken() doesn't reliably auto-detect https in this Vercel/Next 16
  // combo (confirmed live: x-forwarded-proto was "https" but the plain
  // call still returned null), so it was looking up the unprefixed
  // cookie name instead of the actual __Secure-authjs.session-token
  // cookie NextAuth sets in production. Derive it from x-forwarded-proto
  // (set by Vercel's proxy) instead of hardcoding true, which broke local
  // dev over plain http (NextAuth sets the unprefixed cookie there).
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const secureCookie =
    forwardedProto === "https" || request.nextUrl.protocol === "https:";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requiredRole = ROLE_PREFIXES[matchedPrefix];
  if (token.role !== requiredRole) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/seller/:path*", "/buyer/:path*", "/hauler/:path*", "/admin/:path*"],
};

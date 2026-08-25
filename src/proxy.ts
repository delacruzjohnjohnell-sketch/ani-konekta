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

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
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

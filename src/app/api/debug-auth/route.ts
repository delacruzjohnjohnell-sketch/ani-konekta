import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// TEMPORARY diagnostic route — remove after debugging the proxy.ts /
// auth.ts session mismatch. Does not expose secret values, only
// presence/length and which one successfully decodes the token.
export async function GET(request: NextRequest) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);

  const authSecret = process.env.AUTH_SECRET;
  const nextauthSecret = process.env.NEXTAUTH_SECRET;

  const results: Record<string, unknown> = {
    cookieNames,
    hasAuthSecret: !!authSecret,
    authSecretLen: authSecret?.length ?? 0,
    hasNextauthSecret: !!nextauthSecret,
    nextauthSecretLen: nextauthSecret?.length ?? 0,
    nextauthUrl: process.env.NEXTAUTH_URL ?? null,
    authUrl: process.env.AUTH_URL ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const tokenWithAuthSecret = authSecret
      ? await getToken({ req: request, secret: authSecret })
      : null;
    results.tokenWithAuthSecret = tokenWithAuthSecret
      ? { role: tokenWithAuthSecret.role, id: tokenWithAuthSecret.id }
      : null;
  } catch (e) {
    results.tokenWithAuthSecretError = String(e);
  }

  try {
    const tokenWithNextauthSecret = nextauthSecret
      ? await getToken({ req: request, secret: nextauthSecret })
      : null;
    results.tokenWithNextauthSecret = tokenWithNextauthSecret
      ? { role: tokenWithNextauthSecret.role, id: tokenWithNextauthSecret.id }
      : null;
  } catch (e) {
    results.tokenWithNextauthSecretError = String(e);
  }

  try {
    const tokenNoSecretArg = await getToken({ req: request });
    results.tokenNoSecretArg = tokenNoSecretArg
      ? { role: tokenNoSecretArg.role, id: tokenNoSecretArg.id }
      : null;
  } catch (e) {
    results.tokenNoSecretArgError = String(e);
  }

  return NextResponse.json(results);
}

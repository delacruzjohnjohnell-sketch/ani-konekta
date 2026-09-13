import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { CartIcon } from "@/components/buyer/cart-icon";

const ROLE_HOME: Record<string, string> = {
  SELLER: "/seller/dashboard",
  BUYER: "/buyer/dashboard",
  HAULER: "/hauler/dashboard",
  ADMIN: "/admin",
};

export async function Navbar() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="ANI-KONEKTA" width={36} height={31} className="h-9 w-auto" priority />
          <span className="font-bold text-neutral-900">
            ANI-<span className="text-brand-green-700">KONEKTA</span>
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          {session?.user ? (
            <>
              <Link
                href={ROLE_HOME[session.user.role] ?? "/"}
                className="hidden text-sm font-medium text-neutral-700 hover:text-brand-green-700 sm:inline"
              >
                {t("nav.myDashboard", locale)}
              </Link>
              <span className="hidden text-sm text-neutral-500 sm:inline">
                {session.user.name} ·{" "}
                <span className="font-medium text-brand-green-700">{session.user.role}</span>
              </span>
              {session.user.role === "BUYER" && <CartIcon />}
              <LanguageToggle currentLocale={locale} />
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button variant="outline" size="sm" type="submit">
                  {t("nav.signOut", locale)}
                </Button>
              </form>
            </>
          ) : (
            <>
              <LanguageToggle currentLocale={locale} />
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t("nav.login", locale)}
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  {t("nav.signup", locale)}
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { CartIcon } from "@/components/buyer/cart-icon";
import { countUnreadForUser } from "@/lib/messaging";
import { getOrCreateWallet } from "@/lib/wallet";
import { isNet30Approved } from "@/lib/credit";

const ROLE_HOME: Record<string, string> = {
  SELLER: "/seller/dashboard",
  BUYER: "/buyer/dashboard",
  HAULER: "/hauler/dashboard",
  ADMIN: "/admin",
  COOPERATIVE_ADMIN: "/cooperative/dashboard",
};

export async function Navbar() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  const canMessage =
    session?.user?.role === "BUYER" ||
    session?.user?.role === "SELLER" ||
    session?.user?.role === "COOPERATIVE_ADMIN";
  const isBuyer = session?.user?.role === "BUYER";
  const [unreadCount, wallet, net30Eligible] = await Promise.all([
    canMessage ? countUnreadForUser(session!.user.id, session!.user.role) : 0,
    isBuyer ? getOrCreateWallet(session!.user.id) : null,
    isBuyer ? isNet30Approved(session!.user.id) : false,
  ]);

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="ANI-KONEKTA" width={36} height={31} className="h-9 w-auto" priority />
          <span className="hidden whitespace-nowrap font-bold text-neutral-900 sm:inline">
            ANI-<span className="text-brand-green-700">KONEKTA</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {session?.user ? (
            <>
              <Link
                href={ROLE_HOME[session.user.role] ?? "/"}
                className="hidden text-sm font-medium text-neutral-700 hover:text-brand-green-700 sm:inline"
              >
                {t("nav.myDashboard", locale)}
              </Link>
              <Link
                href="/sms"
                className="hidden text-sm font-medium text-neutral-700 hover:text-brand-green-700 sm:inline"
              >
                {t("nav.sms", locale)}
              </Link>
              <span className="hidden text-sm text-neutral-500 sm:inline">
                {session.user.name} ·{" "}
                <span className="font-medium text-brand-green-700">{session.user.role}</span>
              </span>
              {canMessage && (
                <Link
                  href="/messages"
                  aria-label={t("nav.messages", locale)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-brand-green-50 hover:text-brand-green-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-gold-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              )}
              {session.user.role === "BUYER" && (
                <Link
                  href="/buyer/wallet"
                  aria-label={t("nav.wallet", locale)}
                  className="hidden h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-brand-green-50 hover:text-brand-green-700 sm:flex"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    <circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                </Link>
              )}
              {session.user.role === "BUYER" && (
                <CartIcon walletBalancePHP={wallet?.availableBalancePHP ?? 0} net30Eligible={net30Eligible} />
              )}
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

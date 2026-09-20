import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { CartProvider } from "@/lib/cart/cart-context";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ani-konekta.vercel.app";
const SITE_TITLE = "ANI-KONEKTA — From Farm to Fair Trade";
const SITE_DESCRIPTION =
  "A B2B agricultural marketplace and logistics-coordination platform connecting Nueva Ecija farmers and cooperatives directly to retailers, wholesalers, and institutional buyers.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · ANI-KONEKTA" },
  description: SITE_DESCRIPTION,
  applicationName: "ANI-KONEKTA",
  keywords: [
    "ANI-KONEKTA",
    "agricultural marketplace Philippines",
    "Nueva Ecija farmers",
    "farm to market",
    "agri logistics",
    "cooperative bulk lots",
    "palay",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "ANI-KONEKTA",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_PH",
    images: [{ url: "/logo.png", alt: "ANI-KONEKTA" }],
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION, images: ["/logo.png"] },
};

export const viewport: Viewport = { themeColor: "#1e7a3d", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-brand-green-950">
        <I18nProvider locale={locale}>
          <CartProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-brand-green-900/10 bg-white/70 py-6 text-center text-xs text-neutral-500 backdrop-blur">
              <span className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-gold-500" />
                {t("footer.tagline", locale)}
              </span>
            </footer>
          </CartProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

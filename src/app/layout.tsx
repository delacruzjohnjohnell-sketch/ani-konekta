import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { CartProvider } from "@/lib/cart/cart-context";

export const metadata: Metadata = {
  title: "ANI-KONEKTA — From Farm to Fair Trade",
  description:
    "A B2B agricultural marketplace and logistics-coordination platform connecting Nueva Ecija farmers and cooperatives directly to retailers, wholesalers, and institutional buyers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <I18nProvider locale={locale}>
          <CartProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-black/10 bg-white py-6 text-center text-xs text-neutral-500">
              {t("footer.tagline", locale)}
            </footer>
          </CartProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

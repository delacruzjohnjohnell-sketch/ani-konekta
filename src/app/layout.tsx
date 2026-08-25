import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "ANI-KONEKTA — From Farm to Fair Trade",
  description:
    "A B2B agricultural marketplace and logistics-coordination platform connecting Nueva Ecija farmers and cooperatives directly to retailers, wholesalers, and institutional buyers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/10 bg-white py-6 text-center text-xs text-neutral-500">
          ANI-KONEKTA · &ldquo;From Farm to Fair Trade.&rdquo; · MVP demo build
        </footer>
      </body>
    </html>
  );
}

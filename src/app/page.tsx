import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  {
    title: "List",
    body: "Farmers and co-ops post crop, volume, harvest date, and price.",
    tone: "green" as const,
  },
  {
    title: "Match",
    body: "Buyers browse or get matched; bulk-match aggregates smallholders into one order.",
    tone: "gold" as const,
  },
  {
    title: "Move",
    body: "Pooled logistics batches nearby orders into shared truck trips via verified haulers.",
    tone: "green" as const,
  },
  {
    title: "Settle",
    body: "Escrow-held payment releases to the seller only once delivery is confirmed.",
    tone: "gold" as const,
  },
];

const ROLES = [
  {
    title: "Farmers & Co-ops",
    body: "List produce with harvest date, quality grade, and a fair AI-suggested price. Get paid the moment delivery is confirmed.",
    href: "/register?role=SELLER",
    cta: "I'm a Farmer / Seller",
    variant: "primary" as const,
    accent: "from-brand-green-600 to-brand-green-800",
    emoji: "🌾",
  },
  {
    title: "Buyers & Traders",
    body: "Browse verified listings by crop, municipality, and grade — or bulk-match several smallholders into one shipment.",
    href: "/register?role=BUYER",
    cta: "I'm a Buyer",
    variant: "secondary" as const,
    accent: "from-brand-gold-400 to-brand-gold-600",
    emoji: "🧺",
  },
  {
    title: "Haulers",
    body: "Accept pooled routes by municipality, update pickup and delivery status, and get proof-of-delivery on record.",
    href: "/register?role=HAULER",
    cta: "I'm a Hauler",
    variant: "outline" as const,
    accent: "from-brand-green-500 to-brand-gold-500",
    emoji: "🚚",
  },
];

export default function Home() {
  return (
    <div>
      <section className="harvest-hero relative overflow-hidden border-b border-black/5">
        {/* Decorative rice-field + sunrise motif, echoing the logo */}
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-brand-green-700/15 sm:h-56"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,140 C150,100 300,180 450,130 C600,80 750,170 900,120 C1050,80 1150,140 1200,110 L1200,200 L0,200 Z" />
        </svg>
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-brand-green-800/25 sm:h-40"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,170 C200,130 350,190 520,150 C680,115 820,180 1000,140 C1080,120 1150,150 1200,140 L1200,200 L0,200 Z" />
        </svg>
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-brand-gold-400/40 blur-2xl sm:h-96 sm:w-96"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-5 flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="ANI-KONEKTA logo"
                  width={56}
                  height={48}
                  className="h-12 w-auto drop-shadow-sm"
                  priority
                />
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-gold-700">
                  Agriculture / AgriTech · Nueva Ecija
                </p>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-brand-green-950 sm:text-5xl">
                ANI-KONEKTA
              </h1>
              <p className="mt-3 max-w-xl text-lg text-neutral-700">
                &ldquo;From Farm to Fair Trade.&rdquo; A B2B marketplace and
                pooled-logistics platform connecting Nueva Ecija farmers and
                cooperatives directly to retailers, wholesalers, and institutional
                buyers — with escrow-protected payment so no one delivers produce on
                a promise.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register?role=SELLER">
                  <Button size="lg">I&apos;m a Farmer / Seller</Button>
                </Link>
                <Link href="/register?role=BUYER">
                  <Button size="lg" variant="secondary">
                    I&apos;m a Buyer
                  </Button>
                </Link>
                <Link href="/register?role=HAULER">
                  <Button size="lg" variant="outline">
                    I&apos;m a Hauler
                  </Button>
                </Link>
              </div>
            </div>

            {/* Simple, colorful "field + sun + delivery" illustration echoing the logo motif */}
            <div className="relative hidden h-64 w-72 shrink-0 lg:block">
              <svg viewBox="0 0 320 260" className="h-full w-full" aria-hidden="true">
                <circle cx="230" cy="80" r="46" fill="var(--brand-gold-400)" />
                <path
                  d="M0,190 C60,150 120,210 180,170 C220,145 270,175 320,155 L320,260 L0,260 Z"
                  fill="var(--brand-green-600)"
                />
                <path
                  d="M0,215 C70,185 140,230 200,200 C240,180 280,205 320,190 L320,260 L0,260 Z"
                  fill="var(--brand-green-800)"
                />
                <g stroke="var(--brand-gold-600)" strokeWidth="4" strokeLinecap="round">
                  <line x1="60" y1="230" x2="52" y2="180" />
                  <line x1="80" y1="235" x2="78" y2="175" />
                  <line x1="100" y1="230" x2="106" y2="180" />
                </g>
                <rect x="150" y="185" width="46" height="30" rx="3" fill="var(--brand-green-950)" />
                <rect x="196" y="195" width="22" height="20" rx="2" fill="var(--brand-green-950)" />
                <circle cx="163" cy="218" r="7" fill="var(--brand-green-950)" />
                <circle cx="200" cy="218" r="7" fill="var(--brand-green-950)" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-xl font-semibold text-brand-green-950">How it works</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="overflow-hidden">
              <div
                className={
                  s.tone === "green"
                    ? "h-1.5 bg-gradient-to-r from-brand-green-500 to-brand-green-800"
                    : "h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700"
                }
              />
              <CardContent className="pt-5">
                <div
                  className={
                    s.tone === "green"
                      ? "mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-green-500 to-brand-green-800 text-sm font-bold text-white shadow-sm"
                      : "mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold-400 to-brand-gold-700 text-sm font-bold text-brand-green-950 shadow-sm"
                  }
                >
                  {i + 1}
                </div>
                <h3 className="font-semibold text-brand-green-950">{s.title}</h3>
                <p className="mt-1 text-sm text-neutral-600">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="text-xl font-semibold text-brand-green-950">Built for every role</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r.title} className="flex flex-col overflow-hidden">
              <div className={`flex h-24 items-center justify-center bg-gradient-to-br text-4xl ${r.accent}`}>
                <span role="img" aria-label="">
                  {r.emoji}
                </span>
              </div>
              <CardContent className="flex flex-1 flex-col pt-5">
                <h3 className="font-semibold text-brand-green-950">{r.title}</h3>
                <p className="mt-1 flex-1 text-sm text-neutral-600">{r.body}</p>
                <Link href={r.href} className="mt-4">
                  <Button variant={r.variant} className="w-full">
                    {r.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <Card className="harvest-band overflow-hidden text-white">
          <CardContent className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">See the full trade pipeline in action</h2>
              <p className="mt-1 text-white/85">
                Log in with a demo account to explore the seller, buyer, hauler, and
                admin views — see README.md for demo credentials.
              </p>
            </div>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                Log in to demo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

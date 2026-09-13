import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

const STEPS = [
  { titleKey: "landing.step.list.title", bodyKey: "landing.step.list.body", tone: "green" as const },
  { titleKey: "landing.step.match.title", bodyKey: "landing.step.match.body", tone: "gold" as const },
  { titleKey: "landing.step.move.title", bodyKey: "landing.step.move.body", tone: "green" as const },
  { titleKey: "landing.step.settle.title", bodyKey: "landing.step.settle.body", tone: "gold" as const },
];

const ROLES = [
  {
    titleKey: "landing.role.farmers.title",
    bodyKey: "landing.role.farmers.body",
    href: "/register?role=SELLER",
    ctaKey: "landing.ctaSeller",
    variant: "primary" as const,
    accent: "from-brand-green-600 to-brand-green-800",
    emoji: "🌾",
  },
  {
    titleKey: "landing.role.buyers.title",
    bodyKey: "landing.role.buyers.body",
    href: "/register?role=BUYER",
    ctaKey: "landing.ctaBuyer",
    variant: "secondary" as const,
    accent: "from-brand-gold-400 to-brand-gold-600",
    emoji: "🧺",
  },
  {
    titleKey: "landing.role.haulers.title",
    bodyKey: "landing.role.haulers.body",
    href: "/register?role=HAULER",
    ctaKey: "landing.ctaHauler",
    variant: "outline" as const,
    accent: "from-brand-green-500 to-brand-gold-500",
    emoji: "🚚",
  },
];

export default async function Home() {
  const locale = await getLocale();
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
                  {t("landing.category", locale)}
                </p>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-brand-green-950 sm:text-5xl">
                ANI-KONEKTA
              </h1>
              <p className="mt-3 max-w-xl text-lg text-neutral-700">{t("landing.tagline", locale)}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register?role=SELLER">
                  <Button size="lg">{t("landing.ctaSeller", locale)}</Button>
                </Link>
                <Link href="/register?role=BUYER">
                  <Button size="lg" variant="secondary">
                    {t("landing.ctaBuyer", locale)}
                  </Button>
                </Link>
                <Link href="/register?role=HAULER">
                  <Button size="lg" variant="outline">
                    {t("landing.ctaHauler", locale)}
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
        <h2 className="text-xl font-semibold text-brand-green-950">{t("landing.howItWorks", locale)}</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.titleKey} className="overflow-hidden">
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
                <h3 className="font-semibold text-brand-green-950">{t(s.titleKey, locale)}</h3>
                <p className="mt-1 text-sm text-neutral-600">{t(s.bodyKey, locale)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="text-xl font-semibold text-brand-green-950">{t("landing.builtForEveryRole", locale)}</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r.titleKey} className="flex flex-col overflow-hidden">
              <div className={`flex h-24 items-center justify-center bg-gradient-to-br text-4xl ${r.accent}`}>
                <span role="img" aria-label="">
                  {r.emoji}
                </span>
              </div>
              <CardContent className="flex flex-1 flex-col pt-5">
                <h3 className="font-semibold text-brand-green-950">{t(r.titleKey, locale)}</h3>
                <p className="mt-1 flex-1 text-sm text-neutral-600">{t(r.bodyKey, locale)}</p>
                <Link href={r.href} className="mt-4">
                  <Button variant={r.variant} className="w-full">
                    {t(r.ctaKey, locale)}
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
              <h2 className="text-xl font-semibold">{t("landing.seePipeline", locale)}</h2>
              <p className="mt-1 text-white/85">{t("landing.demoHint", locale)}</p>
            </div>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                {t("landing.loginDemo", locale)}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

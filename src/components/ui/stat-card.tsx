import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "green" | "gold" | "neutral" | "red";

const accent: Record<Tone, { strip: string; icon: string; value: string }> = {
  green: {
    strip: "from-brand-green-500 to-brand-green-800",
    icon: "bg-brand-green-100 text-brand-green-800",
    value: "text-brand-green-800",
  },
  gold: {
    strip: "from-brand-gold-400 to-brand-gold-700",
    icon: "bg-brand-gold-100 text-brand-gold-900",
    value: "text-brand-gold-700",
  },
  neutral: {
    strip: "from-neutral-300 to-neutral-500",
    icon: "bg-neutral-100 text-neutral-700",
    value: "text-brand-green-950",
  },
  red: {
    strip: "from-red-400 to-red-600",
    icon: "bg-red-50 text-red-700",
    value: "text-red-700",
  },
};

/**
 * KPI card: accent strip, icon chip, label, prominent value, optional hint.
 * Purely presentational — pass already-formatted values.
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "green",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const a = accent[tone];
  return (
    <Card interactive className={cn("h-full overflow-hidden", className)}>
      <div className={cn("h-1.5 bg-gradient-to-r", a.strip)} />
      <div className="flex items-start gap-3 p-4 sm:p-5">
        {icon && (
          <span
            aria-hidden="true"
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg", a.icon)}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
          <p className={cn("mt-1 break-words text-2xl font-bold leading-tight tracking-tight", a.value)}>{value}</p>
          {hint && <p className="mt-1 text-xs leading-snug text-neutral-500">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}

/** Page heading block: tinted banner with title, subtitle and an optional action area. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "page-banner flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-brand-green-900/10 p-5 shadow-card sm:p-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {icon && (
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-2xl text-white shadow-sm"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-brand-green-950 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-600 sm:text-base">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Slim progress bar for load/utilization/step indicators. */
export function ProgressBar({
  value,
  tone = "green",
  label,
  className,
}: {
  value: number;
  tone?: "green" | "gold" | "red";
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = tone === "gold" ? "bg-brand-gold-500" : tone === "red" ? "bg-red-500" : "bg-brand-green-600";
  return (
    <div className={cn("space-y-1", className)}>
      {label && <p className="text-xs text-neutral-500">{label}</p>}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/80"
      >
        <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

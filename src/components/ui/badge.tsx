import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "green" | "gold" | "gray" | "red" | "blue";

const toneClasses: Record<Tone, string> = {
  green: "bg-brand-green-100 text-brand-green-800 ring-brand-green-700/15",
  gold: "bg-brand-gold-100 text-brand-gold-900 ring-brand-gold-600/20",
  gray: "bg-neutral-100 text-neutral-600 ring-neutral-500/15",
  red: "bg-red-50 text-red-700 ring-red-600/15",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
};

export function Badge({
  className,
  tone = "gray",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none whitespace-nowrap ring-1 ring-inset",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

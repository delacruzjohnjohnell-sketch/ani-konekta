import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "green" | "gold" | "gray" | "red" | "blue";

const toneClasses: Record<Tone, string> = {
  green: "bg-brand-green-100 text-brand-green-800",
  gold: "bg-brand-gold-100 text-brand-gold-900",
  gray: "bg-neutral-100 text-neutral-600",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
};

export function Badge({
  className,
  tone = "gray",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

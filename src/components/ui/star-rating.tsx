"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Read-only average-rating display — e.g. "★★★★★ 4.8 (24 ratings)".
 *
 * `sum`/`count` come straight from User.ratingSum / User.ratingCount
 * (denormalized counters updated transactionally in submitRating, see
 * src/app/actions.ts) — never recomputed by scanning all Rating rows on
 * every render. Renders a neutral "No ratings yet" state when count is 0
 * so a brand-new user isn't shown a misleading 0-star average.
 */
export function StarRatingDisplay({
  sum,
  count,
  size = "md",
  className,
}: {
  sum: number;
  count: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = { sm: "text-sm", md: "text-base", lg: "text-xl" };

  if (count === 0) {
    return (
      <span className={cn("text-neutral-400", sizeClasses[size], className)}>
        No ratings yet
      </span>
    );
  }

  const average = sum / count;
  // Round to nearest whole star for the glyph render; show the precise
  // average (1 decimal) as the number alongside it.
  const roundedStars = Math.round(average);

  return (
    <span className={cn("inline-flex items-center gap-1.5", sizeClasses[size], className)}>
      <span aria-hidden="true" className="text-brand-gold-500 tracking-tight">
        {"★".repeat(roundedStars)}
        <span className="text-neutral-300">{"★".repeat(5 - roundedStars)}</span>
      </span>
      <span className="font-semibold text-neutral-900">{average.toFixed(1)}</span>
      <span className="text-neutral-500">
        ({count} rating{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

/**
 * Clickable 1-5 star input for a <form action={...}> — submits as a plain
 * radio group under `name` (server actions read it with
 * formData.get(name)), so it works with zero client-side form-submit
 * wiring. Visually it's five star buttons; functionally it's five radio
 * inputs, visually hidden but still keyboard/screen-reader accessible.
 */
export function StarRatingInput({
  name,
  required = true,
}: {
  name: string;
  required?: boolean;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<number | null>(null);
  const display = hovered ?? selected;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label
          key={n}
          className="cursor-pointer text-2xl leading-none"
          onMouseEnter={() => setHovered(n)}
        >
          <input
            type="radio"
            name={name}
            value={n}
            required={required}
            checked={selected === n}
            onChange={() => setSelected(n)}
            className="sr-only"
          />
          <span className={display !== null && n <= display ? "text-brand-gold-500" : "text-neutral-300"}>
            ★
          </span>
        </label>
      ))}
    </div>
  );
}

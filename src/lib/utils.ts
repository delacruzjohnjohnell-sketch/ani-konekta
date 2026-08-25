import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPeso(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amount);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  LISTED: "Listed",
  MATCHED: "Matched",
  ORDERED_ESCROWED: "Ordered — Escrowed",
  POOLED: "Pooled for Delivery",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  SETTLED: "Settled",
  DISPUTED: "Disputed",
};

export const ORDER_PIPELINE = [
  "LISTED",
  "MATCHED",
  "ORDERED_ESCROWED",
  "POOLED",
  "IN_TRANSIT",
  "DELIVERED",
  "SETTLED",
] as const;

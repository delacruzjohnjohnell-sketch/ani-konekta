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
  // A hauler hasn't accepted this order into a route yet — this IS the
  // "waiting for pool" state (see src/app/actions.ts acceptAndPoolOrder,
  // which moves an order straight from here to POOLED in one step).
  ORDERED_ESCROWED: "Escrowed — Waiting for Pool",
  POOLED: "Pooled for Delivery",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  SETTLED: "Settled",
  DISPUTED: "Disputed",
};

export const ROUTE_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned — awaiting pickup",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
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

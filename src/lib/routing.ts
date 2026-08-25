/**
 * PLACEHOLDER — Pooled logistics / route grouping.
 *
 * The business plan calls for "AI route optimization and load pooling."
 * For the MVP this is a simple municipality-level grouping heuristic:
 * orders headed to/from the same municipality are bundled into a single
 * PooledRoute assigned to one hauler, with a rough ETA/distance estimate.
 * A real version would use an actual routing API (e.g. Google/OSRM) and
 * live hauler locations — see ROADMAP.md.
 */

export interface PoolableOrder {
  id: string;
  municipality: string;
}

export interface PooledGroup {
  municipality: string;
  orderIds: string[];
  estimatedDistanceKm: number;
  estimatedEtaMinutes: number;
}

// Rough same-municipality pooling distance/time placeholders (km / minutes).
const BASE_DISTANCE_KM = 12;
const BASE_ETA_MINUTES = 45;
const PER_EXTRA_STOP_MINUTES = 10;

export function poolOrdersByMunicipality(orders: PoolableOrder[]): PooledGroup[] {
  const groups = new Map<string, string[]>();

  for (const order of orders) {
    const key = order.municipality;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(order.id);
  }

  return Array.from(groups.entries()).map(([municipality, orderIds]) => ({
    municipality,
    orderIds,
    estimatedDistanceKm: BASE_DISTANCE_KM + (orderIds.length - 1) * 3,
    estimatedEtaMinutes:
      BASE_ETA_MINUTES + (orderIds.length - 1) * PER_EXTRA_STOP_MINUTES,
  }));
}

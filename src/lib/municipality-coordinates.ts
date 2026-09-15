// FEATURE 3 — Live Hauler Location Tracking + ETA. PooledRoute.pickupPoints
// / dropoffPoint are municipality NAME strings (no lat/lng anywhere in this
// app — no geocoding integration exists), so the map's fixed pickup/dropoff
// markers and the straight-line ETA heuristic both need real coordinates
// for a fixed, small, already-known list: the same 9 Nueva Ecija
// municipalities used everywhere else in this app (buyer dashboard filter,
// hauler dashboard filter, seller listing form). Hardcoded town-center
// coordinates (public knowledge) rather than adding a geocoding API
// dependency for a fixed 9-item list — approximate, not a real address.
export const MUNICIPALITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "Cabanatuan City": { lat: 15.4861, lng: 120.9683 },
  "Gapan City": { lat: 15.3049, lng: 120.9473 },
  "San Jose City": { lat: 15.7889, lng: 120.9856 },
  "Palayan City": { lat: 15.5378, lng: 121.0817 },
  "Muñoz": { lat: 15.7167, lng: 120.9 },
  "Talavera": { lat: 15.6, lng: 120.9 },
  "Guimba": { lat: 15.6667, lng: 120.7667 },
  "Jaen": { lat: 15.3833, lng: 120.8667 },
  "Zaragoza": { lat: 15.5667, lng: 120.7833 },
};

const DEFAULT_COORDINATES = MUNICIPALITY_COORDINATES["Cabanatuan City"];

export function coordinatesForMunicipality(name: string): { lat: number; lng: number } {
  return MUNICIPALITY_COORDINATES[name] ?? DEFAULT_COORDINATES;
}

// Haversine distance in km.
export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// HEURISTIC, not a real routing engine — no directions/routing API is
// configured in this project (Mapbox/Google/OSRM), per the confirmed MVP
// default. Straight-line distance ÷ an assumed average trucking speed for
// provincial Philippine roads (documented estimate, not measured). Clearly
// labeled as an approximation everywhere it's shown in the UI.
export const ASSUMED_AVERAGE_SPEED_KMH = 30;

export function estimateEtaMinutes(distanceKm: number): number {
  return Math.round((distanceKm / ASSUMED_AVERAGE_SPEED_KMH) * 60);
}

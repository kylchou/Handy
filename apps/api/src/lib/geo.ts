const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles, or null if either point is unknown. */
export function distanceMiles(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null },
): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Drops the street number/name: "123 Main Street, Atlanta, GA" → "Atlanta, GA". */
export function approximateLocation(location: string): string {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(", ") : "Near the customer's home";
}

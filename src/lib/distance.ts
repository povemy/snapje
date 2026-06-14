/**
 * Haversine distance calculation
 * Calculates the great-circle distance between two points on Earth
 * using the Haversine formula.
 */

export interface Coordinates {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Calculate distance between two coordinates in kilometers
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  
  const haversine =
    sinDLat * sinDLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinDLon * sinDLon
  
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  
  return EARTH_RADIUS_KM * c
}

/**
 * Estimate walking time in minutes (average 5 km/h)
 */
export function walkingTimeMinutes(distanceKm: number): number {
  return Math.ceil((distanceKm / 5) * 60)
}

/**
 * Estimate driving time in minutes (average 30 km/h urban)
 */
export function drivingTimeMinutes(distanceKm: number): number {
  return Math.ceil((distanceKm / 30) * 60)
}

/**
 * Get distance tier for ranking
 */
export function getDistanceTier(distanceKm: number): number {
  if (distanceKm <= 1) return 1    // "Walk there now"
  if (distanceKm <= 3) return 2    // "Quick ride"
  if (distanceKm <= 5) return 3    // "Good deal worth traveling for"
  return 4                          // Visible but lower priority
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`
  }
  return `${distanceKm.toFixed(1)}km`
}

/**
 * Default user location (Kuala Lumpur city center)
 */
export const DEFAULT_LOCATION: Coordinates = {
  latitude: 3.1390,
  longitude: 101.6869
}

/**
 * Simple in-memory cache for SnapJe
 * Replaces Redis for the MVP.
 *
 * MEDIUM 7 (rate limiter multi-instance): this cache + rate limiter are
 * process-local. In a multi-instance deployment (multiple Node/Next.js
 * workers or PM2 clusters) each instance maintains its own counters, so the
 * effective rate limit becomes `maxRequests * instanceCount`. For the MVP
 * (single-instance dev sandbox) this is acceptable; before scaling out,
 * replace `MemoryCache` + `RateLimiter` with Redis-backed implementations
 * (e.g. @upstash/redis or ioredis) so limits are shared across instances.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
    // LOW 8: don't keep the Node process alive just for cache cleanup. .unref()
    // lets the timer be GC'd if it's the only remaining handle (e.g. during a
    // graceful shutdown). The optional chaining guards environments where the
    // timer object may not expose .unref().
    this.cleanupInterval.unref?.()
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return null
    }
    return entry.value as T
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Delete all cache entries whose key starts with the given prefix.
   * Useful for invalidating all variants of a cached query (e.g. all
   * `deals:*` keys when a new deal is created).
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        deleted++
      }
    }
    return deleted
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  clear(): void {
    this.cache.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key)
      }
    }
  }
}

export const cache = new MemoryCache()

// Rate limiter using in-memory store
interface RateLimitEntry {
  count: number
  windowStart: number
}

/**
 * NOTE: This rate limiter is per-instance (in-memory). In multi-instance
 * deployments (Vercel, ECS, K8s with >1 replica), rate limits are divided
 * by instance count. For production, use a shared store (Redis/Upstash).
 * Also: x-forwarded-for is client-controlled — strip it at the load balancer.
 */
class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map()

  /**
   * Check if request is within rate limit
   * Returns true if allowed, false if rate limited
   */
  check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now()
    const entry = this.entries.get(key)
    
    if (!entry || now - entry.windowStart > windowMs) {
      this.entries.set(key, { count: 1, windowStart: now })
      return true
    }
    
    if (entry.count >= maxRequests) {
      return false
    }
    
    entry.count++
    return true
  }
}

export const rateLimiter = new RateLimiter()

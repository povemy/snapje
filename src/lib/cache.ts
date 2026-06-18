/**
 * Simple in-memory cache for FlashBite
 * Replaces Redis for the MVP
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

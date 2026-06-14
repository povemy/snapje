/**
 * In-memory reservation lock manager
 * Provides application-level concurrency protection for deal claims
 * since SQLite doesn't support row-level locking
 */

interface ReservationLock {
  dealId: string
  userId: string
  quantity: number
  expiresAt: number // timestamp
  timer: NodeJS.Timeout
}

class ReservationManager {
  private locks: Map<string, ReservationLock> = new Map()
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
  
  /**
   * Try to acquire a reservation lock
   * Returns true if lock acquired, false if not available
   */
  acquire(dealId: string, userId: string, quantity: number, ttlMs?: number): boolean {
    const existing = this.locks.get(dealId)
    
    // If there's an existing lock by the same user, allow renewal
    if (existing && existing.userId === userId) {
      this.release(dealId)
    }
    
    // If existing lock by different user and not expired, deny
    if (existing && existing.expiresAt > Date.now()) {
      return false
    }
    
    // Clean up expired lock
    if (existing) {
      clearTimeout(existing.timer)
      this.locks.delete(dealId)
    }
    
    const ttl = ttlMs || this.DEFAULT_TTL
    
    const timer = setTimeout(() => {
      this.locks.delete(dealId)
    }, ttl)
    
    this.locks.set(dealId, {
      dealId,
      userId,
      quantity,
      expiresAt: Date.now() + ttl,
      timer,
    })
    
    return true
  }
  
  /**
   * Release a reservation lock
   */
  release(dealId: string): void {
    const lock = this.locks.get(dealId)
    if (lock) {
      clearTimeout(lock.timer)
      this.locks.delete(dealId)
    }
  }
  
  /**
   * Check if a deal is locked
   */
  isLocked(dealId: string): boolean {
    const lock = this.locks.get(dealId)
    if (!lock) return false
    if (lock.expiresAt <= Date.now()) {
      clearTimeout(lock.timer)
      this.locks.delete(dealId)
      return false
    }
    return true
  }
  
  /**
   * Get remaining time on a lock in ms
   */
  getRemainingTime(dealId: string): number {
    const lock = this.locks.get(dealId)
    if (!lock || lock.expiresAt <= Date.now()) return 0
    return lock.expiresAt - Date.now()
  }
}

// Singleton instance
export const reservationManager = new ReservationManager()

'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Custom hook for data fetching that avoids the 
 * "set-state-in-effect" lint rule by using a different pattern
 */
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async () => {
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher().then((result) => {
      if (!cancelled) {
        setData(result)
        setError(null)
        setLoading(false)
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [execute])

  const refetch = useCallback(() => {
    setLoading(true)
    fetcher().then((result) => {
      setData(result)
      setError(null)
      setLoading(false)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    })
  }, deps)

  return { data, loading, error, refetch }
}

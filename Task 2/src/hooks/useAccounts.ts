import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAccounts } from '../lib/api'
import type { Account, AccountsQuery } from '../lib/types'

const POLL_MS = 15_000

export function useAccounts(query: AccountsQuery) {
  const [data, setData] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const queryRef = useRef(query)
  queryRef.current = query
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (isPoll = false) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    if (!isPoll) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const res = await fetchAccounts(queryRef.current)
      if (ac.signal.aborted) return
      setData(res.data)
      setTotal(res.total)
    } catch (e) {
      if (ac.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Failed to load accounts')
      if (!isPoll) {
        setData([])
        setTotal(0)
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [
    query.page,
    query.page_size,
    query.search,
    query.status,
    query.country,
    query.plan,
    query.date_from,
    query.date_to,
    query.sort_by,
    query.sort_dir,
    load,
  ])

  useEffect(() => {
    const id = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  return {
    data,
    total,
    loading,
    error,
    refreshing,
    reload: () => load(false),
  }
}

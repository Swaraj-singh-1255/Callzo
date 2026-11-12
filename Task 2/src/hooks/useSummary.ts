import { useCallback, useEffect, useState } from 'react'
import { fetchSummary } from '../lib/api'
import type { SummaryPoint } from '../lib/types'

export function useSummary(dateFrom?: string, dateTo?: string) {
  const [series, setSeries] = useState<SummaryPoint[]>([])
  const [totalAccounts, setTotalAccounts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSummary({
        date_from: dateFrom,
        date_to: dateTo,
      })
      setSeries(res.series)
      setTotalAccounts(res.total_accounts)
    } catch (e) {
      // Summary fails ~1/5 times by design
      setError(
        e instanceof Error ? e.message : 'Failed to load summary chart',
      )
      // Keep previous series so the rest of the page stays usable
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  return { series, totalAccounts, loading, error, retry: load }
}

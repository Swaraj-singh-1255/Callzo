import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AccountsQuery, AccountStatus, Plan } from '../lib/types'

const DEFAULTS: Required<
  Pick<AccountsQuery, 'page' | 'page_size' | 'sort_by' | 'sort_dir'>
> = {
  page: 1,
  page_size: 50,
  sort_by: 'id',
  sort_dir: 'asc',
}

export function useUrlState() {
  const [params, setParams] = useSearchParams()

  const query: AccountsQuery = useMemo(() => {
    const page = Number(params.get('page') || DEFAULTS.page)
    const page_size = Number(params.get('page_size') || DEFAULTS.page_size)
    return {
      page: Number.isFinite(page) && page > 0 ? page : DEFAULTS.page,
      page_size:
        Number.isFinite(page_size) && page_size > 0
          ? Math.min(page_size, 200)
          : DEFAULTS.page_size,
      search: params.get('search') || undefined,
      status: (params.get('status') as AccountStatus) || undefined,
      country: params.get('country') || undefined,
      plan: (params.get('plan') as Plan) || undefined,
      date_from: params.get('date_from') || undefined,
      date_to: params.get('date_to') || undefined,
      sort_by: params.get('sort_by') || DEFAULTS.sort_by,
      sort_dir: (params.get('sort_dir') as 'asc' | 'desc') || DEFAULTS.sort_dir,
    }
  }, [params])

  const setQuery = useCallback(
    (patch: Partial<AccountsQuery>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const apply = (key: string, value: string | number | undefined) => {
            if (value === undefined || value === '' || value === null) {
              next.delete(key)
            } else {
              next.set(key, String(value))
            }
          }

          Object.entries(patch).forEach(([k, v]) => apply(k, v as any))
          if (resetPage && !('page' in patch)) {
            next.set('page', '1')
          }
          // Drop defaults to keep URL clean
          if (next.get('page') === String(DEFAULTS.page)) next.delete('page')
          if (next.get('page_size') === String(DEFAULTS.page_size))
            next.delete('page_size')
          if (next.get('sort_by') === DEFAULTS.sort_by) next.delete('sort_by')
          if (next.get('sort_dir') === DEFAULTS.sort_dir)
            next.delete('sort_dir')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return { query, setQuery }
}

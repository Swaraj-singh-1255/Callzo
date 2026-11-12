import { useState, useCallback } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useSummary } from '../hooks/useSummary'
import { useUrlState } from '../hooks/useUrlState'
import { Filters } from '../components/Filters'
import { AccountsTable } from '../components/AccountsTable'
import { SummaryChart } from '../components/SummaryChart'
import { Pagination } from '../components/Pagination'

export function AccountsPage() {
  const { query, setQuery } = useUrlState()
  const { data, total, loading, error, refreshing, reload } = useAccounts(query)
  const summary = useSummary(query.date_from, query.date_to)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handleSort = useCallback(
    (col: string) => {
      if (query.sort_by === col) {
        setQuery({
          sort_dir: query.sort_dir === 'asc' ? 'desc' : 'asc',
        })
      } else {
        setQuery({ sort_by: col, sort_dir: 'asc' })
      }
    },
    [query.sort_by, query.sort_dir, setQuery],
  )

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Usage admin
        </h1>
        <p className="text-sm text-slate-500">
          Browse accounts, filter by signup range, and open settings.
        </p>
      </header>

      <Filters query={query} onChange={(patch) => setQuery(patch)} />

      <SummaryChart
        series={summary.series}
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.retry}
        totalAccounts={summary.totalAccounts}
      />

      <AccountsTable
        data={data}
        loading={loading}
        error={error}
        selectedId={selectedId}
        onSelect={setSelectedId}
        sortBy={query.sort_by || 'id'}
        sortDir={query.sort_dir || 'asc'}
        onSort={handleSort}
        refreshing={refreshing}
        onRetry={reload}
      />

      <Pagination
        page={query.page || 1}
        pageSize={query.page_size || 50}
        total={total}
        onPageChange={(page) => setQuery({ page }, false)}
      />

      {selectedId !== null && (
        <p className="text-xs text-slate-500" aria-live="polite">
          Selected account ID: {selectedId} (selection is kept across page
          changes and background refreshes)
        </p>
      )}
    </div>
  )
}

import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Account } from '../lib/types'
import { formatCents, formatDate, formatNumber } from '../lib/format'
import { StatusBadge, PlanBadge } from './Badge'
import { Spinner } from './Spinner'

interface Props {
  data: Account[]
  loading: boolean
  error: string | null
  selectedId: number | null
  onSelect: (id: number | null) => void
  sortBy: string
  sortDir: 'asc' | 'desc'
  onSort: (col: string) => void
  refreshing: boolean
  onRetry: () => void
}

const COLUMNS: { key: string; label: string; className?: string }[] = [
  { key: 'id', label: 'ID', className: 'w-16' },
  { key: 'name', label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'country', label: 'Country', className: 'w-20' },
  { key: 'plan', label: 'Plan', className: 'w-24' },
  { key: 'status', label: 'Status', className: 'w-24' },
  { key: 'signup_date', label: 'Signup' },
  { key: 'current_month_minutes', label: 'Minutes', className: 'text-right' },
  { key: 'current_month_sms', label: 'SMS', className: 'text-right' },
  { key: 'cost_cents', label: 'Cost', className: 'text-right' },
  { key: 'last_active', label: 'Last active' },
]

export function AccountsTable({
  data,
  loading,
  error,
  selectedId,
  onSelect,
  sortBy,
  sortDir,
  onSort,
  refreshing,
  onRetry,
}: Props) {
  const handleRowKey = (e: KeyboardEvent, id: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(selectedId === id ? null : id)
    }
  }

  return (
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Accounts</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {refreshing && (
            <span className="inline-flex items-center gap-1">
              <Spinner className="h-3.5 w-3.5" />
              Refreshing…
            </span>
          )}
        </div>
      </div>

      {error && !loading && (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 px-4 py-10 text-center"
        >
          <p className="text-sm font-medium text-rose-700">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {loading && data.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
          <span className="sr-only">Loading accounts</span>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-slate-500">
          No accounts match the current filters.
        </div>
      )}

      {data.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="w-10 px-3 py-2.5">
                  <span className="sr-only">Select</span>
                </th>
                {COLUMNS.map((col) => {
                  const active = sortBy === col.key
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={`px-3 py-2.5 font-medium ${col.className || ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded"
                        aria-sort={
                          active
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        {col.label}
                        {active && (
                          <span aria-hidden="true">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    </th>
                  )
                })}
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => {
                const selected = selectedId === row.id
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onClick={() => onSelect(selected ? null : row.id)}
                    onKeyDown={(e) => handleRowKey(e, row.id)}
                    aria-selected={selected}
                    className={`cursor-pointer transition-colors ${
                      selected
                        ? 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onSelect(selected ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select account ${row.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                      {row.id}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[160px]">
                        {row.email}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[140px] truncate">
                      {row.company}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.country}</td>
                    <td className="px-3 py-2.5">
                      <PlanBadge plan={row.plan} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                      {formatDate(row.signup_date)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatNumber(row.current_month_minutes)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatNumber(row.current_month_sms)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatCents(row.cost_cents)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                      {formatDate(row.last_active)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/accounts/${row.id}/settings`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-brand-600 hover:text-brand-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded"
                      >
                        Settings
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

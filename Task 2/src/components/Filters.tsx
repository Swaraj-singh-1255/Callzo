import { useEffect, useState } from 'react'
import type { AccountsQuery } from '../lib/types'
import { COUNTRY_OPTIONS } from '../lib/format'

interface Props {
  query: AccountsQuery
  onChange: (patch: Partial<AccountsQuery>) => void
}

export function Filters({ query, onChange }: Props) {
  const [search, setSearch] = useState(query.search || '')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (query.search || '')) {
        onChange({ search: search || undefined })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSearch(query.search || '')
  }, [query.search])

  const badRange = Boolean(query.date_from && query.date_to && query.date_from > query.date_to)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex-1 min-w-[180px]">
        <label htmlFor="search" className="block text-xs font-medium text-slate-600 mb-1">
          Search
        </label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email, company…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="w-full sm:w-32">
        <label htmlFor="status" className="block text-xs font-medium text-slate-600 mb-1">
          Status
        </label>
        <select
          id="status"
          value={query.status || ''}
          onChange={(e) =>
            onChange({ status: (e.target.value || undefined) as any })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="w-full sm:w-32">
        <label htmlFor="plan" className="block text-xs font-medium text-slate-600 mb-1">
          Plan
        </label>
        <select
          id="plan"
          value={query.plan || ''}
          onChange={(e) =>
            onChange({ plan: (e.target.value || undefined) as any })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div className="w-full sm:w-36">
        <label htmlFor="country" className="block text-xs font-medium text-slate-600 mb-1">
          Country
        </label>
        <select
          id="country"
          value={query.country || ''}
          onChange={(e) =>
            onChange({ country: e.target.value || undefined })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full sm:w-36">
        <label htmlFor="date_from" className="block text-xs font-medium text-slate-600 mb-1">
          Signup from
        </label>
        <input
          id="date_from"
          type="date"
          value={query.date_from || ''}
          onChange={(e) =>
            onChange({ date_from: e.target.value || undefined })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="w-full sm:w-36">
        <label htmlFor="date_to" className="block text-xs font-medium text-slate-600 mb-1">
          Signup to
        </label>
        <input
          id="date_to"
          type="date"
          value={query.date_to || ''}
          onChange={(e) =>
            onChange({ date_to: e.target.value || undefined })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>
      {badRange && (
        <p role="alert" className="w-full text-xs text-rose-600">
          "Signup from" is after "Signup to", so no accounts can match.
        </p>
      )}
      {(query.search || query.status || query.plan || query.country || query.date_from || query.date_to) && (
        <button
          type="button"
          onClick={() => onChange({ search: undefined, status: undefined, plan: undefined, country: undefined, date_from: undefined, date_to: undefined })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Spinner } from './Spinner'
import type { SummaryPoint } from '../lib/types'
import { formatCents, formatNumber } from '../lib/format'

interface Props {
  series: SummaryPoint[]
  loading: boolean
  error: string | null
  onRetry: () => void
  totalAccounts: number
}

export function SummaryChart({
  series,
  loading,
  error,
  onRetry,
  totalAccounts,
}: Props) {
  const chartData = series.map((p) => ({
    ...p,
    cost: p.cost_cents / 100,
    label: p.date.slice(5), // MM-DD
  }))

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby="chart-heading"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="chart-heading" className="text-sm font-semibold text-slate-800">
            Usage summary
          </h2>
          {!error && !loading && (
            <p className="text-xs text-slate-500">
              {formatNumber(totalAccounts)} accounts in range
            </p>
          )}
        </div>
        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            Retry chart
          </button>
        )}
      </div>

      <div className="relative h-56 sm:h-64">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Spinner />
            <span className="sr-only">Loading chart</span>
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-rose-50/80 px-4 text-center"
          >
            <p className="text-sm font-medium text-rose-800">
              Chart failed to load
            </p>
            <p className="text-xs text-rose-600">
              The summary endpoint fails randomly by design. The table still works.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 rounded-md bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-200"
            >
              Try again
            </button>
          </div>
        )}

        {!error && chartData.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No data for this date range
          </div>
        )}

        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'cost') return [formatCents(value * 100), 'Cost']
                  if (name === 'minutes') return [formatNumber(value), 'Minutes']
                  if (name === 'sms') return [formatNumber(value), 'SMS']
                  if (name === 'signups') return [formatNumber(value), 'Signups']
                  return [value, name]
                }}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="minutes"
                name="Minutes"
                fill="#0c8ce9"
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                yAxisId="left"
                dataKey="sms"
                name="SMS"
                fill="#7cc5fc"
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cost"
                name="Cost"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

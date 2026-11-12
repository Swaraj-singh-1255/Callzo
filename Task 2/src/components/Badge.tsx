import { STATUS_LABELS, PLAN_LABELS } from '../lib/format'

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  trial: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  suspended: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

const planStyles: Record<string, string> = {
  basic: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  pro: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  enterprise: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        statusStyles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        planStyles[plan] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {PLAN_LABELS[plan] || plan}
    </span>
  )
}

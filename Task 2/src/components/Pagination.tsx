interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600">
      <p>
        Showing{' '}
        <span className="font-medium text-slate-800">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-slate-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          Previous
        </button>
        <span className="tabular-nums text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          Next
        </button>
      </div>
    </div>
  )
}

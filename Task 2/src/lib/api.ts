import type {
  AccountsQuery,
  AccountsResponse,
  Account,
  SummaryResponse,
  SettingsDraft,
  SaveStepResponse,
  ValidationErrorBody,
} from './types'

// Same-origin by default: nginx (prod) and the Vite dev server proxy /api to the mock API.
const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') || '/api'

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* ignore */
    }
    const err = new Error(`HTTP ${res.status}`) as Error & {
      status: number
      body: unknown
    }
    err.status = res.status
    err.body = body
    throw err
  }

  return res.json() as Promise<T>
}

export function buildAccountsQuery(q: AccountsQuery): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.page_size) params.set('page_size', String(q.page_size))
  if (q.search) params.set('search', q.search)
  if (q.status) params.set('status', q.status)
  if (q.country) params.set('country', q.country)
  if (q.plan) params.set('plan', q.plan)
  if (q.date_from) params.set('date_from', q.date_from)
  if (q.date_to) params.set('date_to', q.date_to)
  if (q.sort_by) params.set('sort_by', q.sort_by)
  if (q.sort_dir) params.set('sort_dir', q.sort_dir)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export async function fetchAccounts(
  query: AccountsQuery,
): Promise<AccountsResponse> {
  return request<AccountsResponse>(`/accounts${buildAccountsQuery(query)}`)
}

export async function fetchAccount(id: number): Promise<Account> {
  return request<Account>(`/accounts/${id}`)
}

export async function fetchSummary(params: {
  date_from?: string
  date_to?: string
}): Promise<SummaryResponse> {
  const qs = new URLSearchParams()
  if (params.date_from) qs.set('date_from', params.date_from)
  if (params.date_to) qs.set('date_to', params.date_to)
  const s = qs.toString()
  return request<SummaryResponse>(`/accounts/summary${s ? `?${s}` : ''}`)
}

export async function fetchSettings(id: number): Promise<SettingsDraft> {
  return request<SettingsDraft>(`/accounts/${id}/settings`)
}

export async function saveStep(
  id: number,
  step: number,
  data: Record<string, unknown>,
): Promise<SaveStepResponse> {
  return request<SaveStepResponse>(`/accounts/${id}/settings/step/${step}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  })
}

export async function submitSettings(id: number): Promise<unknown> {
  return request(`/accounts/${id}/settings/submit`, { method: 'POST' })
}

export function isValidationError(
  err: unknown,
): err is Error & { status: number; body: ValidationErrorBody } {
  return (
    err instanceof Error &&
    'status' in err &&
    (err as any).status === 422 &&
    (err as any).body?.detail?.errors
  )
}

export { API_BASE }

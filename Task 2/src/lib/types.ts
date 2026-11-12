export type AccountStatus = 'active' | 'trial' | 'suspended'
export type Plan = 'basic' | 'pro' | 'enterprise'

export interface Account {
  id: number
  name: string
  email: string
  company: string
  country: string
  plan: Plan
  status: AccountStatus
  signup_date: string
  current_month_minutes: number
  current_month_sms: number
  cost_cents: number
  last_active: string
}

export interface AccountsResponse {
  data: Account[]
  total: number
  page: number
  page_size: number
}

export interface SummaryPoint {
  date: string
  minutes: number
  sms: number
  cost_cents: number
  signups: number
}

export interface SummaryResponse {
  series: SummaryPoint[]
  total_accounts: number
}

export interface AccountsQuery {
  page?: number
  page_size?: number
  search?: string
  status?: AccountStatus | ''
  country?: string
  plan?: Plan | ''
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
}

export interface Step1Data {
  name: string
  email: string
}

export interface Step2Data {
  plan: Plan
  billing_country: string
}

export interface Step3Data {
  minutes_cap?: number | null
  sms_cap?: number | null
}

export interface Step4Data {
  webhook_url?: string
}

export type SettingsDraft = {
  '1'?: Step1Data
  '2'?: Step2Data
  '3'?: Step3Data
  '4'?: Step4Data
}

export interface SaveStepResponse {
  step: number
  saved: boolean
  data: Record<string, unknown>
}

export interface ValidationErrorBody {
  detail: {
    step: number
    errors: Record<string, string>
  }
}

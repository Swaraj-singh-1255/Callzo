import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSettings,
  saveStep,
  submitSettings,
  isValidationError,
} from '../lib/api'
import type {
  SettingsDraft,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
} from '../lib/types'
import { COUNTRY_OPTIONS } from '../lib/format'
import { Spinner } from './Spinner'

const STEPS = [
  { n: 1, title: 'Identity' },
  { n: 2, title: 'Plan & billing' },
  { n: 3, title: 'Usage caps' },
  { n: 4, title: 'Webhook' },
] as const

interface Props {
  accountId: number
}

export function SettingsForm({ accountId }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<SettingsDraft>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [savedFlash, setSavedFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState(false)

  // Local form state per step (so we can roll back on failed save)
  const [s1, setS1] = useState<Step1Data>({ name: '', email: '' })
  const [s2, setS2] = useState<Step2Data>({ plan: 'basic', billing_country: 'US' })
  const [s3, setS3] = useState<Step3Data>({ minutes_cap: null, sms_cap: null })
  const [s4, setS4] = useState<Step4Data>({ webhook_url: '' })

  const applyDraft = useCallback((d: SettingsDraft) => {
    setDraft(d)
    if (d['1']) setS1({ name: d['1'].name || '', email: d['1'].email || '' })
    if (d['2'])
      setS2({
        plan: d['2'].plan || 'basic',
        billing_country: d['2'].billing_country || 'US',
      })
    if (d['3'])
      setS3({
        minutes_cap: d['3'].minutes_cap ?? null,
        sms_cap: d['3'].sms_cap ?? null,
      })
    if (d['4']) setS4({ webhook_url: d['4'].webhook_url || '' })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const d = await fetchSettings(accountId)
        if (!cancelled) applyDraft(d)
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Failed to load draft')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountId, applyDraft])

  const currentData = (): Record<string, unknown> => {
    if (step === 1) return { ...s1 }
    if (step === 2) return { ...s2 }
    if (step === 3)
      return {
        minutes_cap:
          s3.minutes_cap === null || s3.minutes_cap === undefined
            ? undefined
            : Number(s3.minutes_cap),
        sms_cap:
          s3.sms_cap === null || s3.sms_cap === undefined
            ? undefined
            : Number(s3.sms_cap),
      }
    return {
      webhook_url: s4.webhook_url?.trim() || undefined,
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setFieldErrors({})
    setSavedFlash(false)

    try {
      const res = await saveStep(accountId, step, currentData())
      setDraft((d) => ({ ...d, [String(step)]: res.data as any }))
      setSavedFlash(true)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2000)
    } catch (e) {
      // Never overwrite what the user typed, on this step or any other.
      // The step simply stays "not saved" and the server's message is shown.
      if (isValidationError(e)) {
        setFieldErrors(e.body.detail.errors)
        if (e.body.detail.step && e.body.detail.step !== step) {
          setStep(e.body.detail.step)
        }
      } else {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    setSubmitOk(false)
    try {
      await submitSettings(accountId)
      setSubmitOk(true)
    } catch (e: any) {
      const msg =
        e?.body?.detail
          ? typeof e.body.detail === 'string'
            ? e.body.detail
            : JSON.stringify(e.body.detail)
          : e instanceof Error
            ? e.message
            : 'Submit failed'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-medium text-rose-800">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-md bg-rose-100 px-3 py-1.5 text-sm text-rose-800"
        >
          Reload
        </button>
      </div>
    )
  }

  const stepSaved = (n: number) => Boolean(draft[String(n) as keyof SettingsDraft])

  return (
    <div className="mx-auto max-w-xl">
      {/* Step indicator */}
      <nav aria-label="Form steps" className="mb-6">
        <ol className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => (
            <li key={s.n} className="flex items-center gap-1 sm:gap-2 flex-1">
              <button
                type="button"
                onClick={() => {
                  setStep(s.n)
                  setFieldErrors({})
                  setSaveError(null)
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  step === s.n
                    ? 'bg-brand-600 text-white'
                    : stepSaved(s.n)
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-slate-100 text-slate-500'
                }`}
                aria-current={step === s.n ? 'step' : undefined}
              >
                {s.n}
              </button>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  step === s.n ? 'text-slate-900' : 'text-slate-500'
                }`}
              >
                {s.title}
              </span>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block h-px flex-1 bg-slate-200" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Step {step}: {STEPS[step - 1].title}
        </h2>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                value={s1.name}
                onChange={(e) => setS1((p) => ({ ...p, name: e.target.value }))}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-brand-500 ${
                  fieldErrors.name
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'name-err' : undefined}
              />
              {fieldErrors.name && (
                <p id="name-err" className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={s1.email}
                onChange={(e) => setS1((p) => ({ ...p, email: e.target.value }))}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-brand-500 ${
                  fieldErrors.email
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-err' : undefined}
              />
              {fieldErrors.email && (
                <p id="email-err" className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="plan" className="block text-sm font-medium text-slate-700">
                Plan <span className="text-rose-500">*</span>
              </label>
              <select
                id="plan"
                value={s2.plan}
                onChange={(e) =>
                  setS2((p) => ({ ...p, plan: e.target.value as any }))
                }
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-brand-500 ${
                  fieldErrors.plan
                    ? 'border-rose-400'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              {fieldErrors.plan && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.plan}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="billing_country"
                className="block text-sm font-medium text-slate-700"
              >
                Billing country <span className="text-rose-500">*</span>
              </label>
              <select
                id="billing_country"
                value={s2.billing_country}
                onChange={(e) =>
                  setS2((p) => ({ ...p, billing_country: e.target.value }))
                }
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-brand-500 ${
                  fieldErrors.billing_country
                    ? 'border-rose-400'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
                aria-invalid={Boolean(fieldErrors.billing_country)}
                aria-describedby={
                  fieldErrors.billing_country ? 'bc-err' : undefined
                }
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fieldErrors.billing_country && (
                <p id="bc-err" className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.billing_country}
                </p>
              )}
              {fieldErrors.billing_country && (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  The server rejected this change and it was not saved. This
                  happens for step 2 once step 4 has been saved. Your input is
                  kept, your other steps are untouched, and you can still
                  submit with the previously saved plan and billing country.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="minutes_cap"
                className="block text-sm font-medium text-slate-700"
              >
                Minutes cap (optional)
              </label>
              <input
                id="minutes_cap"
                type="number"
                min={0}
                value={s3.minutes_cap ?? ''}
                onChange={(e) =>
                  setS3((p) => ({
                    ...p,
                    minutes_cap:
                      e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {fieldErrors.minutes_cap && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.minutes_cap}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="sms_cap"
                className="block text-sm font-medium text-slate-700"
              >
                SMS cap (optional)
              </label>
              <input
                id="sms_cap"
                type="number"
                min={0}
                value={s3.sms_cap ?? ''}
                onChange={(e) =>
                  setS3((p) => ({
                    ...p,
                    sms_cap:
                      e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {fieldErrors.sms_cap && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.sms_cap}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="webhook_url"
                className="block text-sm font-medium text-slate-700"
              >
                Webhook URL (optional)
              </label>
              <input
                id="webhook_url"
                type="url"
                placeholder="https://…"
                value={s4.webhook_url || ''}
                onChange={(e) =>
                  setS4((p) => ({ ...p, webhook_url: e.target.value }))
                }
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-brand-500 ${
                  fieldErrors.webhook_url
                    ? 'border-rose-400'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
              />
              {fieldErrors.webhook_url && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.webhook_url}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Must start with http:// or https:// if provided.
              </p>
            </div>
          </div>
        )}

        {saveError && (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {saveError}
          </p>
        )}
        {savedFlash && (
          <p className="mt-3 text-sm text-emerald-600" role="status">
            Step {step} saved.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => {
              setStep((s) => Math.max(1, s - 1))
              setFieldErrors({})
              setSaveError(null)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {saving && <Spinner className="h-4 w-4 text-white" />}
            Save step
          </button>
          {step < 4 && (
            <button
              type="button"
              onClick={() => {
                setStep((s) => Math.min(4, s + 1))
                setFieldErrors({})
                setSaveError(null)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Submit panel */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Finalize</h3>
        <p className="mt-1 text-xs text-slate-500">
          Requires all four steps to have been saved at least once.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s.n}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                stepSaved(s.n)
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              Step {s.n} {stepSaved(s.n) ? '✓' : '·'}
            </span>
          ))}
        </div>
        {submitError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {submitError}
          </p>
        )}
        {submitOk && (
          <p role="status" className="mt-2 text-sm text-emerald-600">
            Settings submitted successfully.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {submitting && <Spinner className="h-4 w-4 text-white" />}
            Submit all
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Back to list
          </button>
        </div>
      </div>
    </div>
  )
}

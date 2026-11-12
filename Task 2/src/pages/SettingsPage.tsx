import { useParams, Link } from 'react-router-dom'
import { SettingsForm } from '../components/SettingsForm'

export function SettingsPage() {
  const { id } = useParams<{ id: string }>()
  const accountId = Number(id)

  if (!Number.isFinite(accountId) || accountId <= 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-600">Invalid account ID.</p>
        <Link to="/" className="mt-2 inline-block text-brand-600 underline">
          Back to list
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <Link
          to="/"
          className="text-sm font-medium text-brand-600 hover:text-brand-800"
        >
          ← Accounts
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Account settings
          <span className="ml-2 text-base font-normal text-slate-500">
            #{accountId}
          </span>
        </h1>
        <p className="text-sm text-slate-500">
          Four-step form. Save each step to store it as a draft; server validation
          errors appear on the step they belong to.
        </p>
      </header>
      <SettingsForm accountId={accountId} />
    </div>
  )
}

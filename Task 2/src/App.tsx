import { Routes, Route } from 'react-router-dom'
import { AccountsPage } from './pages/AccountsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <div className="min-h-full min-w-0">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" className="text-sm font-semibold tracking-tight text-slate-900">
            Callzo Admin
          </a>
          <span className="text-xs text-slate-400">Task 2</span>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<AccountsPage />} />
          <Route path="/accounts/:id/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

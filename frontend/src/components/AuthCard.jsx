import Logo from './Logo.jsx'

// Shared shell for the login and register screens.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-50 via-white to-slate-50 px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-indigo-100/60 blur-3xl" />

      <Logo className="relative mb-8" />

      <main className="relative w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-center text-2xl font-bold text-navy-900">{title}</h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
      </main>
    </div>
  )
}

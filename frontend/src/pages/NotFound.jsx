import Button from '../components/Button.jsx'
import Logo from '../components/Logo.jsx'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-5xl font-extrabold text-navy-900">404</h1>
      <p className="text-slate-500">We couldn&apos;t find that page.</p>
      <Button to="/">Back to Home</Button>
    </main>
  )
}

import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import Button from './Button.jsx'
import Logo from './Logo.jsx'

const links = [
  { label: 'Home', href: '/#home' },
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'About', href: '/#about' },
  { label: 'Live Demo', href: '/demo' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="rounded text-sm font-medium text-slate-600 transition-colors hover:text-brand-600">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <Button to="/login" variant="outline">Login</Button>
          <Button to="/register">Get Started</Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button to="/login" variant="outline">Login</Button>
            <Button to="/register">Get Started</Button>
          </div>
        </div>
      )}
    </header>
  )
}

import { Bell, ChevronDown, Menu, Search } from 'lucide-react'
import { initials } from '../utils/format.js'

export default function Topbar({ user, onMenuClick, menuOpen }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open sidebar"
        aria-expanded={menuOpen}
        aria-controls="dashboard-sidebar"
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative max-w-md flex-1">
        <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          aria-label="Search"
          placeholder="Search orders, returns..."
          className="block w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/25"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <button type="button" aria-label="Notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Bell size={20} aria-hidden="true" />
          <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <button type="button" aria-label="User menu" className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{initials(user.name)}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-800">{user.name}</span>
            <span className="block text-xs text-slate-500">{user.role}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className="hidden text-slate-400 sm:block" />
        </button>
      </div>
    </header>
  )
}

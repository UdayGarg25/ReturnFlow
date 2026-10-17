import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'

// Reusable shell shared by every role dashboard; pages render into <Outlet />.
// Each role passes its own sidebar `navItems` and `user`.
export default function DashboardLayout({ navItems, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e) => e.key === 'Escape' && setSidebarOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar nav={navItems} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Topbar user={user} onMenuClick={() => setSidebarOpen(true)} menuOpen={sidebarOpen} />
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

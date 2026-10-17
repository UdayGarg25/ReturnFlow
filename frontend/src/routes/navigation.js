import { ChartColumn, FlaskConical, Mail, Users, ClipboardCheck, ClipboardList, History, Home, ListChecks, LogOut, Package, RotateCcw, Settings, ShoppingBag, User, Wallet } from 'lucide-react'

const under = (pathname, base) => pathname === base || pathname.startsWith(base + '/')

// A finished pickup / inspection opens at the same /:id route as an open one, but belongs
// under "history" in the sidebar. The history lists link with state { section: 'history' },
// which is how the sidebar knows (a page opened by typing its URL highlights the open list).
const history = (state) => state?.section === 'history'

// Sidebar items per role. DashboardLayout takes one of these. `isActive(pathname, state)`
// overrides the default "path or anything below it" rule.
export const customerNav = {
  main: [
    { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
    { label: 'My Orders', to: '/dashboard/orders', icon: ShoppingBag },
    { label: 'My Returns', to: '/dashboard/returns', icon: RotateCcw },
    { label: 'Refunds', to: '/dashboard/refunds', icon: Wallet },
    { label: 'Profile', to: '/dashboard/profile', icon: User },
  ],
  secondary: [
    { label: 'Settings', to: '/dashboard/settings', icon: Settings },
    // Not a link: the sidebar calls the API to end the session (see Sidebar)
    { label: 'Logout', action: 'logout', icon: LogOut },
  ],
}

export const adminNav = {
  main: [
    { label: 'Dashboard', to: '/admin', icon: Home, end: true },
    { label: 'Users', to: '/admin/users', icon: Users },
    { label: 'Invitations', to: '/admin/invitations', icon: Mail },
  ],
  secondary: [
    { label: 'Settings', to: '/admin/settings', icon: Settings },
    { label: 'Logout', action: 'logout', icon: LogOut },
  ],
}

export const sellerNav = {
  main: [
    { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
    { label: 'Products', to: '/dashboard/products', icon: Package },
    { label: 'Orders', to: '/dashboard/orders', icon: ShoppingBag },
    { label: 'Return Requests', to: '/dashboard/returns', icon: RotateCcw },
    { label: 'Analytics', to: '/dashboard/analytics', icon: ChartColumn },
    { label: 'Profile', to: '/dashboard/profile', icon: User },
  ],
  secondary: customerNav.secondary,
}

export const pickupNav = {
  main: [
    { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
    { label: 'Assigned Pickups', to: '/dashboard/pickups', icon: ClipboardList, isActive: (p, s) => under(p, '/dashboard/pickups') && !history(s) },
    { label: 'Pickup History', to: '/dashboard/history', icon: History, isActive: (p, s) => p === '/dashboard/history' || (under(p, '/dashboard/pickups') && history(s)) },
    { label: 'Profile', to: '/dashboard/profile', icon: User },
  ],
  secondary: customerNav.secondary,
}

export const warehouseNav = {
  main: [
    { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
    { label: 'Inspection Queue', to: '/dashboard/inspections', icon: ClipboardCheck, isActive: (p, s) => under(p, '/dashboard/inspections') && p !== '/dashboard/inspections/history' && !history(s) },
    { label: 'Completed Inspections', to: '/dashboard/inspections/history', icon: ListChecks, isActive: (p, s) => p === '/dashboard/inspections/history' || (under(p, '/dashboard/inspections') && history(s)) },
    { label: 'Refunds', to: '/dashboard/refunds', icon: Wallet },
    { label: 'Profile', to: '/dashboard/profile', icon: User },
    // development-only entry (Vite dev server only)
    ...(import.meta.env.DEV ? [{ label: 'AI Test (dev)', to: '/dashboard/dev/ai-test', icon: FlaskConical }] : []),
  ],
  secondary: customerNav.secondary,
}

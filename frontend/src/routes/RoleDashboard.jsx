import { Navigate, matchRoutes, useLocation, useRoutes } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import DashboardLayout from '../layouts/DashboardLayout.jsx'
import DashboardFallback from '../pages/DashboardFallback.jsx'
import { ROLE_LABELS, ROLES } from '../utils/roles.js'
import { customerRoutes } from './customerRoutes.jsx'
import { customerNav, pickupNav, sellerNav, warehouseNav } from './navigation.js'
import { pickupRoutes } from './pickupRoutes.jsx'
import { sellerRoutes } from './sellerRoutes.jsx'
import { warehouseRoutes } from './warehouseRoutes.jsx'

// Everything under /dashboard. The area shown comes from user.role (from the backend via
// /api/auth/me), so each role only ever gets its own routes and navigation.
const AREAS = {
  [ROLES.CUSTOMER]: { nav: customerNav, routes: customerRoutes },
  [ROLES.SELLER]: { nav: sellerNav, routes: sellerRoutes },
  [ROLES.PICKUP_AGENT]: { nav: pickupNav, routes: pickupRoutes },
  [ROLES.WAREHOUSE]: { nav: warehouseNav, routes: warehouseRoutes },
}

// Catch-all inside the dashboard: is this path a real page of some OTHER role?
function Fallback({ role }) {
  const { pathname } = useLocation()
  const others = Object.entries(AREAS).filter(([r]) => r !== role).map(([, area]) => ({ path: '/dashboard', children: area.routes }))
  return <DashboardFallback forbidden={others.some((tree) => matchRoutes([tree], pathname) !== null)} />
}

function RoleArea({ user }) {
  const area = AREAS[user.role]
  const routes = useRoutes([
    {
      path: '/',
      element: <DashboardLayout key={user.role} navItems={area.nav} user={{ ...user, role: ROLE_LABELS[user.role] }} />,
      children: [...area.routes, { path: '*', element: <Fallback role={user.role} /> }],
    },
  ])
  return routes
}

export default function RoleDashboard() {
  const { user } = useAuth() // ProtectedRoute guarantees a user here
  if (user.role === ROLES.ADMIN) return <Navigate to="/admin" replace /> // admins live under /admin
  // A role this build does not know (should not happen: the database restricts it) gets no area.
  if (!AREAS[user.role]) return <DashboardFallback forbidden />
  return <RoleArea user={user} />
}

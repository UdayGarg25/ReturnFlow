import { Lock } from 'lucide-react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useAuth } from '../context/useAuth.js'
import DashboardLayout from '../layouts/DashboardLayout.jsx'
import DashboardFallback from '../pages/DashboardFallback.jsx'
import DashboardPlaceholder from '../pages/DashboardPlaceholder.jsx'
import Dashboard from '../pages/admin/Dashboard.jsx'
import Invitations from '../pages/admin/Invitations.jsx'
import Users from '../pages/admin/Users.jsx'
import { ROLE_LABELS, ROLES } from '../utils/roles.js'
import { adminNav } from './navigation.js'
import { useRoutes } from 'react-router-dom'

// Child routes of /admin. (UX only: every /api/admin call is checked by the backend.)
const tree = (user) => [
  {
    path: '/',
    element: <DashboardLayout navItems={adminNav} user={{ ...user, role: ROLE_LABELS[user.role] }} />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'users', element: <Users /> },
      { path: 'invitations', element: <Invitations /> },
      { path: 'settings', element: <DashboardPlaceholder title="Settings" /> },
      { path: '*', element: <DashboardFallback /> },
    ],
  },
]

function AdminArea({ user }) {
  return useRoutes(tree(user))
}

// Only an ADMIN gets the area; anyone else is told they have no access (and the API would refuse them anyway).
export default function AdminRoutes() {
  const { user } = useAuth() // ProtectedRoute guarantees a user here
  if (user.role !== ROLES.ADMIN) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Card className="mt-10">
          <EmptyState icon={Lock} title="You don't have access to this page" description="The admin area is only for administrators." action={<Button to="/dashboard">Go to my dashboard</Button>} />
        </Card>
      </main>
    )
  }
  return <AdminArea user={user} />
}

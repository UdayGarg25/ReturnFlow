import { formatDate } from '../utils/format.js'
import Button from './Button.jsx'
import DataTable from './DataTable.jsx'
import RoleBadge from './RoleBadge.jsx'

// Accounts that exist. `withView` adds the dashboard's "View" action (opens the Users page filtered to that email).
export default function UsersTable({ rows, withView = false }) {
  const columns = [
    { header: 'Name', render: (u) => u.name },
    { header: 'Email', render: (u) => <span className="break-all">{u.email}</span> },
    { header: 'Role', render: (u) => <RoleBadge role={u.role} /> },
    { header: 'Joined At', render: (u) => formatDate(u.joinedAt) },
    ...(withView
      ? [{ header: 'Actions', action: true, align: 'right', render: (u) => <Button to={`/admin/users?q=${encodeURIComponent(u.email)}`} variant="outline" size="sm">View</Button> }]
      : []),
  ]
  return <DataTable columns={columns} rows={rows} getKey={(u) => u.id} />
}

import { Ban } from 'lucide-react'
import { formatDate } from '../utils/format.js'
import Button from './Button.jsx'
import DataTable from './DataTable.jsx'
import RoleBadge from './RoleBadge.jsx'
import RowMenu from './RowMenu.jsx'
import StatusBadge from './StatusBadge.jsx'

// Invitations with the actions each status allows:
//   PENDING   Resend + Cancel     EXPIRED  Resend     ACCEPTED  View User     CANCELLED  none
// `actions` comes from useInvitationActions.
export default function InvitationsTable({ rows, actions }) {
  const columns = [
    { header: 'Email', render: (i) => <span className="break-all">{i.email}</span> },
    { header: 'Role', render: (i) => <RoleBadge role={i.role} /> },
    { header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
    { header: 'Invited At', render: (i) => formatDate(i.invitedAt) },
    { header: 'Expires At', render: (i) => (i.status === 'ACCEPTED' ? '-' : formatDate(i.expiresAt)) },
    {
      header: 'Actions',
      action: true,
      align: 'right',
      render: (i) => {
        const busy = actions.busyId === i.id
        if (i.status === 'ACCEPTED') {
          return <Button to={`/admin/users?q=${encodeURIComponent(i.email)}`} variant="outline" size="sm">View User</Button>
        }
        if (i.status === 'CANCELLED') return <span className="text-xs text-slate-400">No actions</span>
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => actions.resend(i)}>{busy ? 'Sending...' : 'Resend'}</Button>
            {i.status === 'PENDING' && (
              <RowMenu label={`More actions for ${i.email}`} items={[{ label: 'Cancel invitation', icon: Ban, danger: true, onSelect: () => { actions.setFeedback(null); actions.askCancel(i) } }]} />
            )}
          </span>
        )
      },
    },
  ]
  return <DataTable columns={columns} rows={rows} getKey={(i) => i.id} />
}

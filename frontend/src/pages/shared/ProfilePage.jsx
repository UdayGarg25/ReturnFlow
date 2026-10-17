import { Camera, Lock } from 'lucide-react'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import { TextField } from '../../components/FormField.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import { useAuth } from '../../context/useAuth.js'
import { formatDate, initials } from '../../utils/format.js'
import { ROLE_LABELS } from '../../utils/roles.js'

function ProfileRow({ label, value, editable }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[7rem_1fr_auto] sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">{value}</dd>
      {editable ? (
        <Button variant="outline" size="sm" aria-label={`Edit ${label.toLowerCase()}`}>Edit</Button>
      ) : (
        <span className="hidden sm:block sm:w-[3.25rem]" aria-hidden="true" />
      )}
    </div>
  )
}

// Shared by every role; shows the logged-in user (from /api/auth/me).
// With `showPhoto`, a profile-picture card is shown beside the forms.
export default function ProfilePage({ showPhoto = false }) {
  const { user: account } = useAuth()
  const user = { ...account, role: ROLE_LABELS[account.role], joinedAt: account.createdAt }
  // UI only: saving is wired up in the authentication phase.
  const handleSubmit = (e) => e.preventDefault()

  const forms = (
    <>
      <Card title="Personal Information">
        <dl className="space-y-4">
          <ProfileRow label="Full Name" value={user.name} editable />
          <ProfileRow label="Email" value={user.email} editable />
          <ProfileRow label="Role" value={user.role} />
          <ProfileRow label="Joined On" value={formatDate(user.joinedAt)} />
        </dl>
      </Card>

      <Card title="Change Password">
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField label="Current Password" icon={Lock} type="password" name="currentPassword" autoComplete="current-password" placeholder="Enter current password" />
          <TextField label="New Password" icon={Lock} type="password" name="newPassword" autoComplete="new-password" placeholder="Enter new password" />
          <TextField label="Confirm New Password" icon={Lock} type="password" name="confirmPassword" autoComplete="new-password" placeholder="Confirm new password" />
          <Button type="submit" fullWidth size="lg">Update Password</Button>
        </form>
      </Card>
    </>
  )

  return (
    <>
      <PageHeader title="My Profile" subtitle="Manage your account information." />
      {showPhoto ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">{forms}</div>
          <Card title="Profile Picture" className="lg:self-start">
            <div className="flex flex-col items-center text-center">
              <span
                aria-hidden="true"
                className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-4xl font-bold text-white shadow-md shadow-brand-600/25"
              >
                {initials(user.name)}
              </span>
              <p className="mt-4 font-semibold text-slate-900">{user.name}</p>
              <p className="text-sm text-slate-500">{user.role}</p>
              <Button variant="outline" className="mt-5">
                <Camera size={16} aria-hidden="true" /> Change Photo
              </Button>
              <p className="mt-3 text-xs text-slate-400">JPG or PNG, up to 2MB</p>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">{forms}</div>
      )}
    </>
  )
}

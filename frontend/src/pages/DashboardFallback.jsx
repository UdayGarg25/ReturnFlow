import { Lock, SearchX } from 'lucide-react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import EmptyState from '../components/EmptyState.jsx'

// Shown inside the dashboard for a path the current role does not have.
//   forbidden: the path exists for ANOTHER role  -> "no access"
//   otherwise                                    -> plain "not found"
// (UX only: the API enforces the same boundary on the server.)
export default function DashboardFallback({ forbidden }) {
  return (
    <Card className="mt-2">
      <EmptyState
        icon={forbidden ? Lock : SearchX}
        title={forbidden ? "You don't have access to this page" : 'Page not found'}
        description={forbidden ? 'This area is for a different type of account.' : "We couldn't find the page you were looking for."}
        action={<Button to="/dashboard">Go to my dashboard</Button>}
      />
    </Card>
  )
}

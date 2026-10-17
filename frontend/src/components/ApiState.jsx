import { Loader2, Lock, SearchX, TriangleAlert } from 'lucide-react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import EmptyState from './EmptyState.jsx'

// What to show while a screen's data is loading.
export function LoadingState({ label = 'Loading...' }) {
  return (
    <Card>
      <div role="status" className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-slate-500">
        <Loader2 size={26} aria-hidden="true" className="animate-spin text-brand-600" />
        {label}
      </div>
    </Card>
  )
}

// What to show when loading failed. Only friendly text: never the server's own error text.
//   401 -> session ended (the route guard is already taking the user to /login)
//   403 -> no access        404 -> not found (or not yours: the API does not say which)
//   anything else -> try again
export function ErrorState({ error, onRetry, notFoundTitle = 'Not found', notFoundText = "We couldn't find that.", backTo }) {
  const status = error?.status
  const back = backTo && <Button to={backTo.to} variant="secondary">{backTo.label}</Button>

  let view
  if (status === 401) view = { icon: Lock, title: 'Your session has ended', text: 'Please log in again to continue.' }
  else if (status === 403) view = { icon: Lock, title: "You don't have access to this", text: 'Your account is not allowed to view this page.', action: back }
  else if (status === 404) view = { icon: SearchX, title: notFoundTitle, text: notFoundText, action: back }
  else {
    view = {
      icon: TriangleAlert,
      title: "We couldn't load this",
      text: status === 0 ? 'We could not reach the server. Check your connection and try again.' : 'Something went wrong on our side. Please try again.',
      action: onRetry && <Button onClick={onRetry}>Try again</Button>,
    }
  }
  return (
    <Card>
      <div role={status === 404 ? undefined : 'alert'}>
        <EmptyState icon={view.icon} title={view.title} description={view.text} action={view.action} />
      </div>
    </Card>
  )
}

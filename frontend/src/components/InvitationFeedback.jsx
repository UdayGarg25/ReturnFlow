import Button from './Button.jsx'
import Notice from './Notice.jsx'

// The result of a resend / cancel, plus the "are you sure" bar for cancelling. In development mail
// mode the backend also returns the link (nothing is emailed), which is shown so it can be used.
export default function InvitationFeedback({ actions }) {
  const { feedback, confirmCancel, busyId } = actions
  return (
    <>
      {feedback && (
        <Notice tone={feedback.tone} className="mb-4">
          <p>{feedback.text}</p>
          {feedback.link && (
            <p className="mt-1 break-all text-xs">Development mode, no email was sent. Invitation link: <a className="font-medium underline" href={feedback.link}>{feedback.link}</a></p>
          )}
        </Notice>
      )}
      {confirmCancel && (
        <div role="alertdialog" aria-label="Confirm cancelling the invitation" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Cancel the invitation for {confirmCancel.email}?</p>
          <p className="mt-1 text-sm text-red-800">The link in their email will stop working.</p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => actions.askCancel(null)} disabled={busyId !== null}>Keep invitation</Button>
            <Button variant="danger" onClick={() => actions.cancel(confirmCancel)} disabled={busyId !== null}>{busyId !== null ? 'Cancelling...' : 'Cancel invitation'}</Button>
          </div>
        </div>
      )}
    </>
  )
}

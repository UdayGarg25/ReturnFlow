import { useState } from 'react'
import { cancelInvitation, resendInvitation } from '../services/adminService.js'

// Resend / cancel for the invitation tables. After each call the list is re-read from the backend.
//   feedback: { tone, text, link? } shown by <InvitationFeedback />
//   confirmCancel: the invitation awaiting "yes, cancel it"
export default function useInvitationActions(reload) {
  const [busyId, setBusyId] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)

  const finish = (result) => {
    setFeedback(result)
    setBusyId(null)
    setConfirmCancel(null)
    reload()
  }

  const resend = async (inv) => {
    setBusyId(inv.id)
    setFeedback(null)
    try {
      const res = await resendInvitation(inv.id)
      finish(
        res.emailed
          ? { tone: 'success', text: `A new invitation email was sent to ${inv.email}. The earlier link no longer works.`, link: res.devLink }
          : { tone: 'warning', text: `${inv.email}: ${res.emailError}` },
      )
    } catch (err) {
      finish({ tone: 'error', text: err.message })
    }
  }

  const cancel = async (inv) => {
    setBusyId(inv.id)
    setFeedback(null)
    try {
      await cancelInvitation(inv.id)
      finish({ tone: 'success', text: `Invitation for ${inv.email} was cancelled.` })
    } catch (err) {
      finish({ tone: 'error', text: err.message })
    }
  }

  return { busyId, feedback, setFeedback, confirmCancel, askCancel: setConfirmCancel, resend, cancel }
}

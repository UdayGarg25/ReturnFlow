import { FlaskConical, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import Notice from '../../components/Notice.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import useApi from '../../hooks/useApi.js'
import { createTestScenario, listTestScenarios, removeTestScenarios } from '../../services/devAiTestService.js'
import { photoProblem } from '../../services/returnImageService.js'
import { formatDateTime } from '../../utils/format.js'
import { returnLabel } from '../../utils/labels.js'

// DEVELOPMENT-ONLY page (the route exists only in the Vite dev server). It creates an isolated TEST return for the Sony
// WH-1000XM5 with the photo you upload, so you can run the AI assessment for real from the normal inspection screen.
export default function AiTestScenario() {
  const { data, error, loading, reload } = useApi((signal) => listTestScenarios({ signal }))
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const created = useRef(null)
  useEffect(() => () => created.current && URL.revokeObjectURL(created.current), [])

  const header = <PageHeader title="AI Test Scenario" subtitle="Development only: try the AI comparison with your own photo, without touching real returns." action={<span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase text-amber-800 ring-1 ring-amber-600/30">Test only</span>} />
  if (loading) return <>{header}<LoadingState label="Loading..." /></>
  if (error?.status === 404) return <>{header}<Notice>The AI test scenario is switched off on this server. It is development-only: set <code>AI_TEST_SCENARIO=true</code> in <code>backend/.env</code> and restart the backend (it never runs in production).</Notice></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const problem = photoProblem(f)
    if (problem) return setNotice({ tone: 'error', text: problem })
    if (created.current) URL.revokeObjectURL(created.current)
    created.current = URL.createObjectURL(f)
    setFile(f)
    setPreview(created.current)
    setNotice(null)
  }
  const run = async (fn, ok) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      setNotice({ tone: 'success', text: ok })
      reload()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
      setConfirmRemove(false)
    }
  }

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="1. Upload the return-condition photo" className="lg:col-span-2 lg:self-start">
          <p className="mb-4 text-sm text-slate-600">
            Upload a <strong>real photo of a Sony WH-1000XM5</strong> (any condition you want to test). It becomes the customer&apos;s return photo on a new test return.
            The AI will compare it with the product&apos;s original reference image. It must be a different image from the reference.
          </p>
          {notice && <Notice tone={notice.tone} className="mb-4">{notice.text}</Notice>}
          <label className="block">
            <span className="sr-only">Choose a photo</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
          </label>
          {preview && <div className="mt-4 aspect-square w-48 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={preview} alt="Selected return photo preview" className="h-full w-full object-contain" /></div>}
          <Button className="mt-4" size="lg" disabled={!file || busy} onClick={() => run(() => createTestScenario(file), 'Test return created. Open its inspection from the list.')}>
            <FlaskConical size={16} aria-hidden="true" /> {busy ? 'Creating...' : 'Create test return'}
          </Button>
          <p className="mt-3 text-xs text-slate-500">Creates a [TEST] customer, a delivered Sony order and a return that is approved, picked up and sent to the warehouse through the real workflow. Nothing existing is changed.</p>
        </Card>

        <Card title="2. Open it as the warehouse user, then run the AI" className="lg:col-span-3">
          {data.scenarios.length === 0 ? (
            <p className="text-sm text-slate-500">No test returns yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.scenarios.map((s) => (
                <li key={s.returnId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" data-testid="test-scenario">
                  <div>
                    <p className="font-semibold text-slate-900">Test return #{returnLabel(s.returnId)} <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">test</span></p>
                    <p className="text-xs text-slate-500">{formatDateTime(s.createdAt)} &middot; {s.photos} photo(s) &middot; AI: {s.aiStatus ? s.aiStatus.toLowerCase() : 'not run'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={s.returnStatus} />
                    {s.inspectionId && <Button to={`/dashboard/inspections/${s.inspectionId}`} size="sm">Open inspection</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.scenarios.length > 0 || data.customerName ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              {confirmRemove ? (
                <div role="alertdialog" aria-label="Confirm removing the test data" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <p className="font-semibold">Remove all test returns, their photos and the [TEST] customer?</p>
                  <p className="mt-1">Only test data is deleted. Real returns are not touched.</p>
                  <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => run(removeTestScenarios, 'Test data removed.')}>Remove test data</Button></div>
                </div>
              ) : (
                <Button variant="dangerOutline" size="sm" disabled={busy || data.scenarios.length === 0} onClick={() => setConfirmRemove(true)}><Trash2 size={14} aria-hidden="true" /> Remove test data</Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}

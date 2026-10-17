import { Bot, CircleAlert, Info, Loader2, RotateCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import useApi from '../hooks/useApi.js'
import { fetchEvidenceBlob, getAiAssessment, retryAiAssessment, startAiAssessment } from '../services/warehouseService.js'
import { formatDateTime } from '../utils/format.js'
import { ErrorState, LoadingState } from './ApiState.jsx'
import Button from './Button.jsx'
import Card from './Card.jsx'
import Notice from './Notice.jsx'
import PrivateImage from './PrivateImage.jsx'

const MATCH = { likely_match: 'Likely a match', possible_mismatch: 'Possible mismatch', inconclusive: 'Inconclusive' }
const DAMAGE = { visible_damage: 'Visible damage', no_visible_damage: 'No visible damage', inconclusive: 'Inconclusive' }
const CONDITION = { like_new: 'Like new', normal_wear: 'Normal wear', possible_surface_damage: 'Possible surface damage', visible_damage: 'Visible damage', inconclusive: 'Inconclusive' }
const TYPES = { scratch: 'Scratch', dent: 'Dent', crack: 'Crack', broken_part: 'Broken part', stain: 'Stain', missing_part: 'Missing part', wear: 'Wear', other: 'Other' }
const POLL_MS = 2500

const tone = (kind, value) => {
  const bad = (kind === 'match' && value === 'possible_mismatch') || (kind === 'damage' && value === 'visible_damage')
  const good = (kind === 'match' && value === 'likely_match') || (kind === 'damage' && value === 'no_visible_damage')
  return bad ? 'bg-red-50 text-red-700 ring-red-600/20' : good ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'
}
const Pill = ({ className, children }) => <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>{children}</span>
const List = ({ items }) => (items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : null)

function Evidence({ inspectionId, evidence }) {
  const tile = 'aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100'
  return (
    <div className="mb-5">
      <p className="mb-2 text-sm font-semibold text-navy-900">Evidence the AI compares</p>
      <div className="grid grid-cols-3 gap-3">
        <figure className="min-w-0">
          <div className={tile}>
            {evidence.hasReference
              ? <PrivateImage cacheKey={`ref-${inspectionId}`} load={(signal) => fetchEvidenceBlob(inspectionId, 'reference', { signal })} alt="Original product reference" />
              : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-500">No reference image</div>}
          </div>
          <figcaption className="mt-1 text-xs text-slate-500">Original product</figcaption>
        </figure>
        {evidence.photos.length === 0 && (
          <figure className="min-w-0"><div className={tile}><div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-500">No customer photos</div></div><figcaption className="mt-1 text-xs text-slate-500">Customer photos</figcaption></figure>
        )}
        {evidence.photos.map((p, i) => (
          <figure key={p.id} className="min-w-0">
            <div className={tile}><PrivateImage cacheKey={`photo-${inspectionId}-${p.id}`} load={(signal) => fetchEvidenceBlob(inspectionId, 'photo', { signal, imageId: p.id })} alt={`Customer photo ${i + 1}`} /></div>
            <figcaption className="mt-1 text-xs text-slate-500">Customer photo {i + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Result({ result }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-navy-900">Product match</p>
        <div className="mt-1"><Pill className={tone('match', result.productMatch.status)}>{MATCH[result.productMatch.status]}</Pill></div>
        <List items={result.productMatch.evidence} />
      </div>
      <div>
        <p className="text-sm font-semibold text-navy-900">Visible damage</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Pill className={tone('damage', result.damageAssessment.status)}>{DAMAGE[result.damageAssessment.status]}</Pill>
          {result.damageAssessment.types.map((t) => <Pill key={t} className="bg-orange-50 text-orange-700 ring-orange-600/20">{TYPES[t]}</Pill>)}
        </div>
        <List items={result.damageAssessment.evidence} />
      </div>
      <p className="text-sm text-slate-700"><span className="font-semibold text-navy-900">Visible condition: </span>{CONDITION[result.visibleCondition]}</p>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{result.summary}</p>
      {result.limitations.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-navy-900">Limitations</p>
          <List items={result.limitations} />
        </div>
      )}
      {result.manualReviewRequired
        ? <Notice tone="warning">Manual review is recommended. Please inspect the physical item before deciding.</Notice>
        : <Notice>The AI flagged nothing, but it only sees photos. Still inspect the physical item before deciding.</Notice>}
    </div>
  )
}

// The AI-assisted part of the inspection screen: evidence, the "Run AI Assessment" control, progress, result or a plain
// explanation. Advisory only: it never touches the decision form, and manual inspection always stays possible.
// `canAct`: this signed-in staff member is the one the inspection is assigned to (the backend enforces it too).
export default function AiAssessmentPanel({ inspectionId, canAct }) {
  const initial = useApi((signal) => getAiAssessment(inspectionId, { signal }), [inspectionId])
  const [live, setLive] = useState(null) // newer than `initial` after a start/retry/poll
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const assessment = live ?? initial.data

  // while the model is working, ask the backend for the saved state every few seconds
  useEffect(() => {
    if (assessment?.status !== 'RUNNING') return undefined
    const timer = setTimeout(() => getAiAssessment(inspectionId).then(setLive, () => {}), POLL_MS)
    return () => clearTimeout(timer)
  }, [assessment, inspectionId])

  if (initial.loading) return <Card title="AI-Assisted Assessment"><LoadingState label="Loading..." /></Card>
  if (initial.error) return <Card title="AI-Assisted Assessment"><ErrorState error={initial.error} onRetry={initial.reload} /></Card>

  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      setLive(await fn(inspectionId))
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }
  const running = assessment.status === 'RUNNING'

  return (
    <Card
      title={<span className="flex items-center gap-2"><Sparkles size={18} aria-hidden="true" className="text-brand-600" /> AI-Assisted Assessment</span>}
      action={<Pill className="bg-violet-50 text-violet-700 ring-violet-600/20">Advisory only</Pill>}
    >
      <Evidence inspectionId={inspectionId} evidence={assessment.evidence} />
      {problem && <Notice tone="error" className="mb-4">{problem}</Notice>}

      {assessment.status === 'NOT_STARTED' && (
        <div className="space-y-3">
          {assessment.unavailable ? (
            <Notice><span className="flex gap-2"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{assessment.unavailable.message}</span></span></Notice>
          ) : !assessment.eligible ? (
            <p className="text-sm text-slate-500">This inspection is no longer open, so an AI assessment cannot be started.</p>
          ) : !canAct ? (
            <p className="text-sm text-slate-500">Only the staff member this inspection is assigned to can run the AI assessment.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Compare the customer&apos;s photos with the product&apos;s reference image. This is optional: you can also inspect the item manually.</p>
              <Button disabled={busy} onClick={() => run(startAiAssessment)}><Bot size={16} aria-hidden="true" /> Run AI Assessment</Button>
            </>
          )}
        </div>
      )}

      {running && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Loader2 size={20} aria-hidden="true" className="shrink-0 animate-spin" />
          <span>AI assessment in progress. This can take up to a minute; you can keep working or inspect manually.</span>
        </div>
      )}

      {assessment.status === 'FAILED' && (
        <div className="space-y-3">
          <Notice tone="error"><span className="flex gap-2"><CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{assessment.error.message}</span></span></Notice>
          {assessment.unavailable ? <p className="text-sm text-slate-500">{assessment.unavailable.message}</p>
            : canAct && assessment.eligible && <Button variant="outline" disabled={busy} onClick={() => run(retryAiAssessment)}><RotateCw size={16} aria-hidden="true" /> Try again</Button>}
        </div>
      )}

      {assessment.status === 'COMPLETED' && (
        <>
          <Result result={assessment.result} />
          <p className="mt-4 text-xs text-slate-500">AI-generated advisory assessment. Model {assessment.model} via {assessment.provider}, completed {formatDateTime(assessment.completedAt)}. The warehouse employee makes the final decision.</p>
        </>
      )}
    </Card>
  )
}

import * as warehouse from '../services/warehouse.service.js'
import * as ai from '../services/aiInspection.service.js'
import { handle, handleFile, parseId } from '../utils/http.js'

export const list = handle(async () => ({ body: { inspections: await warehouse.listInspections() } }))
export const get = handle(async (req) => ({ body: { inspection: await warehouse.getInspection(parseId(req.params.id, 'Inspection')) } }))
// The deciding staff member is always req.user.id.
export const decide = handle(async (req) => ({ body: { inspection: await warehouse.decideInspection(req.user.id, parseId(req.params.id, 'Inspection'), req.body) } }))

// AI-assisted assessment (advisory only: none of these touch the inspection, the return or any refund).
export const getAiAssessment = handle(async (req) => ({ body: { assessment: await ai.getAssessment(parseId(req.params.id, 'Inspection')) } }))
export const startAiAssessment = handle(async (req) => ({ status: 202, body: { assessment: await ai.startAssessment(req.user.id, parseId(req.params.id, 'Inspection')) } }))
export const retryAiAssessment = handle(async (req) => ({ status: 202, body: { assessment: await ai.startAssessment(req.user.id, parseId(req.params.id, 'Inspection'), { retry: true }) } }))

// The evidence images, streamed through the backend (the bucket is private; no keys or URLs reach the browser).
const noStoreImage = (file) => ({ body: file.body, headers: { 'Content-Type': file.type, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', Vary: 'Cookie' } })
export const referenceImage = handleFile(async (req) => noStoreImage(await ai.getEvidenceImage(parseId(req.params.id, 'Inspection'), 'reference')))
export const returnPhoto = handleFile(async (req) => noStoreImage(await ai.getEvidenceImage(parseId(req.params.id, 'Inspection'), 'photo', parseId(req.params.imageId, 'Image'))))

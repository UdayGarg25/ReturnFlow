// Usage: npm run test:ai:live [-- --photo path/to/return-photo.(jpg|png|webp)]
//
// OPT-IN smoke test of the REAL OpenRouter integration. It makes one real request (uses your OPENROUTER_API_KEY and a
// little of your quota) with the configured model and the configured provider-only restriction (default atlas-cloud/fp8), through the same
// request code the warehouse feature uses (assessEvidence in aiInspection.service.js). It is NOT part of `npm test`/`test:ai`.
//
// It touches no business data: it only READS the Sony reference image from the private S3 bucket (and, if there is one,
// a customer photo of a Sony return), and nothing is written to PostgreSQL or S3. The API key and image bytes are never printed.
//
// Comparison image, in order: (1) a customer photo of a Sony WH-1000XM5 return, if one exists; (2) --photo <file>;
// (3) the reference image used twice. Case 3 only proves the provider and image path work; it is NOT a real condition comparison.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pool from '../src/config/db.js'
import { aiConfig, AiError, assessEvidence, loadImage, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, messageFor, SIGNATURES } from '../src/services/aiInspection.service.js'

const REFERENCE_KEY = 'products/demo/sony-wh1000xm5.png'
const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`)

async function localImage(file) {
  const bytes = await readFile(path.resolve(file))
  const real = SIGNATURES.find((s) => s.test(bytes))
  if (!real) throw new Error('--photo is not a JPEG, PNG or WebP image.')
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('--photo is larger than 5 MB.')
  return { bytes, type: real.type }
}

let exitCode = 0
try {
  const cfg = aiConfig()
  console.log('ReturnFlow live AI smoke test (a real OpenRouter request)\n')
  line('model', cfg.model)
  line('provider restriction', `only: [${cfg.provider}], allow_fallbacks: false`)
  line('API key configured', cfg.apiKey ? 'yes (value not shown)' : 'NO')
  if (!cfg.apiKey) throw new AiError('NOT_CONFIGURED')
  if (cfg.serverURL) throw new Error('OPENROUTER_SERVER_URL is set (a test mock). Unset it to test the real service.')

  const reference = await loadImage(REFERENCE_KEY)
  line('reference image', `${REFERENCE_KEY} (${reference.type}, ${reference.bytes.length} bytes, from private S3)`)

  // 1. a real customer photo of a Sony return (read only)
  const { rows } = await pool.query(
    `SELECT ri.image_key FROM return_images ri JOIN return_requests rr ON rr.id = ri.return_request_id JOIN products p ON p.id = rr.product_id
      WHERE p.image_key = $1 ORDER BY ri.id DESC LIMIT 1`, [REFERENCE_KEY])
  const photoArg = process.argv.indexOf('--photo') > 0 ? process.argv[process.argv.indexOf('--photo') + 1] : null
  let photo, mode
  if (rows[0]) { photo = await loadImage(rows[0].image_key); mode = 'distinct: a stored customer photo of a Sony return' }
  else if (photoArg) { photo = await localImage(photoArg); mode = 'distinct: the local image given with --photo' }
  else { photo = reference; mode = 'SAME IMAGE TWICE (the reference): a provider/connectivity check, NOT a real return-condition comparison' }
  const distinct = photo !== reference
  line('comparison image', `${photo.type}, ${photo.bytes.length} bytes`)
  line('mode', mode)
  if (reference.bytes.length + photo.bytes.length > MAX_TOTAL_IMAGE_BYTES) throw new AiError('IMAGES_TOO_LARGE')

  const ctx = {
    product_name: 'Sony WH-1000XM5',
    product_description: 'Wireless noise-cancelling over-ear headphones, black.',
    reason: 'OTHER',
    description: distinct ? 'Live smoke test of the assessment feature.' : 'SMOKE TEST ONLY: both images are the same product reference image. There is no real customer photo to compare.',
  }
  console.log('\nsending the request...')
  const started = performance.now()
  const { assessment, usage } = await assessEvidence(ctx, reference, [photo])
  line('elapsed', `${((performance.now() - started) / 1000).toFixed(1)} s`)
  if (usage) line('tokens', `prompt ${usage.promptTokens ?? '?'}, completion ${usage.completionTokens ?? '?'}`)
  console.log('\nvalidated result (passed the application\'s strict schema check):')
  line('overall', assessment.overallAssessment)
  line('product match', `${assessment.productMatch.status} - ${assessment.productMatch.evidence.join(' | ') || '(no evidence listed)'}`)
  line('visible damage', `${assessment.damageAssessment.status}${assessment.damageAssessment.types.length ? ` (${assessment.damageAssessment.types.join(', ')})` : ''}`)
  line('visible condition', assessment.visibleCondition)
  line('manual review', String(assessment.manualReviewRequired))
  line('limitations', assessment.limitations.join(' | ') || '(none)')
  line('summary', assessment.summary)
  console.log(distinct ? '\nRESULT: PASSED (live model response, two distinct images)' : '\nRESULT: PASSED (live model response, but the SAME image was used twice: connectivity check only)')
} catch (err) {
  exitCode = 1
  if (err instanceof AiError) {
    console.error(`\nRESULT: FAILED - ${err.code}${err.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${messageFor(err.code)}`)
    if (err.detail) console.error(`provider said (redacted): ${err.detail}`)
  } else {
    console.error(`\nRESULT: FAILED - ${err.name}: ${err.message}`)
  }
} finally {
  await pool.end()
  process.exitCode = exitCode
}

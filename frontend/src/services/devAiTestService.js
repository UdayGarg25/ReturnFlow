// DEVELOPMENT-ONLY: the isolated AI test scenario (/api/dev/ai-test). The backend only serves it when
// AI_TEST_SCENARIO=true and it is not production; otherwise every call here answers 404.
import { API_URL, ApiError, request } from './authApi.js'

export async function listTestScenarios({ signal } = {}) {
  const { customerName, scenarios } = await request('/api/dev/ai-test/scenarios', { signal })
  return {
    customerName,
    scenarios: scenarios.map((s) => ({ returnId: s.return_id, returnStatus: s.return_status, createdAt: s.created_at, inspectionId: s.inspection_id, inspectionStatus: s.inspection_status, aiStatus: s.ai_status, photos: s.photos })),
  }
}

// Sends one real photo (multipart, field "image"). The backend validates it exactly like a customer upload.
export async function createTestScenario(file) {
  const form = new FormData()
  form.append('image', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/dev/ai-test/scenarios`, { method: 'POST', credentials: 'include', body: form })
  } catch {
    throw new ApiError(0, 'We could not reach the server. Please try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, res.status < 500 && typeof data?.message === 'string' ? data.message : 'Something went wrong. Please try again.')
  return { returnId: data.returnId, inspectionId: data.inspectionId }
}

export const removeTestScenarios = () => request('/api/dev/ai-test/scenarios', { method: 'DELETE' })

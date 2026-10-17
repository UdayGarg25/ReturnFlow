// Customer return photos (/api/customer/returns/:id/images). Photos live in a PRIVATE bucket: the browser never gets a
// bucket URL, a key or credentials. It uploads to the API, and views a photo through the API's /view endpoint (which
// checks that the photo belongs to the logged-in customer). Every call sends the session cookie.
import { API_URL, ApiError, request } from './authApi.js'

export const MAX_PHOTOS = 2
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// The same rules the backend enforces (the backend re-checks the real file contents). null = fine.
export function photoProblem(file) {
  if (!PHOTO_TYPES.includes(file.type)) return `"${file.name}" is not allowed. Only JPG, PNG or WEBP images are accepted.`
  if (file.size > MAX_PHOTO_BYTES) return `"${file.name}" is larger than 5 MB.`
  if (file.size === 0) return `"${file.name}" is empty.`
  return null
}

const mapImage = (i) => ({ id: i.id, returnId: i.returnRequestId, type: i.imageType, createdAt: i.createdAt })
const base = (returnId) => `/api/customer/returns/${encodeURIComponent(returnId)}/images`

export async function listReturnImages(returnId, { signal } = {}) {
  const { images } = await request(base(returnId), { signal })
  return images.map(mapImage)
}

export const deleteReturnImage = (returnId, imageId) => request(`${base(returnId)}/${encodeURIComponent(imageId)}`, { method: 'DELETE' })

// fetch cannot report upload progress, so this uses XMLHttpRequest. Resolves to the saved image's metadata.
// `signal` cancels the upload (the promise then rejects with an AbortError).
export function uploadReturnImage(returnId, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}${base(returnId)}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onerror = () => reject(new ApiError(0, 'We could not reach the server. Please try again.'))
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }))
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status === 201) return resolve(mapImage(data))
      const message = xhr.status < 500 && typeof data?.message === 'string' ? data.message : 'Something went wrong. Please try again.'
      return reject(new ApiError(xhr.status, message))
    }
    if (signal) {
      if (signal.aborted) return xhr.abort()
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    const form = new FormData()
    form.append('image', file)
    xhr.send(form)
  })
}

// The photo as a Blob, fetched through the API with the session cookie (an <img src> to another origin would not
// be authenticated reliably). Callers turn it into an object URL for an <img>.
export async function fetchReturnImageBlob(returnId, imageId, { signal } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${base(returnId)}/${encodeURIComponent(imageId)}/view`, { credentials: 'include', signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'We could not reach the server.')
  }
  if (!res.ok) throw new ApiError(res.status, 'The photo could not be loaded.')
  return res.blob()
}

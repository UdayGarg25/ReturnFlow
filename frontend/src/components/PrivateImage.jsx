import { ImageOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchReturnImageBlob } from '../services/returnImageService.js'

// Shows one stored private image. The image is requested from the API (login cookie, ownership/role checked there)
// and shown from a temporary object URL, so no bucket URL or key ever reaches the page.
//   customer's own return photo: <PrivateImage returnId imageId />
//   anything else (e.g. warehouse evidence): pass `load(signal) => Promise<Blob>` and a stable `cacheKey`
export default function PrivateImage({ returnId, imageId, load, cacheKey, alt, className = '' }) {
  const [state, setState] = useState({ key: null })
  const key = cacheKey ?? `${returnId}:${imageId}`
  const loader = useRef(null)
  useEffect(() => {
    loader.current = load ?? ((signal) => fetchReturnImageBlob(returnId, imageId, { signal }))
  })

  useEffect(() => {
    const controller = new AbortController()
    let url
    loader.current(controller.signal).then(
      (blob) => {
        url = URL.createObjectURL(blob)
        setState({ key, url })
      },
      (error) => error.name !== 'AbortError' && setState({ key, failed: true }),
    )
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [key])

  const current = state.key === key ? state : {}
  if (current.url) return <img src={current.url} alt={alt} className={`h-full w-full object-cover ${className}`} />
  if (current.failed) {
    return (
      <div role="img" aria-label="Photo unavailable" className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-xs text-slate-500">
        <ImageOff size={20} aria-hidden="true" /> Photo unavailable
      </div>
    )
  }
  return <div aria-hidden="true" className="h-full w-full animate-pulse bg-slate-100" />
}

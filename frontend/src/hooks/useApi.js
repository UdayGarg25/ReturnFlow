import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth.js'

// Loads data for a screen.
//   const { data, error, loading, reload } = useApi((signal) => getCustomerOrders({ signal }), [id])
// `deps` say when to load again (like useEffect's). On failure `error` is the ApiError
// (status 0 = no response, 401, 403, 404, ...); there is never a fallback to other data.
// A 401 means the session is gone: the session state is re-read once (/me), which lets
// the existing route guard send the user to /login. It is not retried, so no loops.
export default function useApi(fetcher, deps = []) {
  const { refreshUser } = useAuth()
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ key: null })
  const fetcherRef = useRef(fetcher)
  const key = `${version}|${deps.join('|')}`

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    const controller = new AbortController()
    fetcherRef.current(controller.signal).then(
      (data) => setResult({ key, data }),
      (error) => {
        if (error.name === 'AbortError') return
        if (error.status === 401) refreshUser()
        setResult({ key, error })
      },
    )
    return () => controller.abort()
  }, [key, refreshUser])

  // A result only counts for the request that produced it; otherwise we are loading.
  const current = result.key === key
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data: current ? result.data : undefined, error: current ? result.error : undefined, loading: !current, reload }
}

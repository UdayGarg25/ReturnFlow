import { useEffect, useRef, useState } from 'react'

// Tracks an element's rendered width so SVG charts can draw at real pixel size.
export default function useElementWidth(initial = 320) {
  const ref = useRef(null)
  const [width, setWidth] = useState(initial)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width || initial)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [initial])

  return [ref, width]
}

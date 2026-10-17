import { Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const MENU_WIDTH = 176

// "More" actions for a table row. The menu is position:fixed, so it is never
// clipped by the table's horizontal scroll container.
// items: [{ label, icon?, onSelect, danger? }]
export default function RowMenu({ label, items }) {
  const [pos, setPos] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const open = pos !== null

  const close = () => setPos(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button')?.focus()
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) return close()
    const r = buttonRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {items.map(({ label: text, icon: Icon, onSelect, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                onSelect()
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {text}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

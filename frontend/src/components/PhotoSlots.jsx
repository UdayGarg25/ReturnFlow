import { ImagePlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { MAX_PHOTOS, PHOTO_TYPES } from '../services/returnImageService.js'
import Button from './Button.jsx'
import PrivateImage from './PrivateImage.jsx'

// Two photo slots. Presentational: the page owns the data.
//   items: up to 2 of { key, src? (local preview) | imageId + returnId (stored photo), status: 'ready'|'uploading'|'error'|'saved',
//          progress?, error? }
//   onFiles(FileList)  files chosen or dropped on an empty slot   onRemove(item)   onCancel(item) while uploading
//   confirmRemove: ask "Remove this photo?" before calling onRemove (for photos already stored)
export default function PhotoSlots({ items, onFiles, onRemove, onCancel, disabled = false, confirmRemove = false, readOnly = false }) {
  const [confirming, setConfirming] = useState(null)
  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => items[i] ?? null)
  return (
    <ul className="grid max-w-md grid-cols-2 gap-3 sm:gap-4">
      {slots.map((item, i) => (
        <li key={item?.key ?? `empty-${i}`} className="min-w-0">
          {item ? (
            <Filled item={item} n={i + 1} confirming={confirming === item.key} readOnly={readOnly} disabled={disabled}
              onAskRemove={() => (confirmRemove ? setConfirming(item.key) : onRemove(item))}
              onKeep={() => setConfirming(null)}
              onConfirm={() => { setConfirming(null); onRemove(item) }}
              onCancel={() => onCancel?.(item)} />
          ) : readOnly ? (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">No photo</div>
          ) : (
            <EmptySlot onFiles={onFiles} disabled={disabled} />
          )}
        </li>
      ))}
    </ul>
  )
}

function EmptySlot({ onFiles, disabled }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const choose = (files) => files?.length && onFiles(files)
  return (
    <>
      <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" disabled={disabled}
        onChange={(e) => { choose(e.target.files); e.target.value = '' }} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) choose(e.dataTransfer.files) }}
        className={`flex aspect-square w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? 'border-brand-600 bg-brand-50' : 'border-brand-600/40 bg-brand-50/40 hover:bg-brand-50'}`}
      >
        <ImagePlus size={28} aria-hidden="true" className="text-brand-600" />
        <span className="mt-2 text-sm font-semibold text-brand-700">Add Photo</span>
        <span className="mt-1 text-xs text-slate-500">Click to upload or drag &amp; drop</span>
        <span className="mt-3 text-[11px] text-slate-500">JPG, PNG, WEBP (max 5 MB)</span>
      </button>
    </>
  )
}

function Filled({ item, n, confirming, readOnly, disabled, onAskRemove, onKeep, onConfirm, onCancel }) {
  const busy = item.status === 'uploading'
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      {item.src ? <img src={item.src} alt={`Photo ${n} preview`} className="h-full w-full object-cover" /> : <PrivateImage returnId={item.returnId} imageId={item.imageId} alt={`Return photo ${n}`} />}

      {!readOnly && !busy && !confirming && (
        <button type="button" onClick={onAskRemove} disabled={disabled} aria-label={`Remove photo ${n}`}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-white hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
          <X size={16} aria-hidden="true" />
        </button>
      )}

      {busy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/60 p-2 text-white" role="status">
          <span className="text-lg font-bold" data-testid="upload-progress">{item.progress ?? 0}%</span>
          <span className="text-xs">Uploading...</span>
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      )}

      {item.status === 'error' && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1.5 text-center text-xs text-white" role="alert">{item.error ?? 'Upload failed'}</div>
      )}

      {confirming && (
        <div role="alertdialog" aria-label="Confirm removing the photo" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 p-2 text-center">
          <p className="text-sm font-semibold text-navy-900">Remove this photo?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onKeep}>Keep</Button>
            <Button size="sm" variant="danger" onClick={onConfirm}>Remove</Button>
          </div>
        </div>
      )}
    </div>
  )
}

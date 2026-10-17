import { useState } from 'react'
import useApi from '../hooks/useApi.js'
import { deleteReturnImage, listReturnImages, MAX_PHOTOS, photoProblem, uploadReturnImage } from '../services/returnImageService.js'
import { ErrorState, LoadingState } from './ApiState.jsx'
import PhotoSlots from './PhotoSlots.jsx'
import PhotosCard from './PhotosCard.jsx'

// Photos of an existing return (Return Details). Everything goes through the API: list, upload (with progress),
// view, delete. `editable` mirrors the backend rule (photos can change only until the item is collected).
export default function ReturnPhotos({ returnId, editable }) {
  const saved = useApi((signal) => listReturnImages(returnId, { signal }), [returnId])
  const [added, setAdded] = useState([]) // stored in this session
  const [removed, setRemoved] = useState([]) // ids deleted in this session
  const [uploading, setUploading] = useState(null) // { key, src, progress, controller }
  const [notice, setNotice] = useState(null)

  if (saved.loading) return <PhotosCard count={0}><LoadingState label="Loading photos..." /></PhotosCard>
  if (saved.error) return <PhotosCard count={0}><ErrorState error={saved.error} onRetry={saved.reload} /></PhotosCard>

  const stored = [...saved.data, ...added].filter((i) => !removed.includes(i.id)).map((i) => ({ key: `img-${i.id}`, imageId: i.id, returnId, status: 'saved' }))
  const items = uploading ? [...stored, { key: uploading.key, src: uploading.src, status: 'uploading', progress: uploading.progress }] : stored
  if (!editable && stored.length === 0) return null

  const pick = async (files) => {
    setNotice(null)
    const file = files[0]
    if (items.length >= MAX_PHOTOS) return setNotice({ tone: 'error', text: 'This return already has 2 photos. Remove one to add another.' })
    if (files.length > 1) setNotice({ tone: 'info', text: 'Only one photo is added at a time; using the first one.' })
    const problem = photoProblem(file)
    if (problem) return setNotice({ tone: 'error', text: problem })
    const controller = new AbortController()
    const src = URL.createObjectURL(file)
    setUploading({ key: `up-${Date.now()}`, src, progress: 0, controller })
    try {
      const image = await uploadReturnImage(returnId, file, { signal: controller.signal, onProgress: (p) => setUploading((u) => u && { ...u, progress: p }) })
      setAdded((a) => [...a, image])
      setNotice({ tone: 'success', text: 'Photo uploaded.' })
    } catch (err) {
      if (err.name !== 'AbortError') setNotice({ tone: 'error', text: err.message })
    } finally {
      URL.revokeObjectURL(src)
      setUploading(null)
    }
  }

  const remove = async (item) => {
    setNotice(null)
    try {
      await deleteReturnImage(returnId, item.imageId)
      setRemoved((r) => [...r, item.imageId])
      setNotice({ tone: 'success', text: 'Photo removed.' })
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    }
  }

  return (
    <PhotosCard
      count={items.length}
      notice={notice}
      intro={editable ? 'You can add or remove photos until the item is picked up.' : 'Photos you attached to this return.'}
    >
      <PhotoSlots items={items} onFiles={pick} onRemove={remove} onCancel={() => uploading?.controller.abort()} disabled={Boolean(uploading)} confirmRemove readOnly={!editable} />
    </PhotosCard>
  )
}

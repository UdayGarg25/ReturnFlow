import multer from 'multer'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Accepts exactly ONE file, in the form field "image", held in memory (at most 5 MB). multer enforces the size
// limit while streaming, so an oversized upload is cut off. What the file really is gets checked in the service.
const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }).single('image')

// Turns multer's errors into plain 400 answers (never a stack trace).
export function uploadSingleImage(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'The image is larger than 5 MB.' : 'Send exactly one image in the "image" field.'
      return res.status(400).json({ message })
    }
    return next(err)
  })
}

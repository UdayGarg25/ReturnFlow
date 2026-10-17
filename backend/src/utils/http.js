import { ServiceError } from './errors.js'

// ServiceError codes used by the business services, and the HTTP status each becomes.
export const ERROR_CODES = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR', // 400: the request body is wrong
  NOT_FOUND: 'NOT_FOUND', //         404: no such resource, OR it is not yours (never says which)
  FORBIDDEN: 'FORBIDDEN', //         403: it exists and is visible to you, but you may not act on it
  CONFLICT: 'CONFLICT', //           409: the resource is in a state that does not allow this
})

const STATUS = {
  [ERROR_CODES.VALIDATION]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.CONFLICT]: 409,
}

export const validationError = (message, fieldErrors) => new ServiceError(ERROR_CODES.VALIDATION, message, fieldErrors ? { fieldErrors } : undefined)
export const notFound = (what = 'Resource') => new ServiceError(ERROR_CODES.NOT_FOUND, `${what} not found.`)
export const forbidden = (message = 'Forbidden') => new ServiceError(ERROR_CODES.FORBIDDEN, message)
export const conflict = (message) => new ServiceError(ERROR_CODES.CONFLICT, message)

// Wraps a controller body: `fn(req)` resolves to { status?, body }. Known ServiceErrors
// become 400/403/404/409 with their short message; anything else (database down, a
// bug) goes to the global error handler, which answers a generic 500.
function fail(err, res, next) {
  const status = err instanceof ServiceError ? STATUS[err.code] : undefined
  if (!status) return next(err)
  return res.status(status).json({ message: err.message, ...(err.details?.fieldErrors && { errors: err.details.fieldErrors }) })
}

export const handle = (fn) => async (req, res, next) => {
  try {
    const { status = 200, body } = await fn(req)
    res.status(status).json(body)
  } catch (err) {
    fail(err, res, next)
  }
}

// Same error handling, but the answer is a file: `fn(req)` resolves to { headers, body: Buffer }.
export const handleFile = (fn) => async (req, res, next) => {
  try {
    const { headers, body } = await fn(req)
    res.set(headers).send(body)
  } catch (err) {
    fail(err, res, next)
  }
}

const PG_MAX_INT = 2147483647
// A URL id must be a plain positive integer that fits the INTEGER column. Anything
// else ("abc", "1; DROP...", 0, 1.5, huge) is simply "not found", never a database error.
export function parseId(value, what = 'Resource') {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > PG_MAX_INT) throw notFound(what)
  return Number(value)
}

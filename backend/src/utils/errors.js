// Expected, business-level failures thrown by services (bad input, duplicate
// email, wrong credentials...). `code` is a stable string a controller maps to
// an HTTP status; `details` can carry extra data such as per-field messages.
// Anything that is NOT a ServiceError is an unexpected bug or outage (e.g. the
// database is down) and should become a 500.
export class ServiceError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

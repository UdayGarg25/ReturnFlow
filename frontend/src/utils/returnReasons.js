// return_requests.reason values accepted by the API, and how they read to a person.
export const RETURN_REASONS = [
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong item' },
  { value: 'SIZE_ISSUE', label: 'Size issue' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'CHANGED_MIND', label: 'Changed my mind' },
  { value: 'OTHER', label: 'Other' },
]

export const reasonLabel = (value) => RETURN_REASONS.find((r) => r.value === value)?.label ?? value

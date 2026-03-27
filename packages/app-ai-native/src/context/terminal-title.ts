export function isDefaultTitle(title: string | undefined, titleNumber: number | undefined) {
  const normalized = title?.trim()
  if (!normalized) return false
  if (!Number.isFinite(titleNumber) || !titleNumber || titleNumber <= 0) return false
  return normalized === `Terminal ${titleNumber}`
}

export function formatDuration(value?: number | null, t: (key: string) => string = (k) => k) {
  if (value == null || value === 0) return "-"

  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes) || minutes <= 0) return "-"
  if (minutes < 60) return `${minutes}${t("kanban.duration.minutes")}`
  if (minutes <= 480) {
    const hour = Math.floor(minutes / 60)
    const remain = minutes % 60
    return remain === 0 ? `${hour}${t("kanban.duration.hour")}` : `${hour}${t("kanban.duration.hours")}${remain}${t("kanban.duration.minutes")}`
  }
  return `${(minutes / 480).toFixed(1)}${t("kanban.duration.manDays")}`
}

export function formatLocalTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  const second = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export function formatPercent(value?: number | null, digits = 0) {
  if (value == null) return "-"
  return `${value.toFixed(digits)}%`
}

export function shortId(value?: string | null, size = 8) {
  if (!value) return "-"
  return value.slice(0, size)
}

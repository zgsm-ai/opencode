const IMAGE_MIME_PREFIX = "image/"

export const ACCEPTED_FILE_TYPES = [IMAGE_MIME_PREFIX + "*"]

export async function attachmentMime(file: File) {
  const type = file.type?.trim()
  if (type.startsWith(IMAGE_MIME_PREFIX)) return type

  const lower = file.name.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  return undefined
}

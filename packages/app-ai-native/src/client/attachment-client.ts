import { DeviceHttpError } from "./device-transport"
import { getAuthHeaders } from "@/lib/auth-token"

export type UploadedAttachment = {
  id: string
  absPath: string
  filename: string
  mime: string
  size: number
  sha256: string
  expiresAt: string
}

type UploadOpts = {
  baseUrl: string
  directory?: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  onUnauthorized?: (path: string) => void
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
}

// uploadAttachment POSTs multipart/form-data to the cs-cloud v2 attachment
// endpoint. The shared device transport forces Content-Type: application/json,
// so attachments bypass it and call fetch directly with a FormData body.
// Contract: docs/attachment-contract-v2.md §I1 (path-as-contract).
export async function uploadAttachment(file: File | Blob, opts: UploadOpts): Promise<UploadedAttachment> {
  const fn = opts.fetch ?? globalThis.fetch
  const form = new FormData()
  const filename = (file as File).name ?? `upload-${Date.now()}`
  form.append("file", file, filename)

  // The zgsmAdminToken cookie is SameSite=Lax, so the browser does NOT send it
  // on cross-origin POSTs. Attach the token explicitly via Authorization, the
  // same as every other device client (device-transport / device-client /
  // cloud-terminal-api). See src/lib/auth-token.ts.
  const headers: Record<string, string> = { ...getAuthHeaders() }
  if (opts.directory) headers["X-Workspace-Directory"] = encodeURIComponent(opts.directory)

  const res = await fn(joinUrl(opts.baseUrl, "/api/v1/attachments"), {
    method: "POST",
    credentials: "include",
    headers,
    signal: opts.signal,
    body: form,
  })

  const rawText = await res.text().catch(() => "")
  let data: any
  try {
    data = rawText ? JSON.parse(rawText) : undefined
  } catch {
    data = undefined
  }

  if (!res.ok) {
    if (res.status === 401) opts.onUnauthorized?.("/api/v1/attachments")
    // 404 means the route isn't deployed on this server version. Callers
    // treat this as a hard "endpoint missing" signal and refuse to send
    // (rather than silently falling back to inline data URLs).
    if (res.status === 404) {
      throw new DeviceHttpError(
        "Attachment endpoint not deployed",
        404,
        "ENDPOINT_NOT_FOUND",
      )
    }
    let payload = data
    if (payload && typeof payload === "object" && "ok" in payload && "error" in payload) {
      payload = payload.error
    }
    if (payload && typeof payload === "object") {
      throw new DeviceHttpError(payload.message ?? payload.error ?? String(payload), res.status, payload.code ?? "UNKNOWN")
    }
    throw new DeviceHttpError(`Upload failed: ${res.status}`, res.status, "UNKNOWN")
  }

  let inner = data
  if (inner && typeof inner === "object" && "ok" in inner && "data" in inner && inner.data != null) {
    inner = inner.data
  }

  if (!inner || typeof inner !== "object" || !inner.abs_path) {
    throw new DeviceHttpError("Attachment response missing abs_path", res.status, "MALFORMED")
  }

  return {
    id: inner.id ?? "",
    absPath: inner.abs_path,
    filename: inner.filename ?? filename,
    mime: inner.mime ?? file.type ?? "application/octet-stream",
    size: Number(inner.size ?? 0),
    sha256: inner.sha256 ?? "",
    expiresAt: inner.expires_at ?? "",
  }
}

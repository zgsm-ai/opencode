import { createContext, useContext } from "solid-js"

// Resolves an attachment URL to a URL the browser can render. Consumers that
// render attachment images behind auth register a resolver here; the message
// stream then fetches the bytes with the user's credentials and renders the
// result (a blob: object URL) instead of pointing <img> at the raw URL.
//
// Why this exists: the session cookie (zgsmAdminToken) is SameSite=Lax, so a
// cross-origin (cross-cluster) device-proxy URL gets no cookie on a browser-
// native <img> fetch, and <img> cannot carry an Authorization header either.
// The resolver side-steps <img> by using fetch() — which CAN set headers —
// and handing back a same-origin blob: object URL.
//
// Contract: return any renderable URL. Returning the input unchanged renders
// it directly (no authenticated fetch); returning a blob: object URL renders
// fetched bytes (the caller revokes it on cleanup).
export type AttachmentUrlResolver = (url: string) => Promise<string>

const ctx = createContext<AttachmentUrlResolver>()

export const AttachmentLoaderProvider = ctx.Provider

// Optional by design: returns undefined when no resolver is registered, so
// callers fall back to a plain <img src={url}>.
export function useAttachmentUrlResolver(): AttachmentUrlResolver | undefined {
  return useContext(ctx)
}

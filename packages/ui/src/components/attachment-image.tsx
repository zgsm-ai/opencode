import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js"
import { useAttachmentUrlResolver } from "../context/attachment-loader"

export type AttachmentImageProps = {
  url: string
  alt?: string
  class?: string
  "data-slot"?: string
  onClick?: JSX.EventHandlerUnion<HTMLImageElement, MouseEvent>
  onLoad?: JSX.EventHandlerUnion<HTMLImageElement, Event>
}

// Renders an attachment image. When an AttachmentUrlResolver is registered
// and the url is http(s), the url is resolved first — typically an
// authenticated fetch producing a blob: object URL — so cross-origin
// device-proxy images still render. A bare <img> can't fetch those: it can't
// send an Authorization header, and the SameSite=Lax session cookie is
// withheld cross-origin. Without a resolver (or a non-http url such as a
// data: URI) it renders the url directly, matching the previous behaviour.
export function AttachmentImage(props: AttachmentImageProps) {
  const resolver = useAttachmentUrlResolver()
  const [src, setSrc] = createSignal<string>()

  createEffect(() => {
    const url = props.url
    const resolve = resolver

    if (!resolve || !/^https?:\/\//.test(url)) {
      setSrc(url)
      return
    }

    let objectUrl: string | undefined
    let cancelled = false
    setSrc(undefined)

    Promise.resolve()
      .then(() => resolve(url))
      .then((resolved) => {
        if (cancelled) {
          if (resolved.startsWith("blob:")) URL.revokeObjectURL(resolved)
          return
        }
        objectUrl = resolved
        setSrc(resolved)
      })
      .catch(() => {
        // Resolution failed (e.g. still 401): fall back to rendering the url
        // directly so the browser shows its standard broken-image affordance
        // (and same-origin urls that never needed auth still load).
        if (!cancelled) setSrc(url)
      })

    onCleanup(() => {
      cancelled = true
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl)
    })
  })

  return (
    <Show when={src()}>
      {(value) => (
        <img
          src={value()}
          alt={props.alt}
          class={props.class}
          data-slot={props["data-slot"]}
          onClick={props.onClick}
          onLoad={props.onLoad}
        />
      )}
    </Show>
  )
}

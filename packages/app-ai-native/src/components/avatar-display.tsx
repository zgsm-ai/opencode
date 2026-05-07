import { createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

type AvatarDisplayProps = {
  avatarUrl?: string | null
  username?: string | null
  title?: string
  size?: number | string
  radius?: number | string
  class?: string
  imgClass?: string
  fallbackClass?: string
}

export default function AvatarDisplay(props: AvatarDisplayProps): JSX.Element {
  const [imageFailed, setImageFailed] = createSignal(false)
  const normalizedUrl = createMemo(() => props.avatarUrl?.trim() || "")
  const alt = createMemo(() => props.username?.trim() || "User avatar")
  const showImage = createMemo(() => !!normalizedUrl() && !imageFailed())

  createEffect(() => {
    normalizedUrl()
    setImageFailed(false)
  })

  const sizeValue = createMemo(() => {
    const value = props.size ?? 24
    return typeof value === "number" ? `${value}px` : value
  })
  const radiusValue = createMemo(() => {
    const value = props.radius ?? "9999px"
    return typeof value === "number" ? `${value}px` : value
  })
  const boxStyle = createMemo(() => ({
    width: sizeValue(),
    height: sizeValue(),
    "border-radius": radiusValue(),
  }))

  return showImage()
    ? (
        <img
          src={normalizedUrl()}
          alt={alt()}
          title={props.title}
          class={cn("rounded-full object-cover", props.class, props.imgClass)}
          style={boxStyle()}
          onError={() => setImageFailed(true)}
        />
      )
    : (
        <div
          class={cn(
            "relative flex items-center justify-center overflow-hidden rounded-full border border-[color:color-mix(in_oklab,var(--native-border)_60%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-surface)_92%,var(--native-panel)),color-mix(in_oklab,var(--native-surface)_78%,var(--native-panel)))] text-[var(--native-muted)]",
            props.class,
            props.fallbackClass,
          )}
          style={boxStyle()}
          aria-label={alt()}
          title={props.title}
        >
          <div class="absolute top-[22%] h-[30%] w-[30%] rounded-full bg-[color:color-mix(in_oklab,var(--native-muted)_55%,white_45%)]" />
          <div class="absolute bottom-[-8%] h-[42%] w-[68%] rounded-t-[9999px] bg-[color:color-mix(in_oklab,var(--native-muted)_55%,white_45%)]" />
        </div>
      )
}

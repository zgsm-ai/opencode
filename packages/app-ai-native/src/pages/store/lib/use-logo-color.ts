import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"

// Cache extracted colors per logo source so repeated cards sharing one logo extract only once.
const LOGO_COLOR_CACHE = new Map<string, string>()
const DEFAULT_FALLBACK = "var(--native-primary)"

/**
 * Extract a representative theme color from a logo image (base64 data URI or same-origin URL)
 * using a downsampled canvas, returning an accessor to the resolved color.
 *
 * Behavior:
 * - Returns the `fallback` (default `var(--native-primary)`) until extraction completes, and on
 *   any failure (no logo, SSR/no document, image/canvas error, all-transparent image).
 * - Caches by logo string; cache hits resolve synchronously.
 * - Picks the most frequent non-white / non-near-black / non-transparent quantized color.
 */
export function useLogoColor(logo: Accessor<string | undefined>, fallback?: string): Accessor<string> {
  const fallbackColor = fallback ?? DEFAULT_FALLBACK
  const [color, setColor] = createSignal(fallbackColor)

  createEffect(() => {
    const src = logo()
    if (!src) {
      setColor(fallbackColor)
      return
    }

    const cached = LOGO_COLOR_CACHE.get(src)
    if (cached) {
      setColor(cached)
      return
    }

    // SSR / non-browser guard.
    if (typeof document === "undefined" || typeof Image === "undefined") {
      setColor(fallbackColor)
      return
    }

    setColor(fallbackColor)
    let disposed = false

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (disposed) return
      const extracted = extractDominantColor(img)
      const resolved = extracted ?? fallbackColor
      if (extracted) LOGO_COLOR_CACHE.set(src, extracted)
      setColor(resolved)
    }
    img.onerror = () => {
      if (disposed) return
      setColor(fallbackColor)
    }
    img.src = src

    // Solid's createEffect does NOT treat a returned function as a disposer (that value becomes the
    // effect's previous-value arg). Register the guard via onCleanup so a still-loading image whose
    // row unmounts (filter/page/refresh) doesn't setColor on a disposed owner.
    onCleanup(() => {
      disposed = true
    })
  })

  return color
}

const SAMPLE_SIZE = 32

/** Draw the image downsampled and return the most frequent meaningful color as `#rrggbb`, or null. */
function extractDominantColor(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    const counts = new Map<string, { count: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!

      if (a < 128) continue // skip transparent
      if (r > 240 && g > 240 && b > 240) continue // skip near-white
      if (r < 24 && g < 24 && b < 24) continue // skip near-black

      // Quantize to 5-bit buckets to merge similar shades.
      const key = `${r >> 3}-${g >> 3}-${b >> 3}`
      const entry = counts.get(key)
      if (entry) {
        entry.count += 1
        entry.r += r
        entry.g += g
        entry.b += b
      } else {
        counts.set(key, { count: 1, r, g, b })
      }
    }

    let best: { count: number; r: number; g: number; b: number } | undefined
    for (const entry of counts.values()) {
      if (!best || entry.count > best.count) best = entry
    }
    if (!best) return null

    const r = Math.round(best.r / best.count)
    const g = Math.round(best.g / best.count)
    const b = Math.round(best.b / best.count)
    return toHex(r, g, b)
  } catch {
    // Canvas may be tainted (cross-origin) or unavailable — fall back.
    return null
  }
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

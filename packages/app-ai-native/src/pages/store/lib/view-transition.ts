// View Transitions helpers for the store list (card ⇄ list switch + filter changes).
//
// SolidJS renders synchronously with no async queue, so calling `setSignal(...)` inside the
// `startViewTransition` callback mutates the DOM within the capture window — no `flushSync`
// equivalent is needed. When the browser lacks the API (Safari < 18 / older Firefox), we just
// run the update directly (progressive enhancement).

const STAGGER_STYLE_ID = "store-vt-stagger"
const STAGGER_STEP_MS = 22

type ViewTransition = { finished?: Promise<unknown> }
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition
}

/**
 * Run `update` inside a view transition when supported, otherwise run it directly.
 * `update` should perform the synchronous Solid signal writes that mutate the DOM.
 *
 * PERF: once the transition settles we clear the per-item stagger `<style>` (see applyStagger).
 * The injected `animation-delay` rules are only meaningful during this transition; leaving them
 * resident would (a) keep up to PAGE_SIZE stale rules in <head> and (b) risk delaying an unrelated
 * later transition that didn't call applyStagger. Clearing after `finished` can't affect the
 * already-completed animation.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === "undefined") {
    update()
    return
  }
  const doc = document as DocumentWithViewTransition
  if (typeof doc.startViewTransition !== "function") {
    // No View Transitions API (Safari < 18 / older Firefox): run synchronously, then clear the
    // injected stagger `<style>` ourselves. The `finished` promise path below never runs here
    // (transition is undefined), so without this the per-item `animation-delay` rules from the
    // caller's applyStagger() would linger in <head> on every view switch (same-id overwrite, so
    // bounded but never cleaned). The fallback has no transition for the delays to affect anyway.
    update()
    applyStagger([])
    return
  }
  const transition = doc.startViewTransition(() => update())
  transition?.finished?.then?.(() => applyStagger([])).catch(() => applyStagger([]))
}

/**
 * Inject per-item `::view-transition-group` `animation-delay` rules so visible items animate in a
 * staggered sequence (i * 22ms by document order). Each id gets its item / media / name groups
 * delayed together. Passing an empty array clears the injected `<style>`.
 */
export function applyStagger(ids: string[]): void {
  if (typeof document === "undefined") return

  let style = document.getElementById(STAGGER_STYLE_ID) as HTMLStyleElement | null
  if (ids.length === 0) {
    if (style) style.textContent = ""
    return
  }

  if (!style) {
    style = document.createElement("style")
    style.id = STAGGER_STYLE_ID
    document.head.appendChild(style)
  }

  style.textContent = ids
    .map((id, index) => {
      const delay = index * STAGGER_STEP_MS
      return [
        `::view-transition-group(vt-item-${id})`,
        `::view-transition-group(vt-media-${id})`,
        `::view-transition-group(vt-name-${id})`,
      ].join(",") + `{animation-delay:${delay}ms}`
    })
    .join("")
}

import { createEffect, createSignal, on, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { formatCompact } from "./store-capability-table"
import { StoreIcon } from "../lib/store-icons"
import type { CapabilityItem } from "../lib/api"

/** Per-user subscription invoke mode for skill-family items. */
export type InvokeMode = "auto" | "manual"

export interface SubscribeModeLabels {
  /** Tooltip on the dropdown caret. */
  menuTooltip: string
  /** Subscribe-time choices (shown when not yet subscribed). */
  subscribeAuto: string
  subscribeAutoDesc: string
  subscribeManual: string
  subscribeManualDesc: string
  /** Group label showing the active mode when subscribed, e.g. "当前：AI 自动调用". */
  currentAuto: string
  currentManual: string
  /** Switch actions (shown when already subscribed). */
  switchToAuto: string
  switchToManual: string
}

// Does the user prefer reduced motion? Read once per render so the width FLIP and the label
// cross-fade both honor it (CSS already strips the bell/ping/transition keyframes separately).
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export interface SubscribeButtonProps {
  item: CapabilityItem
  favorited: boolean
  favoriteCount: number
  /** True while the parent has an in-flight favorite toggle for this item (favoriteActionItemId === item.id). */
  pending?: boolean
  authenticated: boolean
  /** True when subscribing is blocked (parent passes mcpListSubscribeBlocked(item)). */
  disabled?: boolean
  /**
   * onToggle is called with an optional invokeMode. When undefined (non-skill items, or
   * unsubscribe), the backend keeps its default ("auto"). Skill-family subscribe actions
   * pass "auto" / "manual" explicitly.
   */
  onToggle: (item: CapabilityItem, invokeMode?: InvokeMode) => void
  labels: { subscribe: string; subscribed: string; tooltip: string }
  /** Enables the "订阅即选" split dropdown (skill-family items only). */
  invokeModeEnabled?: boolean
  /** The user's current subscription mode; null/undefined when not subscribed. */
  currentMode?: InvokeMode | null
  modeLabels?: SubscribeModeLabels
}

/**
 * Single-button subscribe control (订阅即分发). A pill with a bell icon, a label
 * (订阅 / 已订阅) and a compact count. Clicking fires `onToggle(item)` and triggers a
 * one-shot bell ring + a ping halo. The animation classes (`animate-bell-once`,
 * `animate-store-ping`) live in native-theme.css; we add them on click and strip them on
 * `animationend` so they can re-fire on the next click.
 */
export function SubscribeButton(props: SubscribeButtonProps): JSX.Element {
  // Transient animation state: re-armable by toggling the class off after each run.
  const [animating, setAnimating] = createSignal(false)
  let animationTimer: ReturnType<typeof setTimeout> | undefined
  let buttonRef: HTMLButtonElement | undefined
  let widthAnimation: Animation | undefined

  onCleanup(() => {
    clearTimeout(animationTimer)
    widthAnimation?.cancel()
  })

  // ─── Natural-width FLIP (research §方案 A) ─────────────────────────────────────────────────
  // The button width is `auto` (inline-flex, content-driven): "订阅"(2 chars) is narrower than
  // "已订阅"(3 chars), so the pill is intentionally NOT a fixed width — it grows/shrinks with the
  // single label that renders straight off `props.favorited`. `width:auto` can't be
  // CSS-transitioned, so on each favorited flip we FLIP it via the Web Animations API.
  //
  // Why the previous attempt failed (and this one works):
  //  • Solid renders synchronously: when `favorited` flips, the new label is committed to the DOM
  //    *before* any effect runs, so an effect that measures the button reads the NEW width — never
  //    the OLD one. FLIP needs the OLD (First) width, so we cache it ACROSS runs: onMount seeds
  //    `prevWidth` with the initial render width, and each run stores the just-measured width as
  //    the prev for the next flip.
  //  • The old effect used bare `void props.favorited` tracking, so it also re-ran on unrelated
  //    re-renders and on first mount — clobbering `prevWidth` so `from ≈ to` and nothing animated.
  //    Here `on(() => props.favorited, …, { defer: true })` isolates the dependency to ONLY the
  //    favorited flip and skips the initial run, so prev(old) ≠ new every time it fires.
  // WAAPI animates width without `fill`, so when the run ends the inline width clears and the
  // button settles back to natural `auto` width, reflowing with layout afterwards.
  let prevWidth = 0
  onMount(() => {
    prevWidth = buttonRef?.getBoundingClientRect().width ?? 0
  })
  createEffect(
    on(
      () => props.favorited,
      () => {
        const button = buttonRef
        if (!button) return

        // Cancel any in-flight FLIP BEFORE measuring. On rapid re-clicks the previous WAAPI width
        // animation is still interpolating between two pixel widths, so getBoundingClientRect()
        // would read a mid-animation width and stash it as prevWidth → next FLIP starts from a
        // drifted origin and visibly jumps. cancel() has no `fill`, so it immediately clears the
        // inline width back to auto, making the measurement the correct target (auto) width.
        widthAnimation?.cancel()
        const newWidth = button.getBoundingClientRect().width // Last: effect runs post-commit
        if (!prefersReducedMotion() && prevWidth && Math.abs(prevWidth - newWidth) > 0.5) {
          widthAnimation = button.animate(
            [{ width: `${prevWidth}px` }, { width: `${newWidth}px` }],
            { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }, // no fill → settles to auto
          )
          widthAnimation.onfinish = () => (widthAnimation = undefined)
          widthAnimation.oncancel = () => (widthAnimation = undefined)
        }
        prevWidth = newWidth
      },
      { defer: true },
    ),
  )

  // The control is interactive only when authenticated, not blocked, and not mid-flight.
  const interactive = () => props.authenticated && !props.disabled && !props.pending

  // Replay the bell ring + ping halo on every click, even mid-flight. Strip the classes (and
  // unmount the ping node) → force a synchronous reflow so the browser flushes the removed
  // animation → re-add on the next frame so both keyframes restart from 0% together.
  const triggerAnimation = () => {
    setAnimating(false)
    clearTimeout(animationTimer)
    // Force reflow so the just-removed animation is committed before we re-add it next frame.
    void buttonRef?.offsetWidth
    requestAnimationFrame(() => {
      setAnimating(true)
      // Fallback removal in case animationend doesn't fire (e.g. reduced-motion / display swap).
      animationTimer = setTimeout(() => setAnimating(false), 700)
    })
  }

  // Main pill: subscribing defaults to "auto" for skill-family (the recommended mode);
  // unsubscribing carries no mode. Non-skill items pass undefined (backend default).
  const primaryMode = (): InvokeMode | undefined =>
    props.favorited ? undefined : props.invokeModeEnabled ? "auto" : undefined

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation()
    if (!interactive()) return
    triggerAnimation()
    props.onToggle(props.item, primaryMode())
  }

  // Selecting a mode from the dropdown both subscribes (when not yet) and switches mode
  // (when already subscribed) — the backend favorite endpoint upserts the mode either way.
  const selectMode = (mode: InvokeMode) => {
    if (!interactive()) return
    if (!props.favorited) triggerAnimation()
    props.onToggle(props.item, mode)
  }

  const pill = (
    <Tooltip value={props.labels.tooltip} placement="top">
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={props.favorited}
        disabled={!interactive()}
        onClick={handleClick}
        class={cn(
          // .sbtn — height 32, pill (radius-full), 1px border, gap 7px, pad 0 13px, 12.5px/800.
          // Transition matches the design mock 1:1 via a single full `transition` shorthand
          // (one arbitrary value, underscores = spaces): color/bg/border cross-fade over
          // .25s var(--ease) so off↔on glides instead of snapping, while transform (the active
          // press) gets a quick .12s var(--spring) recoil — per-property durations/easings that
          // a Tailwind shorthand `transition-[props]` (single shared duration) can't express.
          // The `store-subscribe-btn` hook lets native-theme.css strip these transitions under
          // prefers-reduced-motion (alongside the bell-ring / ping keyframes).
          // overflow-hidden + whitespace-nowrap: while the WAAPI width FLIP plays, the label that's
          // wider than the animating width is clipped (not wrapped/overflowing), so the new text is
          // revealed/concealed gradually for a natural expand/collapse feel.
          "store-subscribe-btn relative inline-flex h-8 cursor-pointer items-center gap-[7px] overflow-hidden whitespace-nowrap rounded-[var(--native-radius-full)] border px-[13px] text-[12.5px] font-extrabold",
          "[transition:background-color_0.25s_cubic-bezier(0.22,1,0.36,1),color_0.25s_cubic-bezier(0.22,1,0.36,1),border-color_0.25s_cubic-bezier(0.22,1,0.36,1),transform_0.12s_cubic-bezier(0.34,1.56,0.64,1)]",
          "active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]",
          props.favorited
            ? // .sbtn.on — bg=--primary-bg (primary 15% over transparent), border=primary 45%, text=primary
              "border-[color:color-mix(in_oklab,var(--native-primary)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_15%,transparent)] text-[var(--native-primary)]"
            : // .sbtn — glass pill: --pill-bg (light #0000000a≈4% / dark #ffffff0d≈5%) and
              // --pill-border (light #0000001a≈10% / dark #ffffff1f≈12%). Tracked off the
              // theme foreground so a single value works in both schemes; hover→fg-weak border.
              "border-[color:color-mix(in_oklab,var(--native-foreground)_11%,transparent)] bg-[color:color-mix(in_oklab,var(--native-foreground)_4%,transparent)] text-[var(--native-foreground)] hover:border-[var(--native-dim)]",
        )}
      >
        {/* .ping — concentric ring (left 13, 18×18, 2px primary) that expands & fades on click */}
        <Show when={animating()}>
          <span
            aria-hidden="true"
            class="animate-store-ping pointer-events-none absolute left-[13px] top-1/2 size-[18px] -translate-x-[2px] -translate-y-1/2 rounded-[var(--native-radius-full)] border-2 border-[var(--native-primary)]"
            onAnimationEnd={() => setAnimating(false)}
          />
        </Show>
        {/* .bell — size 14, rings once on click. Two bells are stacked (stroke + filled) and
            cross-faded via opacity so the subscribe ⇄ unsubscribe state change is smooth instead
            of a hard SVG structure swap (stroke→fill flips fill/stroke/stroke-width all at once,
            which flickers). The filled bell fades in (and the stroke fades out) when subscribed.
            The wrapper carries the spring transform transition + one-shot ring keyframe. */}
        <span
          class={cn(
            "relative inline-flex size-[14px] shrink-0 transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            animating() && "animate-bell-once",
          )}
        >
          <StoreIcon
            name="bell"
            size={14}
            filled={false}
            class={cn(
              "absolute inset-0 transition-opacity duration-[250ms] ease-out",
              props.favorited ? "opacity-0" : "opacity-100",
            )}
            style={{ color: "currentColor" }}
          />
          <StoreIcon
            name="bell"
            size={14}
            filled={true}
            class={cn(
              "absolute inset-0 transition-opacity duration-[250ms] ease-out",
              props.favorited ? "opacity-100" : "opacity-0",
            )}
            style={{ color: "currentColor" }}
          />
        </span>
        {/* .lab — single natural-width label rendered straight off `props.favorited` (订阅=2 chars
            / 已订阅=3 chars). No fixed slot, no two-label overlay padding the width — the label's
            own intrinsic width drives the pill's content width, and the FLIP effect above animates
            the resulting width change between the two states (which is exactly what the previous
            stacked-overlay version suppressed by forcing a single max width). */}
        <span class="inline-flex shrink-0 items-center justify-center whitespace-nowrap">
          {props.favorited ? props.labels.subscribed : props.labels.subscribe}
        </span>
        {/* .cnt — tabular-nums (fixed-width digits so the count never reflows the button), weight
            700, muted → primary-tinted when subscribed. Owns its own color transition because the
            explicit text-[...] color overrides the button's inherited color animation. */}
        <span
          class={cn(
            "font-bold [font-variant-numeric:tabular-nums] transition-colors duration-[250ms] ease-out",
            props.favorited
              ? "text-[color:color-mix(in_oklab,var(--native-primary)_80%,var(--native-foreground))]"
              : "text-[var(--native-muted)]",
          )}
        >
          {formatCompact(props.favoriteCount)}
        </span>
      </button>
    </Tooltip>
  )

  // Non-skill items keep the original single-button control.
  if (!props.invokeModeEnabled || !props.modeLabels) return pill

  const ml = () => props.modeLabels as SubscribeModeLabels

  return (
    <span class="inline-flex items-center gap-1">
      {pill}
      <DropdownMenu placement="bottom-end">
        <Tooltip value={ml().menuTooltip} placement="top">
          <DropdownMenu.Trigger
            type="button"
            disabled={!interactive()}
            onClick={(e: MouseEvent) => e.stopPropagation()}
            aria-label={ml().menuTooltip}
            class={cn(
              "store-subscribe-btn inline-flex h-8 w-7 cursor-pointer items-center justify-center rounded-[var(--native-radius-full)] border text-[var(--native-foreground)]",
              "[transition:background-color_0.25s_cubic-bezier(0.22,1,0.36,1),border-color_0.25s_cubic-bezier(0.22,1,0.36,1),transform_0.12s_cubic-bezier(0.34,1.56,0.64,1)]",
              "active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]",
              props.favorited
                ? "border-[color:color-mix(in_oklab,var(--native-primary)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_15%,transparent)] text-[var(--native-primary)]"
                : "border-[color:color-mix(in_oklab,var(--native-foreground)_11%,transparent)] bg-[color:color-mix(in_oklab,var(--native-foreground)_4%,transparent)] hover:border-[var(--native-dim)]",
            )}
          >
            <StoreIcon name="caret" size={13} />
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="min-w-[260px]">
            <Show
              when={props.favorited}
              fallback={
                <>
                  <DropdownMenu.Item onSelect={() => selectMode("auto")}>
                    <DropdownMenu.ItemLabel>{ml().subscribeAuto}</DropdownMenu.ItemLabel>
                    <DropdownMenu.ItemDescription>{ml().subscribeAutoDesc}</DropdownMenu.ItemDescription>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => selectMode("manual")}>
                    <DropdownMenu.ItemLabel>{ml().subscribeManual}</DropdownMenu.ItemLabel>
                    <DropdownMenu.ItemDescription>{ml().subscribeManualDesc}</DropdownMenu.ItemDescription>
                  </DropdownMenu.Item>
                </>
              }
            >
              {/* GroupLabel requires an enclosing Group (Kobalte throws otherwise). */}
              <DropdownMenu.Group>
                <DropdownMenu.GroupLabel>
                  {props.currentMode === "manual" ? ml().currentManual : ml().currentAuto}
                </DropdownMenu.GroupLabel>
                <DropdownMenu.Separator />
                <Show
                  when={props.currentMode === "manual"}
                  fallback={
                    <DropdownMenu.Item onSelect={() => selectMode("manual")}>
                      <DropdownMenu.ItemLabel>{ml().switchToManual}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  }
                >
                  <DropdownMenu.Item onSelect={() => selectMode("auto")}>
                    <DropdownMenu.ItemLabel>{ml().switchToAuto}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </Show>
              </DropdownMenu.Group>
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </span>
  )
}

export default SubscribeButton

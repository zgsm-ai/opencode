import { createEffect, createMemo, For, Match, on, onCleanup, Show, Switch, type JSX } from "solid-js"
import { animate, type AnimationPlaybackControls } from "motion"
import { useI18n } from "../context/i18n"
import { createStore } from "solid-js/store"
import { Collapsible } from "./collapsible"
import { Icon, type IconProps } from "./icon"
import { TextShimmer } from "./text-shimmer"

export type TriggerTitle = {
  title: string
  titleClass?: string
  subtitle?: string
  subtitleClass?: string
  args?: string[]
  argsClass?: string
  action?: JSX.Element
}

const isTriggerTitle = (val: any): val is TriggerTitle => {
  return (
    typeof val === "object" && val !== null && "title" in val && (typeof Node === "undefined" || !(val instanceof Node))
  )
}

export interface BasicToolProps {
  icon: IconProps["name"]
  trigger: TriggerTitle | JSX.Element
  children?: JSX.Element
  status?: string
  hideDetails?: boolean
  defaultOpen?: boolean
  forceOpen?: boolean
  defer?: boolean
  locked?: boolean
  animated?: boolean
  onSubtitleClick?: () => void
}

const SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0 }

export function BasicTool(props: BasicToolProps) {
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    ready: props.defaultOpen ?? false,
  })
  const open = () => state.open
  const ready = () => state.ready
  const pending = () => props.status === "pending" || props.status === "running"

  let frame: number | undefined

  const cancel = () => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
    frame = undefined
  }

  onCleanup(cancel)

  createEffect(() => {
    if (props.forceOpen) setState("open", true)
  })

  createEffect(
    on(
      open,
      (value) => {
        if (!props.defer) return
        if (!value) {
          cancel()
          setState("ready", false)
          return
        }

        cancel()
        frame = requestAnimationFrame(() => {
          frame = undefined
          if (!open()) return
          setState("ready", true)
        })
      },
      { defer: true },
    ),
  )

  // Animated height for collapsible open/close
  let contentRef: HTMLDivElement | undefined
  let heightAnim: AnimationPlaybackControls | undefined
  const initialOpen = open()

  createEffect(
    on(
      open,
      (isOpen) => {
        if (!props.animated || !contentRef) return
        heightAnim?.stop()
        if (isOpen) {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "auto" }, SPRING)
          heightAnim.finished.then(() => {
            if (!contentRef || !open()) return
            contentRef.style.overflow = "visible"
            contentRef.style.height = "auto"
          })
        } else {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "0px" }, SPRING)
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    heightAnim?.stop()
  })

  const handleOpenChange = (value: boolean) => {
    if (pending()) return
    if (props.locked && !value) return
    setState("open", value)
  }

  return (
    <Collapsible open={open()} onOpenChange={handleOpenChange} class="tool-collapsible">
      <Collapsible.Trigger>
        <div data-component="tool-trigger">
          <div data-slot="basic-tool-tool-trigger-content">
            <Show when={props.icon}>
              <span data-slot="basic-tool-tool-indicator" data-status={props.status === "error" ? "error" : undefined}>
                <Icon name={props.status === "error" ? "circle-x" : props.icon!} size="small" />
              </span>
            </Show>
            <div data-slot="basic-tool-tool-info">
              <Switch>
                <Match when={isTriggerTitle(props.trigger) && props.trigger}>
                  {(trigger) => (
                    <div data-slot="basic-tool-tool-info-structured">
                      <div data-slot="basic-tool-tool-info-main">
                        <span
                          data-slot="basic-tool-tool-title"
                          classList={{
                            [trigger().titleClass ?? ""]: !!trigger().titleClass,
                          }}
                        >
                          <TextShimmer text={trigger().title} active={pending()} />
                        </span>
                        <Show when={!pending()}>
                          <Show when={trigger().subtitle}>
                            <span
                              data-slot="basic-tool-tool-subtitle"
                              classList={{
                                [trigger().subtitleClass ?? ""]: !!trigger().subtitleClass,
                                clickable: !!props.onSubtitleClick,
                              }}
                              onClick={(e) => {
                                if (props.onSubtitleClick) {
                                  e.stopPropagation()
                                  props.onSubtitleClick()
                                }
                              }}
                            >
                              {trigger().subtitle}
                            </span>
                          </Show>
                          <Show when={trigger().args?.length}>
                            <For each={trigger().args}>
                              {(arg) => (
                                <span
                                  data-slot="basic-tool-tool-arg"
                                  classList={{
                                    [trigger().argsClass ?? ""]: !!trigger().argsClass,
                                  }}
                                >
                                  {arg}
                                </span>
                              )}
                            </For>
                          </Show>
                        </Show>
                      </div>
                      <Show when={!pending() && trigger().action}>
                        <span data-slot="basic-tool-tool-action">{trigger().action}</span>
                      </Show>
                    </div>
                  )}
                </Match>
                <Match when={true}>{props.trigger as JSX.Element}</Match>
              </Switch>
            </div>
          </div>
          <Show when={props.children && !props.hideDetails && !props.locked && !pending()}>
            <Collapsible.Arrow />
          </Show>
        </div>
      </Collapsible.Trigger>
      <Show when={props.animated && props.children && !props.hideDetails}>
        <div
          ref={contentRef}
          data-slot="collapsible-content"
          data-animated
          style={{
            height: initialOpen ? "auto" : "0px",
            overflow: initialOpen ? "visible" : "hidden",
          }}
        >
          {props.children}
        </div>
      </Show>
      <Show when={!props.animated && props.children && !props.hideDetails}>
        <Collapsible.Content>
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </Collapsible.Content>
      </Show>
    </Collapsible>
  )
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value, null, 2)
}

export function GenericTool(props: {
  tool: string
  status?: string
  hideDetails?: boolean
  defaultOpen?: boolean
  input?: Record<string, unknown>
  output?: string
  metadata?: Record<string, unknown>
}) {
  const i18n = useI18n()
  const pending = () => props.status === "pending" || props.status === "running"

  const filtered = createMemo(() => {
    const meta = props.metadata
    if (meta && typeof meta === "object" && "_filtered" in meta) {
      return meta._filtered as {
        strategy?: string
        reason?: string
        toolName?: string
        originalSize?: number
      }
    }
    return null
  })

  const title = () =>
    props.tool
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())

  const entries = createMemo(() => {
    if (!props.input) return []
    return Object.entries(props.input).filter(([, v]) => v !== undefined && v !== null)
  })

  const trigger = () => (
    <div data-slot="basic-tool-tool-info-structured">
      <div data-slot="basic-tool-tool-info-main">
        <span data-slot="basic-tool-tool-title">
          <TextShimmer text={title()} active={pending()} />
        </span>
      </div>
    </div>
  )

  return (
    <BasicTool
      icon="mcp"
      status={props.status}
      trigger={trigger()}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    >
      <Show when={filtered()} keyed>
        {(f) => (
          <div data-component="tool-filtered-output">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>{i18n.t("ui.messagePart.toolFiltered.label")}</span>
            <Show when={f.originalSize}>
              <span data-slot="tool-filtered-size">{i18n.t("ui.messagePart.toolFiltered.originalSize", { size: f.originalSize! })}</span>
            </Show>
          </div>
        )}
      </Show>
      <Show when={!filtered()}>
        <Show when={entries().length > 0}>
          <div data-component="generic-tool-input">
            <For each={entries()}>
              {([key, value]) => (
                <div data-slot="generic-tool-input-entry">
                  <span data-slot="generic-tool-input-key">{key}</span>
                  <pre data-slot="generic-tool-input-value">{formatValue(value)}</pre>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.output}>
          <div data-component="tool-output" data-scrollable>
            <pre data-slot="generic-tool-output-value">{props.output}</pre>
          </div>
        </Show>
      </Show>
    </BasicTool>
  )
}

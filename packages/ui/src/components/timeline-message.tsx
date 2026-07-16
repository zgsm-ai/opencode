import { AssistantMessage, type FileDiff, Message as MessageType, Part as PartType } from "@opencode-ai/sdk/v2/client"
import type { SessionStatus } from "@opencode-ai/sdk/v2"
import { useData } from "../context"
import { useFileComponent } from "../context/file"
import { createEffect, createMemo, For, on, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { AssistantParts, Message, MessageDivider, type UserActions } from "./message-part"
import { Card } from "./card"
import { Accordion } from "./accordion"
import { StickyAccordionHeader } from "./sticky-accordion-header"
import { Collapsible } from "./collapsible"
import { DiffChanges } from "./diff-changes"
import { Icon } from "./icon"
import { TextShimmer } from "./text-shimmer"
import { SessionRetry } from "./session-retry"
import { TextReveal } from "./text-reveal"
import { useI18n } from "../context/i18n"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

function list<T>(value: T[] | undefined | null, fallback: T[]) {
  if (Array.isArray(value)) return value
  return fallback
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function unwrap(message: string) {
  const text = message.replace(/^Error:\s*/, "").trim()
  const parse = (value: string) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  }
  const read = (value: string) => {
    const first = parse(value)
    if (typeof first !== "string") return first
    return parse(first.trim())
  }
  let json = read(text)
  if (json === undefined) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1))
    }
  }
  if (!record(json)) return message
  const err = record(json.error) ? json.error : undefined
  if (err) {
    const type = typeof err.type === "string" ? err.type : undefined
    const msg = typeof err.message === "string" ? err.message : undefined
    if (type && msg) return `${type}: ${msg}`
    if (msg) return msg
    if (type) return type
    const code = typeof err.code === "string" ? err.code : undefined
    if (code) return code
  }
  const msg = typeof json.message === "string" ? json.message : undefined
  if (msg) return msg
  const reason = typeof json.error === "string" ? json.error : undefined
  if (reason) return reason
  return message
}

function clean(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim()
}

function heading(text: string) {
  const markdown = text.replace(/\r\n?/g, "\n")
  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = clean(html[1].replace(/<[^>]+>/g, " "))
    if (value) return value
  }
  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = clean(atx[1])
    if (value) return value
  }
  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)
  if (setext?.[1]) {
    const value = clean(setext[1])
    if (value) return value
  }
  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  if (strong?.[1]) {
    const value = clean(strong[1])
    if (value) return value
  }
}

const hidden = new Set(["todowrite"])

function partVisible(part: PartType, showReasoningSummaries: boolean) {
  if (part.type === "tool") {
    if (hidden.has(part.tool)) return false
    if (part.tool === "question" && (part.state.status === "pending" || part.state.status === "running")) return false
    return true
  }
  if (part.type === "text") return !!part.text?.trim()
  if (part.type === "reasoning") {
    return !!(showReasoningSummaries && part.text?.trim())
  }
  return true
}

const emptyParts: PartType[] = []
const emptyDiffs: FileDiff[] = []

export function TimelineMessage(props: {
  sessionID: string
  message: MessageType
  active: boolean
  status: SessionStatus
  actions?: UserActions
  showReasoningSummaries?: boolean
  shellToolDefaultOpen?: boolean
  editToolDefaultOpen?: boolean
  classes?: { root?: string; container?: string }
}) {
  const data = useData()
  const i18n = useI18n()
  const fileComponent = useFileComponent()

  const isUser = createMemo(() => props.message.role === "user")
  const isAssistant = createMemo(() => props.message.role === "assistant")

  const parts = createMemo(() => list(data.store.part?.[props.message.id], emptyParts))

  const showReasoningSummaries = createMemo(() => props.showReasoningSummaries ?? true)

  const working = createMemo(() => props.status.type !== "idle" && props.active)

  const status = createMemo(() => props.status)

  const compaction = createMemo(() =>
    isUser() ? parts().find((part) => part.type === "compaction") : undefined,
  )

  const diffs = createMemo(() => {
    if (!isUser()) return emptyDiffs
    const files = (props.message as { summary?: { diffs?: FileDiff[] } }).summary?.diffs
    if (!files?.length) return emptyDiffs
    const seen = new Set<string>()
    return files
      .reduceRight<FileDiff[]>((result, diff) => {
        if (seen.has(diff.file)) return result
        seen.add(diff.file)
        result.push(diff)
        return result
      }, [])
      .reverse()
  })
  const edited = createMemo(() => diffs().length)
  const [diffState, setDiffState] = createStore({
    open: false,
    expanded: [] as string[],
  })
  createEffect(
    on(
      () => diffState.open,
      (value, prev) => {
        if (!value && prev) setDiffState("expanded", [])
      },
      { defer: true },
    ),
  )

  const childAssistants = createMemo(() => {
    if (!isUser()) return [] as AssistantMessage[]
    const all = list(data.store.message?.[props.sessionID], [] as MessageType[])
    const result: AssistantMessage[] = []
    let found = false
    for (const m of all) {
      if (!found) {
        if (m.id === props.message.id) found = true
        continue
      }
      if (m.role === "user") break
      if (m.role === "assistant") result.push(m as AssistantMessage)
    }
    return result
  })

  const siblingAssistants = createMemo(() => {
    if (!isAssistant()) return [] as AssistantMessage[]
    const parentID = (props.message as AssistantMessage).parentID
    if (!parentID) return [props.message as AssistantMessage]
    const all = list(data.store.message?.[props.sessionID], [] as MessageType[])
    return all.filter(
      (m): m is AssistantMessage => m.role === "assistant" && (m as AssistantMessage).parentID === parentID,
    )
  })

  const showAssistantCopyPartID = createMemo(() => {
    if (!isAssistant()) return undefined
    const messages = siblingAssistants()
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (!message) continue
      const parts = list(data.store.part?.[message.id], emptyParts)
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (!part || part.type !== "text" || !part.text?.trim()) continue
        return part.id
      }
    }
    return undefined
  })

  const assistantCopyPartID = createMemo(() => {
    if (working()) return null
    return showAssistantCopyPartID() ?? null
  })

  const assistantHasVisible = createMemo(() => {
    if (!isUser()) return false
    for (const m of childAssistants()) {
      const ps = list(data.store.part?.[m.id], emptyParts)
      for (const p of ps) {
        if (partVisible(p, showReasoningSummaries())) return true
      }
    }
    return false
  })

  const reasoningHeading = createMemo(() => {
    if (!isUser()) return undefined
    for (const m of childAssistants()) {
      const ps = list(data.store.part?.[m.id], emptyParts)
      for (const p of ps) {
        if (p.type === "reasoning" && p.text) {
          const h = heading(p.text)
          if (h) return h
        }
      }
    }
    return undefined
  })

  const showThinking = createMemo(() => {
    if (status().type === "idle") return false
    if (status().type === "retry") return false
    const all = list(data.store.message?.[props.sessionID], [] as MessageType[])
    const last = all[all.length - 1]
    if (!last || last.id !== props.message.id) return false
    if (last.role !== "assistant") return true
    if (typeof (last as AssistantMessage).time.completed === "number") return true
    const lastParts = list(data.store.part?.[last.id], emptyParts)
    return !lastParts.some((p) => partVisible(p, showReasoningSummaries()))
  })

  const error = createMemo(() => {
    if (!isAssistant()) return undefined
    const err = (props.message as AssistantMessage).error
    return err && err.name !== "MessageAbortedError" ? err : undefined
  })
  const errorText = createMemo(() => {
    const msg = error()?.data?.message
    if (typeof msg === "string") return unwrap(msg)
    if (msg === undefined || msg === null) return ""
    return unwrap(String(msg))
  })
  const interrupted = createMemo(
    () => isAssistant() && (props.message as AssistantMessage).error?.name === "MessageAbortedError",
  )

  const userHasContent = createMemo(() => {
    if (!isUser()) return true
    if (compaction() || showThinking() || edited() > 0 || status().type === "retry") return true
    for (const p of parts()) {
      if (p.type === "text") {
        if (!(p as { synthetic?: boolean }).synthetic && (p.text ?? "").trim()) return true
      } else if (p.type === "file" || p.type === "agent" || p.type === "compaction") {
        return true
      }
    }
    return false
  })

  const durationMs = createMemo(() => {
    if (!isAssistant()) return undefined
    const self = props.message as AssistantMessage
    const end = self.time.completed
    if (typeof end !== "number") return undefined
    const all = list(data.store.message?.[props.sessionID], [] as MessageType[])
    const idx = all.findIndex((m) => m.id === props.message.id)
    if (idx === -1) return undefined
    let start: number | undefined
    for (let i = idx - 1; i >= 0; i--) {
      const m = all[i]
      if (!m) continue
      if (m.role === "assistant") {
        const c = (m as AssistantMessage).time.completed
        if (typeof c === "number") {
          start = c
          break
        }
      } else if (m.role === "user") {
        const c = m.time.created
        if (typeof c === "number") {
          start = c
          break
        }
      }
    }
    if (typeof start !== "number") return undefined
    if (end < start) return undefined
    return end - start
  })

  return (
    <Show when={!isUser() || userHasContent()}>
      <div data-component="session-turn" data-message={props.message.id} class={props.classes?.root}>
        <Show when={isUser()}>
        <div data-slot="session-turn-message-container" class={props.classes?.container}>
          <div data-slot="session-turn-message-content" aria-live="off">
            <Message message={props.message} parts={parts()} actions={props.actions} />
          </div>
          <Show when={compaction()}>
            <div data-slot="session-turn-compaction">
              <MessageDivider label={i18n.t("ui.messagePart.compaction")} />
            </div>
          </Show>
          <Show when={showThinking()}>
            <div data-slot="session-turn-thinking">
              <TextShimmer text={i18n.t("ui.sessionTurn.status.thinking")} />
              <Show when={!showReasoningSummaries()}>
                <TextReveal
                  text={reasoningHeading()}
                  class="session-turn-thinking-heading"
                  travel={25}
                  duration={700}
                />
              </Show>
            </div>
          </Show>
          <SessionRetry status={status()} show={props.active} />
          <Show when={edited() > 0 && !working()}>
            <div data-slot="session-turn-diffs">
              <Collapsible
                open={diffState.open}
                onOpenChange={(value) => setDiffState("open", value)}
                variant="ghost"
              >
                <Collapsible.Trigger>
                  <div data-component="session-turn-diffs-trigger">
                    <div data-slot="session-turn-diffs-title">
                      <span data-slot="session-turn-diffs-label">
                        {i18n.t("ui.sessionReview.change.modified")}
                      </span>
                      <span data-slot="session-turn-diffs-count">
                        {edited()} {i18n.t(edited() === 1 ? "ui.common.file.one" : "ui.common.file.other")}
                      </span>
                      <div data-slot="session-turn-diffs-meta">
                        <DiffChanges changes={diffs()} variant="bars" />
                        <Collapsible.Arrow />
                      </div>
                    </div>
                  </div>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <Show when={diffState.open}>
                    <div data-component="session-turn-diffs-content">
                      <Accordion
                        multiple
                        style={{ "--sticky-accordion-offset": "40px" }}
                        value={diffState.expanded}
                        onChange={(value) =>
                          setDiffState("expanded", Array.isArray(value) ? value : value ? [value] : [])
                        }
                      >
                        <For each={diffs()}>
                          {(diff) => {
                            const active = createMemo(() => diffState.expanded.includes(diff.file))
                            const [visible, setVisible] = createSignal(false)
                            createEffect(
                              on(
                                active,
                                (value) => {
                                  if (!value) {
                                    setVisible(false)
                                    return
                                  }
                                  requestAnimationFrame(() => {
                                    if (!active()) return
                                    setVisible(true)
                                  })
                                },
                                { defer: true },
                              ),
                            )
                            return (
                              <Accordion.Item value={diff.file}>
                                <StickyAccordionHeader>
                                  <Accordion.Trigger>
                                    <div data-slot="session-turn-diff-trigger">
                                      <span data-slot="session-turn-diff-path">
                                        <Show when={diff.file.includes("/")}>
                                          <span data-slot="session-turn-diff-directory">
                                            {`\u202A${getDirectory(diff.file)}\u202C`}
                                          </span>
                                        </Show>
                                        <span data-slot="session-turn-diff-filename">
                                          {getFilename(diff.file)}
                                        </span>
                                      </span>
                                      <div data-slot="session-turn-diff-meta">
                                        <span data-slot="session-turn-diff-changes">
                                          <DiffChanges changes={diff} />
                                        </span>
                                        <span data-slot="session-turn-diff-chevron">
                                          <Icon name="chevron-down" size="small" />
                                        </span>
                                      </div>
                                    </div>
                                  </Accordion.Trigger>
                                </StickyAccordionHeader>
                                <Accordion.Content>
                                  <Show when={visible()}>
                                    <div data-slot="session-turn-diff-view" data-scrollable>
                                      <Dynamic
                                        component={fileComponent}
                                        mode="diff"
                                        before={{ name: diff.file, contents: diff.before }}
                                        after={{ name: diff.file, contents: diff.after }}
                                      />
                                    </div>
                                  </Show>
                                </Accordion.Content>
                              </Accordion.Item>
                            )
                          }}
                        </For>
                      </Accordion>
                    </div>
                  </Show>
                </Collapsible.Content>
              </Collapsible>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={isAssistant()}>
        <div data-slot="session-turn-assistant-content" class={props.classes?.container}>
          <AssistantParts
            messages={[props.message as AssistantMessage]}
            durationMs={durationMs()}
            working={working()}
            showReasoningSummaries={showReasoningSummaries()}
            showAssistantCopyPartID={assistantCopyPartID()}
            shellToolDefaultOpen={props.shellToolDefaultOpen}
            editToolDefaultOpen={props.editToolDefaultOpen}
          />
          <Show when={showThinking()}>
            <div data-slot="session-turn-thinking">
              <TextShimmer text={i18n.t("ui.sessionTurn.status.thinking")} />
            </div>
          </Show>
          <Show when={interrupted()}>
            <div data-slot="session-turn-compaction">
              <MessageDivider label={i18n.t("ui.message.interrupted")} />
            </div>
          </Show>
          <Show when={error()}>
            <Card variant="error" class="error-card">
              {errorText()}
            </Card>
          </Show>
        </div>
      </Show>
      </div>
    </Show>
  )
}

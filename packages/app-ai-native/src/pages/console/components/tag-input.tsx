import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { type ItemTag, tagApi } from "@/pages/store/lib/api"

type TagInputProps = {
  value: string[]
  disabled?: boolean
  placeholder?: string
  placeholderSecondary?: string
  suggestions?: ItemTag[]
  lockedTags?: string[]
  class?: string
  style?: string | Record<string, string>
  onChange: (value: string[]) => void
}

function normalizeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

function splitCandidateTags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => normalizeTag(item))
    .filter(Boolean)
}

export function TagInput(props: TagInputProps) {
  const [draft, setDraft] = createSignal("")
  const [remoteSuggestions, setRemoteSuggestions] = createSignal<ItemTag[]>([])
  const [activeIndex, setActiveIndex] = createSignal(-1)
  const [menuPosition, setMenuPosition] = createSignal({ left: 0, top: 0, width: 240 })
  const lockedTagSet = createMemo(() => new Set((props.lockedTags ?? []).map((tag) => normalizeTag(tag))))
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let searchController: AbortController | undefined
  let inputEl: HTMLInputElement | undefined
  let rootEl: HTMLDivElement | undefined

  const updateMenuPosition = () => {
    if (!inputEl) return
    const rect = inputEl.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const width = Math.max(180, Math.min(260, Math.round((rect.width + 56) * 0.8)))
    const preferredLeft = rect.left
    const maxLeft = viewportWidth - width - 12
    const left = Math.max(12, Math.min(preferredLeft, maxLeft))
    const top = rect.bottom + 6
    setMenuPosition({ left, top, width })
  }

  const mergedSuggestions = createMemo(() => {
    const query = normalizeTag(draft())
    const existing = new Set(props.value.map((tag) => normalizeTag(tag)))
    const all = [...(props.suggestions ?? []), ...remoteSuggestions()]
    const unique = new Map<string, ItemTag>()
    for (const item of all) {
      const slug = normalizeTag(item.slug)
      if (!slug || existing.has(slug)) continue
      if (query && !slug.includes(query)) continue
      if (!unique.has(slug)) unique.set(slug, { ...item, slug })
    }
    return [...unique.values()].slice(0, 8)
  })

  const queueSearch = (value: string) => {
    if (searchTimer) clearTimeout(searchTimer)
    searchController?.abort()
    const query = normalizeTag(value)
    if (!query || query.length < 3) {
      setRemoteSuggestions([])
      setActiveIndex(-1)
      return
    }
    searchTimer = setTimeout(async () => {
      searchController = new AbortController()
      try {
        const result = await tagApi.list({ query, page: 1, pageSize: 8 }, { signal: searchController.signal })
        setRemoteSuggestions(result.tags ?? [])
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setRemoteSuggestions([])
      } finally {
        searchController = undefined
      }
    }, 300)
  }

  onCleanup(() => {
    if (searchTimer) clearTimeout(searchTimer)
    searchController?.abort()
  })

  createEffect(() => {
    props.value.length
    draft()
    queueMicrotask(updateMenuPosition)
  })

  const commitTags = (raw: string) => {
    const nextTags = splitCandidateTags(raw)
    if (!nextTags.length) {
      searchController?.abort()
      setDraft("")
      setRemoteSuggestions([])
      setActiveIndex(-1)
      return
    }

    const existing = new Set(props.value.map((item) => normalizeTag(item)))
    const appended: string[] = []
    for (const tag of nextTags) {
      if (existing.has(tag)) continue
      existing.add(tag)
      appended.push(tag)
    }

    if (appended.length > 0) {
      props.onChange([...props.value, ...appended])
    }
    searchController?.abort()
    setDraft("")
    setRemoteSuggestions([])
    setActiveIndex(-1)
  }

  const removeTag = (tag: string) => {
    if (lockedTagSet().has(normalizeTag(tag))) return
    props.onChange(props.value.filter((item) => item !== tag))
  }

  return (
    <div ref={rootEl} class="relative">
      <div
        class={`thin-scrollbar flex h-[76px] flex-wrap content-start items-start gap-2 overflow-y-auto rounded-[6px] border bg-background-base px-3 py-2 text-sm ${props.class ?? ""}`.trim()}
        style={props.style ?? { border: "1px solid var(--native-border)" }}
        onClick={(e) => {
          const input = e.currentTarget.querySelector("input") as HTMLInputElement | null
          input?.focus()
        }}
      >
        <For each={props.value}>
          {(tag) => (
            <span
              class="inline-flex h-6 max-w-full items-stretch gap-1 rounded-full pl-2 py-0 text-xs overflow-hidden"
              classList={{
                "pr-0": !lockedTagSet().has(normalizeTag(tag)),
                "pr-2": lockedTagSet().has(normalizeTag(tag)),
              }}
              style={{
                background: "#4184e41a",
                color: "#478be6",
              }}
            >
              <span class="truncate self-center">{tag}</span>
              <Show when={!props.disabled && !lockedTagSet().has(normalizeTag(tag))}>
                <button
                  type="button"
                  class="inline-flex size-6 cursor-pointer items-center justify-center self-center rounded-[999px] text-[10px] shrink-0"
                  style={{
                    background: "rgba(71, 139, 230, 0.12)",
                    color: "#478be6",
                  }}
                  onClick={() => removeTag(tag)}
                >
                  ×
                </button>
              </Show>
            </span>
          )}
        </For>
        <Show when={!props.value.length && !draft()}>
          <div class="pointer-events-none absolute left-3 top-2.5 text-xs leading-5 text-[color:color-mix(in_srgb,var(--native-muted)_58%,white_42%)]">
            <div>{props.placeholder}</div>
            <Show when={props.placeholderSecondary}>
              <div>{props.placeholderSecondary}</div>
            </Show>
          </div>
        </Show>
        <input
          ref={inputEl}
          value={draft()}
          disabled={props.disabled}
          placeholder=""
          class="h-6 min-w-[160px] flex-1 self-start border-0 bg-transparent px-0 py-0 text-sm leading-6 text-[var(--native-foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
          onInput={(e) => {
            const value = e.currentTarget.value.replace(/\s+/g, " ")
            if (/[,\s]$/.test(value)) {
              commitTags(value)
              return
            }
            setDraft(value)
            setActiveIndex(-1)
            updateMenuPosition()
            queueSearch(value)
          }}
          onFocus={updateMenuPosition}
          onClick={updateMenuPosition}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData("text") ?? ""
            const nextTags = splitCandidateTags(pasted)
            if (nextTags.length <= 1) return
            e.preventDefault()
            commitTags(pasted)
          }}
          onBlur={() => {
            if (draft().trim()) commitTags(draft())
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              const firstSuggestion = mergedSuggestions()[0]
              if (firstSuggestion) {
                e.preventDefault()
                commitTags(firstSuggestion.slug)
              }
              return
            }
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              e.preventDefault()
              const suggestions = mergedSuggestions()
              if (activeIndex() >= 0 && suggestions[activeIndex()]) {
                commitTags(suggestions[activeIndex()]!.slug)
                return
              }
              commitTags(draft())
              return
            }
            if (e.key === "Backspace" && !draft() && props.value.length > 0) {
              const removable = [...props.value].reverse().find((tag) => !lockedTagSet().has(normalizeTag(tag)))
              if (removable) removeTag(removable)
              return
            }
            if (e.key === "ArrowDown") {
              e.preventDefault()
              const suggestions = mergedSuggestions()
              if (!suggestions.length) return
              setActiveIndex((prev) => (prev + 1) % suggestions.length)
              return
            }
            if (e.key === "ArrowUp") {
              e.preventDefault()
              const suggestions = mergedSuggestions()
              if (!suggestions.length) return
              setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
              return
            }
            if (e.key === "Escape") {
              setActiveIndex(-1)
              setRemoteSuggestions([])
            }
          }}
        />
      </div>

      <Show when={mergedSuggestions().length > 0 && !props.disabled && draft().trim()}>
        <Portal>
          <div
            class="fixed z-[99999] rounded-[6px] border bg-background-base p-1 shadow-lg"
            style={{
              left: `${menuPosition().left}px`,
              top: `${menuPosition().top}px`,
              width: `${menuPosition().width}px`,
              border: "1px solid var(--native-border)",
            }}
          >
            <For each={mergedSuggestions()}>
              {(tag, index) => (
                <button
                  type="button"
                  class="flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-xs"
                  classList={{
                    "bg-[var(--native-hover)]": activeIndex() === index(),
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commitTags(tag.slug)
                  }}
                  onMouseEnter={() => setActiveIndex(index())}
                >
                  <span>{tag.slug}</span>
                  <Show when={index() === 0}>
                    <span class="rounded-[4px] border px-1.5 py-0.5 text-[10px] text-[var(--native-muted)]" style={{ border: "1px solid var(--native-border)" }}>
                      Tab
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  )
}

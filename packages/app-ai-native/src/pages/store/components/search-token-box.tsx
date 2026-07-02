import { createEffect, createMemo, createResource, createSignal, createUniqueId, For, Show, onCleanup } from "solid-js"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import { StoreIcon } from "../lib/store-icons"
import { tagApi, type ItemTag } from "../lib/api"
import { FilterChip } from "./store-filter-bar"
import { HighlightText } from "./store-capability-table"

// ─────────────────────────────────────────────────────────────────────────────
// SearchTokenBox — 令牌化搜索框（/store home）
//
// 把「搜索输入 + 内联 tag 芯片 + 自动补全下拉」封装为一个组件（交互模型 A：
// 输入 → 弹出下拉 → 点选标签提升为 tag 芯片作用域，GitHub / Finder 式）。
//
// - 行 0（恒第一、默认高亮）：「按名称搜索 "<text>"」→ 无作用域纯文本搜索。
// - 「标签」区：slug 命中的 tag 候选（已选中的排除），点选 → 生成可删 tag 芯片。
// - 多 tag = AND（后端 applyItemTagsFilter），自由文本与 tag AND（后端独立 WHERE）。
//
// 焦点机制沿用 home 的 blur→refocus（searchInputRef / allowSearchRefocusUntil /
// pendingBlurRefocusTimer）——input 的 ref 通过 inputRef 回调交回 home，onInput/onBlur/
// onClear 均由 home 提供（保留 300ms debounce + refocus 债务链路，避免回归）。
// ─────────────────────────────────────────────────────────────────────────────

export type SearchTokenBoxProps = {
  /** 受控输入值（home 的 searchText()）。 */
  value: string
  /** 输入回调（home 的 handleSearchInput，保留 300ms debounce + refocus）。 */
  onInput: (value: string) => void
  /** 清空输入（home 的 clearSearchInput）。 */
  onClear: () => void
  /** 立即提交自由文本（Enter 命中行 0 时 flush debounce）。 */
  onSubmit?: () => void
  /** input 的 blur 处理（home 的 refocus 逻辑，保留原有竞态处理）。 */
  onBlur?: (event: FocusEvent) => void
  /** IME 组合开始（home 用来取消组合前排下的去抖搜索，避免组合中被打断）。 */
  onCompositionStart?: () => void
  placeholder: string
  /** 已选中的 tag 芯片（作用域，home 的 appliedTagFilters()）。 */
  tags: string[]
  onAddTag: (slug: string) => void
  onRemoveTag: (slug: string) => void
  /** 把 input 元素交回 home（供其 focus / selection 机制使用）。 */
  inputRef?: (el: HTMLInputElement) => void
}

export function SearchTokenBox(props: SearchTokenBoxProps) {
  const language = useLanguage()
  const listboxId = createUniqueId()

  const [anchorEl, setAnchorEl] = createSignal<HTMLElement>()

  // 输入法(IME)组合态：中文/日文等组合输入进行中。是响应式的，用来在组合期间彻底关闭下拉——
  // 组合中若下拉开着，其候选异步返回时的内容重渲染会把焦点甩到 body，打断组合（中文被打断的根因之一）；
  // 同时组合期间也不触发去抖搜索（列表刷新会 detach/blur 搜索行）。组合结束再照常开下拉+搜索。
  const [composing, setComposing] = createSignal(false)
  // 统一处理一次「已提交」的输入：开下拉 + 交给 home 的 onInput(去抖搜索)。
  const handleCommittedInput = (value: string) => {
    setDismissed(false)
    setOpened(true)
    props.onInput(value)
  }

  // 下拉打开：聚焦过 + 未被 Esc/外部点击关闭 + 有文本（无文本时行 0 隐藏、无候选 → 下拉为空）。
  const [opened, setOpened] = createSignal(false)
  const [dismissed, setDismissed] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  const trimmed = createMemo(() => props.value.trim())
  const open = createMemo(() => opened() && !dismissed() && !composing() && trimmed().length > 0)

  // ── 候选数据：debounce 200ms + AbortSignal 取消上一次；空 query 不请求。 ──
  const [suggestQuery, setSuggestQuery] = createSignal("")
  let suggestTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    const q = trimmed()
    clearTimeout(suggestTimer)
    if (!q) {
      setSuggestQuery("")
      return
    }
    suggestTimer = setTimeout(() => setSuggestQuery(q), 200)
  })

  let suggestAbort: AbortController | undefined
  const [suggestionsRes] = createResource(
    () => suggestQuery() || undefined,
    async (q: string) => {
      suggestAbort?.abort()
      const controller = new AbortController()
      suggestAbort = controller
      try {
        const res = await tagApi.list({ query: q, pageSize: 6 }, { signal: controller.signal })
        return res.tags
      } catch {
        // 自动补全失败静默降级（含 AbortError）——不进 error 态，只是没有候选。
        return [] as ItemTag[]
      }
    },
  )

  onCleanup(() => {
    clearTimeout(suggestTimer)
    suggestAbort?.abort()
  })

  // 候选 tag：排除已选中的芯片。
  // 读 `.latest` 而非 `suggestionsRes()`：后者在 loading 时会命中上层 <Suspense> → 回退态把整块内容
  // （含搜索框输入）卸载重挂 → 每次输入都 detach/blur 输入框（IME 被打断、芯片动画重放的真正根因）。
  // `.latest` 取上次已解析值、刷新期间不挂起，避免这次重挂。
  const tagRows = createMemo(() => {
    const selected = new Set(props.tags)
    return (suggestionsRes.latest ?? []).filter((tag) => !selected.has(tag.slug))
  })
  // 选项总数 = 行 0（按名称搜索） + N 个 tag 候选行。
  const optionCount = createMemo(() => 1 + tagRows().length)

  // 新的查询 / 候选集到达时把高亮复位到行 0（默认无作用域）。
  createEffect(() => {
    props.value
    tagRows()
    setHighlightedIndex(0)
  })

  const optionId = (index: number) => `${listboxId}-opt-${index}`

  // 行 0：提交自由文本（无作用域），关闭下拉。点选与键盘 Enter 共用，
  // 但点选必须无条件走这里（不看 highlightedIndex）——否则「键盘移到 tag 行、
  // 指针恰停在行 0 未触发 mouseenter」时点行 0 会误加 tag。
  const submitNameSearch = () => {
    props.onSubmit?.()
    setDismissed(true)
  }

  const activateHighlighted = () => {
    const index = highlightedIndex()
    if (index <= 0) {
      submitNameSearch()
      return
    }
    const tag = tagRows()[index - 1]
    if (tag) props.onAddTag(tag.slug)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Backspace" && props.value.length === 0 && props.tags.length > 0) {
      event.preventDefault()
      props.onRemoveTag(props.tags[props.tags.length - 1])
      return
    }
    if (!open()) {
      // 关闭态：仅 ArrowDown 重新打开（若有文本）。
      if (event.key === "ArrowDown" && trimmed().length > 0) {
        event.preventDefault()
        setDismissed(false)
        setOpened(true)
      }
      return
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        setHighlightedIndex((index) => Math.min(index + 1, optionCount() - 1))
        break
      case "ArrowUp":
        event.preventDefault()
        setHighlightedIndex((index) => Math.max(index - 1, 0))
        break
      case "Enter":
        event.preventDefault()
        activateHighlighted()
        break
      case "Escape":
        event.preventDefault()
        setDismissed(true)
        break
    }
  }

  return (
    <Popover
      modal={false}
      open={open()}
      anchorRef={anchorEl}
      onOpenChange={(value) => {
        // Kobalte 因外部点击 / focus-outside / Esc 请求关闭 → 记为已关闭（下次输入/聚焦再开）。
        if (!value) setDismissed(true)
      }}
    >
      {/* 可见输入框容器（Finder 式：芯片 + 输入在同一框内），作为 popover 锚点（anchorRef）。 */}
      <div
        ref={setAnchorEl}
        class="relative flex min-h-[42px] min-w-0 max-w-[560px] flex-1 flex-wrap items-center gap-1.5 rounded-[13px] border border-[var(--native-border)] bg-[var(--native-panel)] py-1 pl-[13px] pr-1 transition-[border-color,box-shadow] hover:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))] focus-within:border-[color:color-mix(in_srgb,var(--native-primary)_55%,transparent)] focus-within:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))] focus-within:ring-[3px] focus-within:ring-[color:color-mix(in_srgb,var(--native-primary)_15%,transparent)]"
      >
        <span class="flex shrink-0 items-center text-[color:color-mix(in_srgb,var(--native-muted)_82%,white)]">
          <StoreIcon name="search" size={16} />
        </span>

        {/* 内联 tag 芯片（作用域），复用 FilterChip；slug 直接展示（字典无 label）。 */}
        <For each={props.tags}>
          {(slug) => <FilterChip label={slug} animate={false} onRemove={() => props.onRemoveTag(slug)} />}
        </For>

        <input
          ref={props.inputRef}
          type="text"
          inputmode="search"
          placeholder={props.placeholder}
          value={props.value}
          role="combobox"
          aria-expanded={open()}
          aria-controls={open() ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open() ? optionId(highlightedIndex()) : undefined}
          onCompositionStart={() => {
            setComposing(true)
            // 取消组合前 latin 键排的那次去抖搜索——否则它会在组合中触发列表刷新→输入框 blur→打断 IME。
            props.onCompositionStart?.()
          }}
          onCompositionEnd={(event) => {
            setComposing(false)
            // 组合结束才提交一次（触发下拉 + 去抖搜索）。
            handleCommittedInput((event.currentTarget as HTMLInputElement).value)
          }}
          onInput={(event) => {
            // IME 组合中：跳过，等 compositionend 再提交，避免中途刷新打断组合。
            if (composing() || (event as InputEvent).isComposing) return
            handleCommittedInput((event.currentTarget as HTMLInputElement).value)
          }}
          onFocus={() => {
            // 只开、不清 dismissed：列表刷新后 home 会 .focus() 回填焦点（触发本 onFocus），
            // 若在此清掉 dismissed，会把用户刚按下的 Esc / 回车提交后的「已关闭」态又顶开（bug）。
            // dismissed 仅由真实输入(onInput)或 ArrowDown 重开来清。
            setOpened(true)
          }}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            // 兜底：极少数 IME/浏览器在组合中直接 blur 而不发 compositionend，复位以免 composing 卡死吞输入。
            setComposing(false)
            props.onBlur?.(event)
          }}
          class="h-[32px] min-w-[100px] flex-1 border-none bg-transparent text-sm font-medium !text-[var(--native-foreground)] caret-[var(--native-primary)] outline-none placeholder:font-normal placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_72%,white)] focus:outline-none focus-visible:outline-none"
        />

        <Show when={props.value.length > 0}>
          <button
            type="button"
            aria-label={language.t("common.clear")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={props.onClear}
            class="flex h-[30px] w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[color:color-mix(in_srgb,var(--native-muted)_78%,white)] transition-colors hover:text-[var(--native-foreground)]"
          >
            <StoreIcon name="x" size={16} />
          </button>
        </Show>
      </div>

      <PopoverContent
        // 保持输入焦点（自动补全不抢焦点）：阻止 Popover 打开/关闭时的自动聚焦。
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // 点击 / 聚焦到输入框容器内部（输入框、芯片 ✕、清除按钮）不算「外部」→ 不关闭。
        onPointerDownOutside={(e) => {
          const target = e.detail.originalEvent.target as Node | null
          const el = anchorEl()
          if (el && target && el.contains(target)) e.preventDefault()
        }}
        // 列表重挂等导致的瞬时失焦（relatedTarget 为空）保持打开；真正 Tab 走才关闭。
        onFocusOutside={(e) => {
          const related = (e.detail.originalEvent as FocusEvent).relatedTarget
          if (!related) e.preventDefault()
        }}
        class="w-[var(--kb-popper-anchor-width)] min-w-[16rem] origin-[var(--kb-popover-content-transform-origin)] rounded-[13px] border border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] p-[7px] shadow-[var(--native-shadow-md)] data-[expanded]:animate-content-show data-[closed]:animate-content-hide"
      >
        <ul id={listboxId} role="listbox" class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-0.5 overflow-y-auto">
          {/* 行 0：按名称搜索（恒第一、默认高亮）。 */}
          <li
            id={optionId(0)}
            role="option"
            aria-selected={highlightedIndex() === 0}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlightedIndex(0)}
            onClick={submitNameSearch}
            class={cn(
              "flex cursor-pointer items-center gap-[9px] rounded-[9px] px-[9px] py-2 text-[13px] text-[var(--native-foreground)] transition-colors",
              highlightedIndex() === 0
                ? "bg-[color:color-mix(in_oklab,var(--native-primary)_10%,var(--native-panel))]"
                : "hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)]",
            )}
          >
            <StoreIcon name="search" size={14} class="shrink-0 text-[var(--native-muted)]" />
            <span class="min-w-0 flex-1 truncate">
              {language.t("store.search.searchByName", { query: props.value })}
            </span>
          </li>

          {/* 「标签」区：slug 命中的候选，点选提升为芯片。 */}
          <Show when={tagRows().length > 0}>
            <li
              role="presentation"
              class="px-[9px] pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--native-dim)]"
            >
              {language.t("store.search.tagsGroup")}
            </li>
            <For each={tagRows()}>
              {(tag, index) => {
                const rowIndex = () => index() + 1
                return (
                  <li
                    id={optionId(rowIndex())}
                    role="option"
                    aria-selected={highlightedIndex() === rowIndex()}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(rowIndex())}
                    onClick={() => props.onAddTag(tag.slug)}
                    class={cn(
                      "flex cursor-pointer items-center gap-[9px] rounded-[9px] px-[9px] py-2 text-[13px] text-[var(--native-foreground)] transition-colors",
                      highlightedIndex() === rowIndex()
                        ? "bg-[color:color-mix(in_oklab,var(--native-primary)_10%,var(--native-panel))]"
                        : "hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)]",
                    )}
                  >
                    <span class="inline-flex h-4 shrink-0 items-center rounded-[5px] bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)] px-1 text-[11px] font-bold text-[var(--native-primary)]">
                      #
                    </span>
                    <span class="min-w-0 flex-1 truncate">
                      <HighlightText text={tag.slug} query={trimmed()} />
                    </span>
                  </li>
                )
              }}
            </For>
          </Show>
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export default SearchTokenBox

import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TextField, TextFieldInput } from "@/components/ui/text-field"
import { LocalIcon } from "@/components/local-icon"
import { cn } from "@/lib/utils"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { tagApi, type CapabilityItem, type Category, type ItemOrder, type ItemSort, type ItemTag, type SecurityRiskGroup } from "../lib/api"
import { detectMcpFields, mcpRequiresPluginRuntime } from "../lib/mcp-config"
import { pickItemDescription } from "../lib/item-description"
import { useLanguage } from "@/context/language"
import { st, sx } from "../lib/styles"
import SecurityTag from "./security-tag"
import FromPluginBadge from "./from-plugin-badge"

export type TableColumnKey = "title" | "description" | "type" | "category" | "security" | "tag" | "source" | "experienceScore" | "favorite" | "updated"

type SecurityFilterValue = SecurityRiskGroup
type TagLayout = { visibleCount: number, hiddenCount: number }
type OptionItem = { value: string, label: string }

const TAG_FILTER_PAGE_SIZE = 20
const TAG_COLOR_BY_CLASS = {
  system: {
    color: "#e17a0c",
    background: "#f9a02c1a",
    activeColor: "#fff3d6",
    activeBackground: "#f58b19",
  },
  custom: {
    color: "#478be6",
    background: "#4184e41a",
    activeColor: "#dcecff",
    activeBackground: "#478be6",
  },
} as const
const TAG_BADGE_WIDTH_CACHE_LIMIT = 200
const TAG_LAYOUT_CACHE_LIMIT = 300
const TAG_BADGE_WIDTH_CACHE = new Map<string, number>()
const TAG_LAYOUT_CACHE = new Map<string, TagLayout>()
const MULTILINE_CLAMP_STYLE: JSX.CSSProperties = {
  display: "-webkit-box",
  "-webkit-box-orient": "vertical" as const,
  "-webkit-line-clamp": 2,
  "text-overflow": "ellipsis",
  "white-space": "normal",
  overflow: "hidden",
}

let sharedTagMeasureRoot: HTMLDivElement | undefined

export const DEFAULT_VISIBLE_COLUMNS: Record<TableColumnKey, boolean> = {
  title: true,
  description: true,
  type: false,
  category: true,
  security: true,
  tag: true,
  source: true,
  experienceScore: true,
  favorite: true,
  updated: true,
}

export function buildStoreTableColumnOptions(t: (key: string) => string) {
  return [
    { key: "title" as const, label: t("store.home.table.title") },
    { key: "description" as const, label: t("store.home.table.description") },
    { key: "type" as const, label: t("store.console.capabilities.type") },
    { key: "category" as const, label: t("store.console.capabilities.category") },
    { key: "security" as const, label: t("store.security.riskLevel") },
    { key: "tag" as const, label: t("store.home.table.tag") },
    { key: "source" as const, label: t("store.home.table.source") },
    { key: "experienceScore" as const, label: t("store.home.table.experienceScore") },
    { key: "favorite" as const, label: t("store.home.table.favoriteCount") },
    { key: "updated" as const, label: t("store.detail.updated") },
  ]
}

export function formatCompact(n: number) {
  if (n >= 1000000) {
    const value = (n / 1000000).toFixed(n >= 10000000 ? 0 : 1)
    return `${value.replace(/\.0$/, "")}M`
  }
  if (n >= 1000) {
    const value = (n / 1000).toFixed(n >= 10000 ? 0 : 1)
    return `${value.replace(/\.0$/, "")}k`
  }
  return String(n)
}

export function formatStoreDate(locale: string, iso?: string) {
  if (!iso) return "—"
  const normalizedLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale
  return new Date(iso).toLocaleDateString(normalizedLocale, {
    year: "numeric",
    month: locale === "zh" ? "numeric" : "short",
    day: "numeric",
  })
}

export function formatSourceMetric(value?: number, source?: string) {
  if (!source) return "—"
  if (value == null) return "—"
  if (Math.abs(value) >= 1000) return formatCompact(Math.round(value))
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1).replace(/\.0$/, "")
}

export function rangePages(page: number, totalPages: number) {
  const size = 5
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, totalPages - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
}

export function formatStoreTablePaginationSummary(props: {
  page: number
  pageSize: number
  totalItems: number
  showingLabel: (args: { from: number, to: number, total: number }) => string
  emptyLabel: string
}) {
  if (props.totalItems <= 0) return props.emptyLabel

  return props.showingLabel({
    from: Math.min((props.page - 1) * props.pageSize + 1, props.totalItems),
    to: Math.min(props.page * props.pageSize, props.totalItems),
    total: props.totalItems,
  })
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function HighlightText(props: { text: string; query?: string }) {
  const segments = createMemo(() => {
    const query = props.query?.trim()
    if (!query) return [{ text: props.text, highlight: false }]
    const terms = Array.from(
      new Set(
        query
          .split(/\s+/)
          .filter(Boolean)
          .map((term) => term.toLowerCase()),
      ),
    )
    if (terms.length === 0) return [{ text: props.text, highlight: false }]
    const regex = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
    const parts = props.text.split(regex)
    const termSet = new Set(terms)
    return parts.map((part) => ({
      text: part,
      highlight: termSet.has(part.toLowerCase()),
    }))
  })
  return (
    <For each={segments()}>
      {(segment) =>
        segment.highlight ? (
          <mark class="rounded-sm bg-[color:color-mix(in_srgb,var(--native-primary)_18%,transparent)] px-0.5 text-[var(--native-primary)]">
            {segment.text}
          </mark>
        ) : (
          <>{segment.text}</>
        )
      }
    </For>
  )
}

function compareTags(a: Pick<ItemTag, "tagClass" | "slug">, b: Pick<ItemTag, "tagClass" | "slug">) {
  const aPriority = a.tagClass === "system" ? 0 : 1
  const bPriority = b.tagClass === "system" ? 0 : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  return a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" })
}

function getTagLayoutCacheKey(tags: Pick<ItemTag, "slug" | "tagClass">[], containerWidth: number) {
  return `${containerWidth}::${tags.map((tag) => `${tag.tagClass}:${tag.slug}`).join("|")}`
}

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size <= limit) return
  const oldestKey = cache.keys().next().value
  if (oldestKey !== undefined) cache.delete(oldestKey)
}

function ensureSharedTagMeasureRoot() {
  if (typeof document === "undefined") return undefined
  if (sharedTagMeasureRoot?.isConnected) return sharedTagMeasureRoot

  const root = document.createElement("div")
  root.setAttribute("aria-hidden", "true")
  root.className = "pointer-events-none fixed left-0 top-0 -z-10 flex opacity-0"
  document.body.appendChild(root)
  sharedTagMeasureRoot = root
  return sharedTagMeasureRoot
}

function tagStyle(tagClass?: string, active = false) {
  const accent = tagClass === "system" ? TAG_COLOR_BY_CLASS.system : TAG_COLOR_BY_CLASS.custom
  return {
    color: active ? accent.activeColor : accent.color,
    "background-color": active ? accent.activeBackground : accent.background,
  }
}

function StoreTagBadge(props: { slug: string, tagClass?: string, muted?: boolean, active?: boolean, clickable?: boolean, onClick?: () => void }) {
  const [hovered, setHovered] = createSignal(false)

  return (
    <button
      type="button"
      class={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] leading-4 font-semibold transition-colors",
        props.clickable ? "cursor-pointer" : "cursor-default",
      )}
      style={props.muted
        ? {
            color: "#dcecff",
            "background-color": "#478be6",
          }
        : tagStyle(props.tagClass, props.active || (props.clickable && hovered()))}
      title={props.slug}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick?.()
      }}
      onMouseDown={(e) => {
        if (props.clickable) e.stopPropagation()
      }}
      onMouseEnter={() => {
        if (props.clickable) setHovered(true)
      }}
      onMouseLeave={() => {
        if (props.clickable) setHovered(false)
      }}
      disabled={!props.clickable && !props.onClick}
    >
      <span class="truncate">{props.slug}</span>
    </button>
  )
}

function StoreFilterHeaderTrigger(props: { label: string, active: boolean, count: number }) {
  return (
    <>
      <span>{props.label}</span>
      <span class="ml-auto inline-flex items-center gap-1.5" style={props.active ? { color: "var(--native-primary)" } : undefined}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        <Show when={props.count > 0}>
          <span class="inline-flex min-w-5 items-center justify-center rounded-full bg-[#478be6] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-[#dcecff]">
            {props.count}
          </span>
        </Show>
      </span>
    </>
  )
}

function StoreTableEmptyState(props: { colSpan: number, message: string }) {
  return (
    <tr>
      <td class="border-b-0 p-0" colSpan={props.colSpan}>
        <div class={sx.state}>{props.message}</div>
      </td>
    </tr>
  )
}

function CheckboxHeaderFilter(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  active: boolean
  count: number
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
  options: OptionItem[]
  selectedValues: string[]
  onToggle: (value: string) => void
  onReset: () => void
  onApply: () => void
  noResultsLabel: string
  resetLabel: string
  confirmLabel: string
}) {
  return (
    <Popover modal={false} open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger as="button" class={cn(st.sort(false), "items-center gap-2")}>
        <StoreFilterHeaderTrigger label={props.label} active={props.active} count={props.count} />
      </PopoverTrigger>
      <PopoverContent class="w-64 p-2">
        <div class="flex max-h-[24rem] flex-col gap-2">
          <TextField class="min-w-0">
            <TextFieldInput
              type="search"
              value={props.query}
              onInput={(e: InputEvent) => props.onQueryChange((e.currentTarget as HTMLInputElement).value)}
              placeholder={props.placeholder}
              class="h-9 rounded-md border-[color:color-mix(in_srgb,var(--native-border)_46%,transparent)] bg-[var(--native-panel)] px-3 text-sm !text-[var(--native-foreground)] [&::-webkit-search-cancel-button]:cursor-pointer focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:ring-0"
            />
          </TextField>
          <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-1 overflow-y-auto pr-1">
            <For each={props.options}>
              {(option) => (
                <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                  <input type="checkbox" checked={props.selectedValues.includes(option.value)} onChange={() => props.onToggle(option.value)} />
                  <span class="min-w-0 truncate">{option.label}</span>
                </label>
              )}
            </For>
            <Show when={props.options.length === 0}>
              <div class="px-2 py-3 text-sm text-[var(--native-muted)]">{props.noResultsLabel}</div>
            </Show>
          </div>
          <div class="flex items-center justify-end gap-2 border-t pt-2">
            <button type="button" class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-[var(--native-muted)] hover:bg-accent hover:text-accent-foreground" onClick={props.onReset}>
              {props.resetLabel}
            </button>
            <button type="button" class="cursor-pointer rounded-md bg-[var(--native-primary)] px-2.5 py-1.5 text-sm" style={{ color: "#fff" }} onClick={props.onApply}>
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagFilterDropdown(props: {
  label: string
  active: boolean
  appliedValues: string[]
  onApply: (values: string[]) => void
  onReset: () => void
  noResultsLabel: string
  resetLabel: string
  confirmLabel: string
  searchPlaceholder: string
  limitHint: string
}) {
  const [tagFilter, setTagFilter] = createStore({
    open: false,
    query: "",
    debouncedQuery: "",
    pending: [] as string[],
  })
  let tagSearchTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => clearTimeout(tagSearchTimer))

  const [tagOptions] = createResource(
    () => ({ query: tagFilter.debouncedQuery.trim() || undefined, page: 1, pageSize: TAG_FILTER_PAGE_SIZE }),
    (params) => tagApi.list(params).catch(() => ({ tags: [] as ItemTag[], total: 0, page: 1, pageSize: TAG_FILTER_PAGE_SIZE, hasMore: false })),
  )

  const visibleTagOptions = createMemo(() => {
    const loaded = tagOptions.latest?.tags ?? []
    const selected = tagFilter.pending
      .filter((slug) => !loaded.some((tag) => tag.slug === slug))
      .map((slug) => ({
        id: `mock-${slug}`,
        slug,
        tagClass: "custom",
        createdBy: "mock",
        createdAt: "",
      }) satisfies ItemTag)
    return [...selected, ...loaded].sort(compareTags)
  })

  const tagFilterHasMore = createMemo(() => Boolean(tagOptions.latest?.hasMore || (tagOptions.latest?.total ?? 0) > TAG_FILTER_PAGE_SIZE))

  const togglePendingTagFilter = (slug: string) => {
    setTagFilter("pending", (current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
  }

  return (
    <Popover
      modal={false}
      open={tagFilter.open}
      onOpenChange={(open) => {
        setTagFilter("open", open)
        if (open) {
          setTagFilter("pending", [...props.appliedValues])
          setTagFilter("query", "")
          setTagFilter("debouncedQuery", "")
        }
      }}
    >
      <PopoverTrigger as="button" class={cn(st.sort(false), "items-center gap-2")}>
        <StoreFilterHeaderTrigger label={props.label} active={props.active} count={props.appliedValues.length} />
      </PopoverTrigger>
      <PopoverContent class="w-72 p-2">
        <div class="flex max-h-[28.8rem] flex-col gap-2">
          <TextField class="min-w-0">
            <TextFieldInput
              type="search"
              value={tagFilter.query}
              onInput={(e: InputEvent) => {
                const value = (e.currentTarget as HTMLInputElement).value
                setTagFilter("query", value)
                clearTimeout(tagSearchTimer)
                tagSearchTimer = setTimeout(() => setTagFilter("debouncedQuery", value.trim()), 300)
              }}
              placeholder={props.searchPlaceholder}
              class="h-9 rounded-md border-[color:color-mix(in_srgb,var(--native-border)_46%,transparent)] bg-[var(--native-panel)] px-3 text-sm !text-[var(--native-foreground)] [&::-webkit-search-cancel-button]:cursor-pointer focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:ring-0"
            />
          </TextField>
          <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-1 overflow-y-auto pr-1">
            <For each={visibleTagOptions().slice(0, TAG_FILTER_PAGE_SIZE)}>
              {(tag) => (
                <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                  <input type="checkbox" checked={tagFilter.pending.includes(tag.slug)} onChange={() => togglePendingTagFilter(tag.slug)} />
                  <StoreTagBadge slug={tag.slug} tagClass={tag.tagClass} active={tagFilter.pending.includes(tag.slug)} />
                </label>
              )}
            </For>
            <Show when={visibleTagOptions().length === 0}>
              <div class="px-2 py-3 text-sm text-[var(--native-muted)]">{props.noResultsLabel}</div>
            </Show>
          </div>
          <Show when={tagFilterHasMore()}>
            <div class="px-2 text-[11px] text-[var(--native-muted)]">{props.limitHint}</div>
          </Show>
          <div class="flex items-center justify-end gap-2 border-t pt-2">
            <button type="button" class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-[var(--native-muted)] hover:bg-accent hover:text-accent-foreground" onClick={() => {
              setTagFilter("pending", [])
              setTagFilter("query", "")
              setTagFilter("debouncedQuery", "")
              setTagFilter("open", false)
              props.onReset()
            }}>
              {props.resetLabel}
            </button>
            <button type="button" class="cursor-pointer rounded-md bg-[var(--native-primary)] px-2.5 py-1.5 text-sm" style={{ color: "#fff" }} onClick={() => {
              setTagFilter("query", "")
              setTagFilter("debouncedQuery", "")
              setTagFilter("open", false)
              props.onApply([...tagFilter.pending])
            }}>
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagCell(props: { tags?: ItemTag[], appliedTagFilters: string[], onTagClick: (slug: string) => void }) {
  const allTags = createMemo(() => [...(props.tags ?? [])].sort(compareTags))
  const activeTagSet = createMemo(() => new Set(props.appliedTagFilters))
  const [layout, setLayout] = createStore<TagLayout>({
    visibleCount: Math.min(6, allTags().length),
    hiddenCount: Math.max(allTags().length - Math.min(6, allTags().length), 0),
  })
  let containerRef: HTMLDivElement | undefined
  let resizeObserver: ResizeObserver | undefined

  const recomputeLayout = () => {
    const tags = allTags()
    const container = containerRef
    const measure = ensureSharedTagMeasureRoot()
    if (!container || !measure || tags.length === 0) {
      setLayout({ visibleCount: 0, hiddenCount: 0 })
      return
    }

    const containerWidth = container.clientWidth
    if (!containerWidth) {
      setLayout({ visibleCount: Math.min(6, tags.length), hiddenCount: Math.max(tags.length - Math.min(6, tags.length), 0) })
      return
    }

    const layoutCacheKey = getTagLayoutCacheKey(tags, containerWidth)
    const cachedLayout = TAG_LAYOUT_CACHE.get(layoutCacheKey)
    if (cachedLayout) {
      setLayout(cachedLayout)
      return
    }

    const rowGap = 4
    const maxRows = 2
    const createMeasureBadge = (slug: string, tagClass?: string, muted = false) => {
      const node = document.createElement("span")
      node.className = "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap"
      if (muted) {
        node.style.color = "#dcecff"
        node.style.backgroundColor = "#478be6"
      }
      else {
        const style = tagStyle(tagClass)
        node.style.color = String(style.color)
        node.style.backgroundColor = String(style["background-color"])
      }
      node.textContent = slug
      return node
    }

    const widths = tags.map((tag) => {
      const widthCacheKey = `${tag.tagClass}:${tag.slug}`
      const cachedWidth = TAG_BADGE_WIDTH_CACHE.get(widthCacheKey)
      if (cachedWidth !== undefined) return cachedWidth

      const badge = createMeasureBadge(tag.slug, tag.tagClass)
      measure.appendChild(badge)
      const width = Math.ceil(badge.getBoundingClientRect().width)
      badge.remove()
      setBoundedCache(TAG_BADGE_WIDTH_CACHE, widthCacheKey, width, TAG_BADGE_WIDTH_CACHE_LIMIT)
      return width
    })

    const getOverflowWidth = (hiddenCount: number) => {
      const widthCacheKey = `muted:+${hiddenCount}`
      const cachedWidth = TAG_BADGE_WIDTH_CACHE.get(widthCacheKey)
      if (cachedWidth !== undefined) return cachedWidth

      const badge = createMeasureBadge(`+${hiddenCount}`, undefined, true)
      measure.appendChild(badge)
      const width = Math.ceil(badge.getBoundingClientRect().width)
      badge.remove()
      setBoundedCache(TAG_BADGE_WIDTH_CACHE, widthCacheKey, width, TAG_BADGE_WIDTH_CACHE_LIMIT)
      return width
    }

    let bestVisible = tags.length
    for (let visibleCount = tags.length; visibleCount >= 0; visibleCount -= 1) {
      const hiddenCount = tags.length - visibleCount
      const items = widths.slice(0, visibleCount)
      if (hiddenCount > 0) items.push(getOverflowWidth(hiddenCount))

      let rows = 1
      let rowWidth = 0
      let fits = true
      for (const width of items) {
        const nextWidth = rowWidth === 0 ? width : rowWidth + rowGap + width
        if (nextWidth <= containerWidth) {
          rowWidth = nextWidth
          continue
        }
        rows += 1
        if (rows > maxRows) {
          fits = false
          break
        }
        rowWidth = width
        if (rowWidth > containerWidth) {
          fits = false
          break
        }
      }

      if (fits) {
        bestVisible = visibleCount
        break
      }
    }

    const nextLayout = { visibleCount: bestVisible, hiddenCount: Math.max(tags.length - bestVisible, 0) }
    setBoundedCache(TAG_LAYOUT_CACHE, layoutCacheKey, nextLayout, TAG_LAYOUT_CACHE_LIMIT)
    setLayout(nextLayout)
  }

  onMount(() => {
    recomputeLayout()
    if (typeof ResizeObserver !== "undefined" && containerRef) {
      resizeObserver = new ResizeObserver(() => recomputeLayout())
      resizeObserver.observe(containerRef)
    }
  })

  createEffect(() => {
    allTags()
    queueMicrotask(() => recomputeLayout())
  })

  onCleanup(() => resizeObserver?.disconnect())

  const visibleTags = createMemo(() => allTags().slice(0, layout.visibleCount))

  return (
    <Show when={allTags().length > 0} fallback={<span>—</span>}>
      <div ref={containerRef} class="flex max-h-[3.75rem] flex-wrap gap-1 overflow-hidden">
        <For each={visibleTags()}>
          {(tag) => (
            <StoreTagBadge
              slug={tag.slug}
              tagClass={tag.tagClass}
              active={activeTagSet().has(tag.slug)}
              clickable
              onClick={() => props.onTagClick(tag.slug)}
            />
          )}
        </For>
        <Show when={layout.hiddenCount > 0}>
          <StoreTagBadge slug={`+${layout.hiddenCount}`} muted />
        </Show>
      </div>
    </Show>
  )
}

function ColumnToggleMenu(props: {
  columnOptions: { key: TableColumnKey, label: string }[]
  isColumnVisible: (key: TableColumnKey) => boolean
  onToggleColumnVisibility: (key: TableColumnKey) => void
  label: string
}) {
  return (
    // modal={false}：一致性 + 预防 scroll-lock 残留（同 page-size 下拉，不锁滚动，点外部/Esc 仍关闭）。
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger as="button" class="inline-flex size-7 items-center justify-center rounded-[0.375rem] text-[var(--native-muted)] transition-colors hover:bg-accent hover:text-accent-foreground" title="Toggle columns">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-56 p-1">
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel class="px-2 py-1.5 text-xs font-medium text-[var(--native-muted)]">
            {props.label}
          </DropdownMenuGroupLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <For each={props.columnOptions}>
          {(column) => (
            <DropdownMenuCheckboxItem
              checked={props.isColumnVisible(column.key)}
              onChange={() => props.onToggleColumnVisibility(column.key)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StoreTableFooter(props: {
  page: number
  pageSize: number
  totalPages: number
  totalItems: number
  summary: string
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}) {
  const language = useLanguage()
  const visiblePages = () => rangePages(props.page, props.totalPages)
  const pageSizeOptions = () => props.pageSizeOptions ?? [15, 30, 50]
  const perPageLabel = (count: number) => language.t("store.home.pagination.perPage", { count })

  return (
    <div class={sx.pager}>
      <div class="flex flex-wrap items-center gap-3">
        <div class={sx.pagerSum}>{props.summary}</div>
        <Show when={props.onPageSizeChange}>
          {/* 每页条数选择器：复用工具栏排序下拉的 pill/下拉风格（--native-* token），单选总是回第一页。
              modal={false}：Kobalte DropdownMenu 默认 modal=true 会锁 body 滚动；选项一改就触发
              home setPageSize → setPage(1) → 列表 keyed 重挂 + footer 重渲染，会在 scroll-lock
              cleanup 跑完前卸载该菜单，残留 body scroll-lock 导致滚轮失效。关掉 modal 即不锁滚动，
              点外部 / Esc 仍正常关闭。 */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              as="button"
              class="inline-flex h-[1.9375rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2.5 text-[0.8125rem] font-medium text-[var(--native-muted)] transition-all hover:border-[color:color-mix(in_oklab,var(--native-border-strong)_34%,transparent)] hover:text-[var(--native-foreground)]"
            >
              <span class="whitespace-nowrap">{perPageLabel(props.pageSize)}</span>
              <Icon name="chevron-down" size="small" class="opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-[6rem]">
              <DropdownMenuRadioGroup
                value={String(props.pageSize)}
                onChange={(value) => props.onPageSizeChange?.(Number(value))}
              >
                <For each={pageSizeOptions()}>
                  {(option) => (
                    <DropdownMenuRadioItem value={String(option)}>{perPageLabel(option)}</DropdownMenuRadioItem>
                  )}
                </For>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
      </div>
      <div class={sx.pagerActs}>
        <button class={st.page(false)} disabled={props.page <= 1} onClick={() => props.onPageChange(1)}>
          <span aria-hidden="true">«</span>
        </button>
        <button class={st.page(false)} disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
          <Icon name="chevron-left" />
        </button>
        <For each={visiblePages()}>
          {(pageNumber) => (
            <button class={st.page(pageNumber === props.page)} onClick={() => props.onPageChange(pageNumber)}>
              {pageNumber}
            </button>
          )}
        </For>
        <button class={st.page(false)} disabled={props.page >= props.totalPages} onClick={() => props.onPageChange(props.page + 1)}>
          <Icon name="chevron-right" />
        </button>
        <button class={st.page(false)} disabled={props.page >= props.totalPages} onClick={() => props.onPageChange(props.totalPages)}>
          <span aria-hidden="true">»</span>
        </button>
      </div>
    </div>
  )
}

export const StoreTablePagination = StoreTableFooter

export { HighlightText }

// mcpListSubscribeBlocked gates the per-row subscribe control in the LIST. The list response
// carries no per-row `mcpConfig` status, so we gate using only `itemType` + `favorited` +
// detected placeholders: an unsubscribed MCP that still has fillable placeholder params must be
// configured on the detail page first. Already-favorited rows (unsubscribe) are never blocked,
// and non-MCP / MCP-without-placeholders rows are unaffected. Mirrors detail-page gating.
//
// `favoritedOverride`: the redesign decouples favorited state into home's per-item favStore, so the
// item object's `favorited` is FROZEN at its stale original value and never reflects a subscribe
// toggle. Callers with access to the live favStore truth (the card/list views) MUST pass it here,
// otherwise an MCP subscribed via the detail page keeps `!item.favorited === true` and can never be
// unsubscribed from the list. Falls back to `item.favorited` when omitted (table column callers).
export function mcpListSubscribeBlocked(
  item: Pick<CapabilityItem, "itemType" | "metadata" | "favorited">,
  favoritedOverride?: boolean,
): boolean {
  const favorited = favoritedOverride ?? item.favorited
  return item.itemType === "mcp" && !favorited && (mcpRequiresPluginRuntime(item.metadata) || detectMcpFields(item.metadata).length > 0)
}

// mcpListBlockReason picks the tooltip for a blocked row: plugin-runtime dependency wins
// over (and is mutually exclusive in practice with) unfilled parameters.
export function mcpListBlockReason(item: Pick<CapabilityItem, "itemType" | "metadata" | "favorited">): "pluginRuntime" | "params" {
  return mcpRequiresPluginRuntime(item.metadata) ? "pluginRuntime" : "params"
}

export function StoreCapabilityTable(props: {
  rows: CapabilityItem[]
  visibleColumns: Record<TableColumnKey, boolean>
  columnOptions: { key: TableColumnKey, label: string }[]
  onToggleColumnVisibility: (key: TableColumnKey) => void
  sort: { by?: ItemSort, order?: ItemOrder }
  onSortChange: (by: ItemSort) => void
  onRowClick: (item: CapabilityItem) => void
  categoryLabel: (slug?: string, category?: Category) => string
  sourceLabel: (value?: string, source?: unknown) => string
  sourceUrl: (value?: string) => string | undefined
  securityLabel: (value: SecurityFilterValue, option?: unknown) => string
  favoriteIconColor: (favorited?: boolean, itemType?: string) => string
  onToggleFavorite?: (item: CapabilityItem) => void
  currentUserId?: string
  currentUserRoles?: string[]
  onDistribute?: (item: CapabilityItem) => void
  distributeTooltip?: string
  formatDate: (iso?: string) => string
  formatSourceMetric: (value?: number, source?: string) => string
  formatCompact: (value: number) => string
  filters: {
    type?: {
      open: boolean
      onOpenChange: (open: boolean) => void
      active: boolean
      appliedValues: string[]
      pendingValues: string[]
      query: string
      onQueryChange: (value: string) => void
      options: OptionItem[]
      togglePending: (value: string) => void
      apply: () => void
      reset: () => void
    }
    category: {
      open: boolean
      onOpenChange: (open: boolean) => void
      active: boolean
      appliedValues: string[]
      pendingValues: string[]
      query: string
      onQueryChange: (value: string) => void
      options: Category[]
      togglePending: (value: string) => void
      apply: () => void
      reset: () => void
    }
    security: {
      open: boolean
      onOpenChange: (open: boolean) => void
      active: boolean
      appliedValues: SecurityFilterValue[]
      pendingValues: SecurityFilterValue[]
      query: string
      onQueryChange: (value: string) => void
      options: unknown[]
      togglePending: (value: SecurityFilterValue) => void
      apply: () => void
      reset: () => void
    }
    source: {
      open: boolean
      onOpenChange: (open: boolean) => void
      active: boolean
      appliedValues: string[]
      pendingValues: string[]
      query: string
      onQueryChange: (value: string) => void
      options: unknown[]
      togglePending: (value: string) => void
      apply: () => void
      reset: () => void
    }
    tag: {
      active: boolean
      appliedValues: string[]
      onApply: (values: string[]) => void
      onReset: () => void
      onTagClick: (slug: string) => void
    }
  }
  labels: {
    title: string
    description: string
    type: string
    category: string
    security: string
    tag: string
    source: string
    experienceScore: string
    favoriteCount: string
    favorite: string
    unfavorite: string
    favoriteTooltip: string
    unfavoriteTooltip: string
    favoriteSignInTooltip: string
    updated: string
    toggleColumns: string
    noResults: string
    reset: string
    confirm: string
    searchCategory: string
    searchSecurity: string
    searchSource: string
    searchTag: string
    tagLimitHint: string
  }
  emptyMessage: string
  typeLabel?: (value: string) => string
  typeColor?: (value: string) => string | undefined
  typeBadge?: (value: string) => { icon: IconProps["name"]; color: string } | undefined
  maxVisibleRows?: number
  fixedRows?: boolean
  searchQuery?: string
}) {
  const language = useLanguage()
  const isColumnVisible = (key: TableColumnKey) => props.visibleColumns[key]
  const stickyHeadClass = "sticky top-0 z-10 bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))]"
  const stickyHeadRowClass = "sticky top-0 z-20 bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))]"
  const sortState = (by: ItemSort) => {
    if (props.sort.by !== by || !props.sort.order) return "none"
    return props.sort.order === "asc" ? "ascending" : "descending"
  }
  const visibleColumnCount = createMemo(() => Object.values(props.visibleColumns).filter(Boolean).length)

  let scrollRef: HTMLDivElement | undefined

  const tableHeight = createMemo(() => {
    const max = props.maxVisibleRows
    if (!max) return undefined
    return `calc(2.5rem + 3.9375rem * ${max} + 1px)`
  })
  const fixed = createMemo(() => props.fixedRows && tableHeight() != null)

  return (
    <div class={cn("flex min-h-0 flex-col overflow-hidden", fixed() ? "shrink-0" : "flex-1")} style={fixed() ? { height: tableHeight(), "max-height": tableHeight() } : undefined}>
      <div ref={scrollRef} class="min-h-0 flex-1 overflow-auto" style={!props.fixedRows && tableHeight() != null ? { "max-height": tableHeight() } : undefined}>
        <table class="w-full min-w-[48rem] table-auto caption-bottom text-sm">
          <thead class={cn("[&_tr]:border-b [&_tr]:border-border", sx.thead)}>
            <tr class={stickyHeadRowClass}>
              <Show when={isColumnVisible("title")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colTitle, stickyHeadClass)}>{props.labels.title}</th>
              </Show>
              <Show when={isColumnVisible("description")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colDescription, stickyHeadClass)}>{props.labels.description}</th>
              </Show>
              <Show when={isColumnVisible("type")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, "w-[6.5rem] min-w-[6.5rem]", stickyHeadClass)}>
                  <Show
                    when={props.filters.type}
                    fallback={props.labels.type}
                  >
                    {(filter) => (
                      <CheckboxHeaderFilter
                        open={filter().open}
                        onOpenChange={filter().onOpenChange}
                        label={props.labels.type}
                        active={filter().active}
                        count={filter().appliedValues.length}
                        query={filter().query}
                        onQueryChange={filter().onQueryChange}
                        placeholder={props.labels.type}
                        options={filter().options}
                        selectedValues={filter().pendingValues}
                        onToggle={filter().togglePending}
                        onReset={filter().reset}
                        onApply={filter().apply}
                        noResultsLabel={props.labels.noResults}
                        resetLabel={props.labels.reset}
                        confirmLabel={props.labels.confirm}
                      />
                    )}
                  </Show>
                </th>
              </Show>
              <Show when={isColumnVisible("category")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colCategory, stickyHeadClass)}>
                  <CheckboxHeaderFilter
                    open={props.filters.category.open}
                    onOpenChange={props.filters.category.onOpenChange}
                    label={props.labels.category}
                    active={props.filters.category.active}
                    count={props.filters.category.appliedValues.length}
                    query={props.filters.category.query}
                    onQueryChange={props.filters.category.onQueryChange}
                    placeholder={props.labels.searchCategory}
                    options={props.filters.category.options.map((cat) => ({ value: cat.slug, label: props.categoryLabel(cat.slug, cat) }))}
                    selectedValues={props.filters.category.pendingValues}
                    onToggle={props.filters.category.togglePending}
                    onReset={props.filters.category.reset}
                    onApply={props.filters.category.apply}
                    noResultsLabel={props.labels.noResults}
                    resetLabel={props.labels.reset}
                    confirmLabel={props.labels.confirm}
                  />
                </th>
              </Show>
              <Show when={isColumnVisible("security")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colSecurity, stickyHeadClass)}>
                  <CheckboxHeaderFilter
                    open={props.filters.security.open}
                    onOpenChange={props.filters.security.onOpenChange}
                    label={props.labels.security}
                    active={props.filters.security.active}
                    count={props.filters.security.appliedValues.length}
                    query={props.filters.security.query}
                    onQueryChange={props.filters.security.onQueryChange}
                    placeholder={props.labels.searchSecurity}
                    options={props.filters.security.options.map((option) => ({ value: (option as { value: string }).value, label: props.securityLabel((option as { value: string }).value as SecurityFilterValue, option) }))}
                    selectedValues={props.filters.security.pendingValues}
                    onToggle={(value) => props.filters.security.togglePending(value as SecurityFilterValue)}
                    onReset={props.filters.security.reset}
                    onApply={props.filters.security.apply}
                    noResultsLabel={props.labels.noResults}
                    resetLabel={props.labels.reset}
                    confirmLabel={props.labels.confirm}
                  />
                </th>
              </Show>
              <Show when={isColumnVisible("tag")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colTag, stickyHeadClass)}>
                  <TagFilterDropdown
                    label={props.labels.tag}
                    active={props.filters.tag.active}
                    appliedValues={props.filters.tag.appliedValues}
                    onApply={props.filters.tag.onApply}
                    onReset={props.filters.tag.onReset}
                    noResultsLabel={props.labels.noResults}
                    resetLabel={props.labels.reset}
                    confirmLabel={props.labels.confirm}
                    searchPlaceholder={props.labels.searchTag}
                    limitHint={props.labels.tagLimitHint}
                  />
                </th>
              </Show>
              <Show when={isColumnVisible("source")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colSource, stickyHeadClass)}>
                  <CheckboxHeaderFilter
                    open={props.filters.source.open}
                    onOpenChange={props.filters.source.onOpenChange}
                    label={props.labels.source}
                    active={props.filters.source.active}
                    count={props.filters.source.appliedValues.length}
                    query={props.filters.source.query}
                    onQueryChange={props.filters.source.onQueryChange}
                    placeholder={props.labels.searchSource}
                    options={props.filters.source.options.map((source) => ({ value: (source as { value: string }).value, label: props.sourceLabel((source as { value: string }).value, source) || (source as { value: string }).value }))}
                    selectedValues={props.filters.source.pendingValues}
                    onToggle={props.filters.source.togglePending}
                    onReset={props.filters.source.reset}
                    onApply={props.filters.source.apply}
                    noResultsLabel={props.labels.noResults}
                    resetLabel={props.labels.reset}
                    confirmLabel={props.labels.confirm}
                  />
                </th>
              </Show>
              <Show when={isColumnVisible("experienceScore")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colExperienceScore, stickyHeadClass)} aria-sort={sortState("experienceScore")}>
                  <button type="button" class={st.sort(props.sort.by === "experienceScore")} onClick={() => props.onSortChange("experienceScore")}>
                    <span>{props.labels.experienceScore}</span>
                    <span class={sx.sortIcon} aria-hidden="true">
                      <span class={st.arrow("up", props.sort.by === "experienceScore" && props.sort.order === "asc")} />
                      <span class={st.arrow("down", props.sort.by === "experienceScore" && props.sort.order === "desc")} />
                    </span>
                  </button>
                </th>
              </Show>
              <Show when={isColumnVisible("favorite")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colFavorite, stickyHeadClass)} aria-sort={sortState("favoriteCount")}>
                  <button type="button" class={st.sort(props.sort.by === "favoriteCount")} onClick={() => props.onSortChange("favoriteCount")}>
                    <span>{props.labels.favoriteCount}</span>
                    <span class={sx.sortIcon} aria-hidden="true">
                      <span class={st.arrow("up", props.sort.by === "favoriteCount" && props.sort.order === "asc")} />
                      <span class={st.arrow("down", props.sort.by === "favoriteCount" && props.sort.order === "desc")} />
                    </span>
                  </button>
                </th>
              </Show>
              <Show when={isColumnVisible("updated")}>
                <th class={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", sx.th, sx.colUpdated, stickyHeadClass)} aria-sort={sortState("updatedAt")}>
                  <button type="button" class={st.sort(props.sort.by === "updatedAt")} onClick={() => props.onSortChange("updatedAt")}>
                    <span>{props.labels.updated}</span>
                    <span class={sx.sortIcon} aria-hidden="true">
                      <span class={st.arrow("up", props.sort.by === "updatedAt" && props.sort.order === "asc")} />
                      <span class={st.arrow("down", props.sort.by === "updatedAt" && props.sort.order === "desc")} />
                    </span>
                  </button>
                </th>
              </Show>
              <th class={cn("h-10 w-8 min-w-8 px-1 align-middle", stickyHeadClass)}>
                <ColumnToggleMenu
                  columnOptions={props.columnOptions}
                  isColumnVisible={isColumnVisible}
                  onToggleColumnVisibility={props.onToggleColumnVisibility}
                  label={props.labels.toggleColumns}
                />
              </th>
            </tr>
          </thead>
          <tbody class="[&_tr:last-child]:border-0">
            <Show when={props.rows.length > 0} fallback={<StoreTableEmptyState colSpan={visibleColumnCount()} message={props.emptyMessage} />}>
              <For each={props.rows}>
                {(item) => (
                  <tr class={cn("border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted h-[3.9375rem]", sx.row)} onClick={() => props.onRowClick(item)}>
                <Show when={isColumnVisible("title")}>
                  <td class={cn("relative p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colTitle)}>
                    <Show when={props.typeColor?.(item.itemType)}>
                      {(color) => (
                        <span
                          aria-hidden="true"
                          class="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-r-full"
                          style={{ "background-color": `color-mix(in oklab, ${color()} 55%, transparent)` }}
                        />
                      )}
                    </Show>
                    <div class="flex min-w-0 items-center gap-2">
                      <Show when={props.typeBadge?.(item.itemType)}>
                        {(badge) => (
                          <span
                            class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg"
                            style={{ "background-color": `color-mix(in oklab, ${badge().color} 16%, transparent)`, color: badge().color }}
                            title={props.typeLabel?.(item.itemType)}
                          >
                            <Icon name={badge().icon} size="small" />
                          </span>
                        )}
                      </Show>
                      <div class="flex min-w-0 flex-1 items-center gap-1.5">
                        <span class={cn(sx.item, "truncate text-[15px] font-bold leading-5 text-[color:color-mix(in_oklab,var(--native-foreground)_80%,white_20%)]")} style={{ "font-weight": 700 }} title={item.name}>
                          <HighlightText text={item.name} query={props.searchQuery} />
                        </span>
                        <Show when={item.createdBy !== "system"}>
                          <span
                            class="inline-flex shrink-0 items-center rounded-md px-1 py-0.5 text-[var(--native-primary)]"
                            style={{ "background-color": "color-mix(in oklab, var(--native-primary) 18%, transparent)" }}
                            title={language.t("store.item.userUploaded")}
                          >
                            <Icon name="cloud-upload" size="small" />
                          </span>
                        </Show>
                        <FromPluginBadge name={item.parentPluginName} />
                      </div>
                    </div>
                  </td>
                </Show>
                <Show when={isColumnVisible("description")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colDescription, sx.mut)}>
                    <span class="block max-h-10 overflow-hidden leading-5" style={MULTILINE_CLAMP_STYLE} title={pickItemDescription(item, language.locale()) || "—"}>
                      <HighlightText text={pickItemDescription(item, language.locale()) || "—"} query={props.searchQuery} />
                    </span>
                  </td>
                </Show>
                <Show when={isColumnVisible("type")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, "w-[6.5rem] min-w-[6.5rem]", sx.mut)}>
                    <HighlightText text={props.typeLabel ? props.typeLabel(item.itemType) : item.itemType} query={props.searchQuery} />
                  </td>
                </Show>
                <Show when={isColumnVisible("category")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colCategory, sx.mut)}>
                    {item.category ? <HighlightText text={props.categoryLabel(item.category) || item.category} query={props.searchQuery} /> : "—"}
                  </td>
                </Show>
                <Show when={isColumnVisible("security")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colSecurity)}>
                    <SecurityTag status={item.securityStatus} />
                  </td>
                </Show>
                <Show when={isColumnVisible("tag")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colTag, sx.mut)}>
                    <TagCell tags={item.tags} appliedTagFilters={props.filters.tag.appliedValues} onTagClick={props.filters.tag.onTagClick} />
                  </td>
                </Show>
                <Show when={isColumnVisible("source")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colSource, sx.mut)}>
                    <Show when={props.sourceUrl(item.source)} fallback={<span class="block max-h-10 overflow-hidden leading-5" style={MULTILINE_CLAMP_STYLE} title={props.sourceLabel(item.source) || item.source || "—"}><HighlightText text={props.sourceLabel(item.source) || item.source || "—"} query={props.searchQuery} /></span>}>
                      {(url) => (
                        <a href={url()} target="_blank" rel="noreferrer" class="block max-h-10 cursor-pointer overflow-hidden leading-5 text-[#478be6] underline-offset-2 hover:text-[#478be6] hover:underline" style={MULTILINE_CLAMP_STYLE} title={props.sourceLabel(item.source) || item.source || "—"} onClick={(e) => e.stopPropagation()}>
                          <HighlightText text={props.sourceLabel(item.source) || item.source || "—"} query={props.searchQuery} />
                        </a>
                      )}
                    </Show>
                  </td>
                </Show>
                <Show when={isColumnVisible("experienceScore")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colExperienceScore, sx.mut)} title={props.formatSourceMetric(item.experienceScore, item.source)}>
                    {props.formatSourceMetric(item.experienceScore, item.source)}
                  </td>
                </Show>
                <Show when={isColumnVisible("favorite")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colFavorite, sx.mut)}>
                    <div class="inline-flex h-4 items-center justify-center gap-1.5 align-middle">
                      <button
                        type="button"
                        class="inline-flex size-6 items-center justify-center rounded-full transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)] active:bg-[color:color-mix(in_oklab,var(--native-foreground)_16%,transparent)]] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!props.onToggleFavorite || mcpListSubscribeBlocked(item)}
                        title={mcpListSubscribeBlocked(item) ? language.t(mcpListBlockReason(item) === "pluginRuntime" ? "store.detail.mcpConfig.pluginRuntimeReason" : "store.detail.mcpConfig.gateReason") : item.favorited ? props.labels.unfavoriteTooltip : props.labels.favoriteTooltip}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation()
                          if (mcpListSubscribeBlocked(item)) return
                          props.onToggleFavorite?.(item)
                        }}
                      >
                        <LocalIcon name={item.favorited ? "subscribe-filled" : "subscribe"} size="small" style={{ color: props.favoriteIconColor(item.favorited, item.itemType) }} />
                      </button>
                      <span class="inline-flex h-4 items-center leading-4" title={(item.favoriteCount ?? 0).toLocaleString()}>
                        {props.formatCompact(item.favoriteCount ?? 0)}
                      </span>
                    </div>
                  </td>
                </Show>
                <Show when={isColumnVisible("updated")}>
                  <td class={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", sx.td, sx.colUpdated, sx.mut)}>
                    {props.formatDate(item.updatedAt)}
                  </td>
                </Show>
                <td class="w-8 min-w-8 px-1"></td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  )
}

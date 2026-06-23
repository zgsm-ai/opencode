import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { type CapabilityItem } from "../lib/api"
import { detectMcpFields, mcpRequiresPluginRuntime } from "../lib/mcp-config"
import { useLanguage } from "@/context/language"
import { st, sx } from "../lib/styles"

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

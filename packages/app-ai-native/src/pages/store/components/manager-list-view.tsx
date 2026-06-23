// Manager 列式视图：借鉴 store-list-view 的卡片行视觉语言（圆角卡片 / type 色 media tile /
// 标题·描述·元信息三段式 / 柔和阴影），但面向「管理」场景做出区别：
//   - 左侧多选 checkbox（批量删除）
//   - 右侧不是订阅/评分，而是 hover 显示的管理操作（编辑 / 移动 / 删除）
//   - 行 hover 不做主页那种右移引导（管理场景强调操作而非"点进去看"），仅边框/阴影渐变
// 与 store-list-view 共享 StoreIcon / SecurityTag / FromPluginBadge，保持同一套设计 token。

import { For, Show, createEffect, createMemo, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import type { CapabilityItem } from "../lib/api"
import { pickItemDescription } from "../lib/item-description"
import { HighlightText } from "./store-capability-table"
import SecurityTag from "./security-tag"
import FromPluginBadge from "./from-plugin-badge"
import { StoreIcon, type StoreIconName } from "../lib/store-icons"

const TYPE_ICON_NAMES = new Set<StoreIconName>(["skill", "subagent", "command", "mcp", "plugin"])
function typeIconName(itemType: string): StoreIconName {
  return TYPE_ICON_NAMES.has(itemType as StoreIconName) ? (itemType as StoreIconName) : "all"
}

export interface ManagerListViewProps {
  rows: CapabilityItem[]
  onRowClick: (item: CapabilityItem) => void
  typeLabel: (v: string) => string
  typeColor: (v: string) => string | undefined
  categoryLabel: (slug: string) => string
  formatDate: (iso?: string) => string
  searchQuery: string
  emptyMessage: string
  // Multi-select (optional)
  selectable?: boolean
  selectedIds?: Record<string, boolean>
  allOnPageSelected?: boolean
  someOnPageSelected?: boolean
  onToggleRow?: (id: string, checked: boolean) => void
  onToggleAll?: (checked: boolean) => void
  selectAllLabel?: string
  selectRowLabel?: string
  // Management actions (shown on hover). Any subset may be provided.
  onEdit?: (item: CapabilityItem) => void
  onMove?: (item: CapabilityItem) => void
  onDelete?: (item: CapabilityItem) => void
  editLabel?: string
  moveLabel?: string
  deleteLabel?: string
}

export function ManagerListView(props: ManagerListViewProps): JSX.Element {
  const language = useLanguage()
  const hasActions = createMemo(() => Boolean(props.onEdit || props.onMove || props.onDelete))

  return (
    <Show
      when={props.rows.length > 0}
      fallback={
        <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_oklab,var(--native-border)_36%,transparent)] px-6 py-14 text-center text-[0.8125rem] text-[var(--native-muted)]">
          {props.emptyMessage}
        </div>
      }
    >
      <div class="flex flex-col gap-[0.6875rem]">
        {/* Select-all bar — the card list has no table header, so the page-level
            select-all lives here when selection is enabled. */}
        <Show when={props.selectable}>
          <label class="flex cursor-pointer items-center gap-2.5 px-[1.125rem] py-1 text-[12px] font-semibold text-[var(--native-muted)]">
            <input
              type="checkbox"
              class="cursor-pointer align-middle"
              aria-label={props.selectAllLabel}
              checked={Boolean(props.allOnPageSelected)}
              ref={(el) => createEffect(() => (el.indeterminate = Boolean(props.someOnPageSelected)))}
              onChange={(e) => props.onToggleAll?.(e.currentTarget.checked)}
            />
            <span>{props.selectAllLabel}</span>
          </label>
        </Show>

        <For each={props.rows}>
          {(item) => <ManagerListRow item={item} p={props} language={language} hasActions={hasActions()} />}
        </For>
      </div>
    </Show>
  )
}

function ManagerListRow(props: {
  item: CapabilityItem
  p: ManagerListViewProps
  language: ReturnType<typeof useLanguage>
  hasActions: boolean
}): JSX.Element {
  const view = props.p
  const item = () => props.item
  const accent = () => view.typeColor(item().itemType) ?? "var(--native-muted)"
  const description = () => pickItemDescription(item(), props.language.locale())
  const selected = () => Boolean(view.selectedIds?.[item().id])

  return (
    <div
      role="button"
      tabindex="0"
      onClick={() => view.onRowClick(item())}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          view.onRowClick(item())
        }
      }}
      class={cn(
        "group relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[1rem] border px-[1.125rem] py-3.5 transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        selected()
          ? "border-[color:color-mix(in_oklab,var(--native-primary)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_7%,var(--native-panel))]"
          : "border-[color:color-mix(in_oklab,var(--native-border)_28%,transparent)] bg-[var(--native-panel)] hover:border-[color:color-mix(in_oklab,var(--native-border)_55%,transparent)] hover:shadow-[var(--native-shadow-md)]",
      )}
    >
      {/* Multi-select checkbox */}
      <Show when={view.selectable}>
        <span class="relative z-[1] flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            class="cursor-pointer align-middle"
            aria-label={view.selectRowLabel}
            checked={selected()}
            onChange={(e) => view.onToggleRow?.(item().id, e.currentTarget.checked)}
          />
        </span>
      </Show>

      {/* type 色 media tile（与主页同款 StoreIcon） */}
      <span
        class="relative z-[1] flex size-11 shrink-0 items-center justify-center rounded-[0.8125rem] border"
        style={{
          "background-color": `color-mix(in oklab, ${accent()} 14%, transparent)`,
          "border-color": `color-mix(in oklab, ${accent()} 26%, transparent)`,
          color: accent(),
        }}
      >
        <StoreIcon name={typeIconName(item().itemType)} size={18} />
      </span>

      {/* 中部：标题 / 描述 / 元信息 */}
      <div class="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="truncate [font-family:var(--native-font-display)] text-[16px] font-black leading-5 text-[var(--native-foreground)]"
            title={item().name}
          >
            <HighlightText text={item().name} query={view.searchQuery} />
          </span>
          {/* type chip — manager 用类型标签替代主页的来源印章，强调"我管理的资源类型" */}
          <span
            class="inline-flex h-[1.375rem] shrink-0 items-center whitespace-nowrap rounded-[var(--native-radius-full)] px-2 text-[11px] font-bold"
            style={{
              "background-color": `color-mix(in oklab, ${accent()} 13%, transparent)`,
              color: accent(),
            }}
          >
            {view.typeLabel(item().itemType)}
          </span>
          <FromPluginBadge name={item().parentPluginName} />
          <Show when={item().securityStatus}>
            <SecurityTag status={item().securityStatus} />
          </Show>
        </div>

        <Show when={description()}>
          <div
            class="mt-1.5 max-w-[35rem] truncate text-[12.5px] font-semibold text-[var(--native-muted)]"
            title={description()}
          >
            <HighlightText text={description()} query={view.searchQuery} />
          </div>
        </Show>

        <div class="mt-1.5 flex flex-wrap items-center gap-[0.5625rem] text-[12px] font-semibold text-[var(--native-dim)]">
          <Show when={item().category}>
            <span class="inline-flex items-center gap-1 text-[11.5px] text-[var(--native-muted)]">
              <StoreIcon name="layers" size={12} />
              {view.categoryLabel(item().category) || item().category}
            </span>
          </Show>
          <Show when={item().updatedAt}>
            <Show when={item().category}>
              <span aria-hidden="true" class="opacity-45">·</span>
            </Show>
            <span class="inline-flex items-center gap-1 [font-variant-numeric:tabular-nums]">
              <StoreIcon name="clock" size={12} />
              {view.formatDate(item().updatedAt)}
            </span>
          </Show>
        </div>
      </div>

      {/* 右侧管理操作：默认半隐，hover/选中时显现，与主页"评分+订阅"形成区别 */}
      <Show when={props.hasActions}>
        <div
          class="relative z-[1] flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Show when={view.onEdit}>
            <button
              type="button"
              class="cursor-pointer rounded-[var(--native-radius-md)] px-2.5 py-1 text-[12px] font-semibold text-[var(--native-muted)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_6%,transparent)] hover:text-[var(--native-foreground)]"
              onClick={() => view.onEdit?.(item())}
            >
              {view.editLabel}
            </button>
          </Show>
          <Show when={view.onMove}>
            <button
              type="button"
              class="cursor-pointer rounded-[var(--native-radius-md)] px-2.5 py-1 text-[12px] font-semibold text-[var(--native-muted)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_6%,transparent)] hover:text-[var(--native-foreground)]"
              onClick={() => view.onMove?.(item())}
            >
              {view.moveLabel}
            </button>
          </Show>
          <Show when={view.onDelete}>
            <button
              type="button"
              class="cursor-pointer rounded-[var(--native-radius-md)] px-2.5 py-1 text-[12px] font-semibold text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)]"
              onClick={() => view.onDelete?.(item())}
            >
              {view.deleteLabel}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default ManagerListView

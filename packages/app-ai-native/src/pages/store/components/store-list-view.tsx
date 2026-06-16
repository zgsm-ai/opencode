// 列式（stack 行）视图：每条能力渲染为一行 srow，1:1 对照设计稿
// `.playwright-mcp/store-list-switch.html` 的 `colTpl()` + `.list.col`/`.srow`/`.srow.ent`/
// `.wm`/`.media`/`.smid`/`.stitle`/`.nm`/`.sdesc`/`.sline`/`.smetrics`/`.risk`/`.catchip`/
// `.tag`/`.seal`/`.upd`/`.score`。
//
// 布局：左 media（type 色图标，大客户则白底 logo）+ 中 smid（标题行 / 描述行 / 元信息行）
// + 右 smetrics（评分 + 订阅）。大客户命中时整行套金边 + .seal 金色印章 + logo 水印背景，
// 并用 useLogoColor 从 logo 抽主题色注入 `--bc` 作为金边/水印混色基准。
//
// 紧凑度：行内 `gap 14px + padding 14px 18px`，media 44px，标题/描述单行省略（对照设计稿
// .srow 高度感，不撑满、不加大行高）。
//
// 共享元素过渡：每行挂 `view-transition-name: vt-item-<id>`，媒体挂 `vt-media-<id>`，
// 标题挂 `vt-name-<id>`，与 store-card-grid 完全一致，配合 lib/view-transition.ts 的 applyStagger。
//
// 图标统一走 StoreIcon（设计稿 P 图标集 1:1 端口），不使用 @opencode-ai/ui/icon 或 LocalIcon。
//
// props 契约 StoreItemViewProps 与 store-card-grid 完全相同，便于卡片⇄列式无缝切换。

import { For, Show, createMemo, type JSX } from "solid-js"
import { type IconProps } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import type { CapabilityItem } from "../lib/api"
import { pickItemDescription } from "../lib/item-description"
import { HighlightText, mcpListSubscribeBlocked } from "./store-capability-table"
import SecurityTag from "./security-tag"
import FromPluginBadge from "./from-plugin-badge"
import { SubscribeButton } from "./subscribe-button"
import { matchEnterprise, matchEnterpriseByName, type EnterpriseInfo } from "../lib/enterprise"
import { useLogoColor } from "../lib/use-logo-color"
import { StoreIcon, type StoreIconName } from "../lib/store-icons"

export interface StoreItemViewProps {
  rows: CapabilityItem[]
  onRowClick: (item: CapabilityItem) => void
  typeLabel: (v: string) => string
  typeColor: (v: string) => string | undefined
  typeIcon: (v: string) => IconProps["name"]
  categoryLabel: (slug: string) => string
  formatSourceMetric: (value?: number, source?: string) => string
  formatDate: (iso?: string) => string
  searchQuery: string
  onToggleFavorite: (item: CapabilityItem) => void
  // Reactive favorite state per item, sourced from home's per-item store (NOT the item object) so
  // a subscribe toggle never replaces the item / rebuilds this row. Read it reactively in render.
  favoriteState: (item: CapabilityItem) => { favorited: boolean; favoriteCount: number }
  favoriteActionItemId: string | null
  isAuthenticated: boolean
  favoriteLabels: { subscribe: string; subscribed: string; tooltip: string }
  emptyMessage: string
}

const MAX_TAGS = 3
const TYPE_ICON_NAMES = new Set<StoreIconName>(["skill", "subagent", "command", "mcp", "plugin"])

// Map a CapabilityItem.itemType to a StoreIcon name (mock's `media()` calls `svg(it.type,…)`
// directly; type values skill/subagent/command/mcp/plugin are valid StoreIconNames).
function typeIconName(itemType: string): StoreIconName {
  return TYPE_ICON_NAMES.has(itemType as StoreIconName) ? (itemType as StoreIconName) : "all"
}

export function StoreListView(props: StoreItemViewProps): JSX.Element {
  const language = useLanguage()

  return (
    <Show
      when={props.rows.length > 0}
      fallback={
        <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_oklab,var(--native-border)_36%,transparent)] px-6 py-14 text-center text-[0.8125rem] text-[var(--native-muted)]">
          {props.emptyMessage}
        </div>
      }
    >
      {/* .list.col：flex 纵向 gap 11px */}
      <div class="flex flex-col gap-[0.6875rem]">
        <For each={props.rows}>{(item) => <StoreListRow item={item} parentProps={props} language={language} />}</For>
      </div>
    </Show>
  )
}

function StoreListRow(props: {
  item: CapabilityItem
  parentProps: StoreItemViewProps
  language: ReturnType<typeof useLanguage>
}): JSX.Element {
  const view = props.parentProps
  // Accessor (not a snapshot const) so every `item()` read tracks reactively — aligned with
  // store-card-grid's StoreCard. A subscribe toggle keeps the same item reference (favorited is
  // decoupled into home's per-item store), so this row / its SubscribeButton instance is never
  // rebuilt and the width FLIP + color animation play on the same instance.
  const item = () => props.item
  const enterprise = createMemo<EnterpriseInfo | null>(
    () => matchEnterprise(item().createdBy) ?? matchEnterpriseByName(item().name),
  )
  // 抽 logo 主题色（仅大客户命中时有意义）；非命中传 undefined，hook 内部回退中性色。
  const brandColor = useLogoColor(() => enterprise()?.logo)
  const accent = () => view.typeColor(item().itemType) ?? "var(--native-muted)"
  const description = () => pickItemDescription(item(), props.language.locale())
  const tags = () => (item().tags ?? []).slice(0, MAX_TAGS)
  const scoreText = () => view.formatSourceMetric(item().experienceScore, item().source)
  // Favorite state from home's per-item store (reactive; decoupled from the item object so a
  // toggle flips `favorited` on the SAME SubscribeButton instance instead of remounting the row).
  const favState = createMemo(() => view.favoriteState(item()))

  return (
    // .srow：gap 14px / padding 14px 18px / 圆角 16px。.srow.ent 金边 + 抽色背景。
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
        // hover 丝滑：transform/border/shadow 同一缓动(ease-out-back-ish cubic-bezier)与时长(220ms)，
        // will-change-transform 提升合成层避免位移抖动；hover 时平滑右移 + 边框/阴影渐入。
        // PERF: will-change 仅在 :hover 时生效 — 静态 will-change 会让 15 行各自常驻一个合成层
        // （额外显存/合成层）。hover:will-change-transform 让浏览器仅在 hover 时提升、离开后释放。
        "group relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[1rem] px-[1.125rem] py-3.5 transition-[transform,border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:translate-x-[3px] hover:shadow-[var(--native-shadow-md)] hover:will-change-transform",
        enterprise()
          ? "border border-[color:color-mix(in_oklab,var(--bc)_36%,var(--native-border))] bg-[linear-gradient(100deg,color-mix(in_oklab,var(--bc)_12%,var(--native-panel)),var(--native-panel)_46%)] hover:border-[color:color-mix(in_oklab,var(--bc)_55%,var(--native-border))]"
          : "border border-[color:color-mix(in_oklab,var(--native-border)_28%,transparent)] bg-[var(--native-panel)] hover:border-[color:color-mix(in_oklab,var(--native-border)_55%,transparent)]",
      )}
      style={{
        "view-transition-name": `vt-item-${item().id}`,
        ...(enterprise() ? { "--bc": brandColor() } : {}),
      }}
    >
      {/* 大客户 logo 水印背景（设计稿 .srow.ent .wm：168px opacity .07）。
          加圆角柔化方形边缘，避免水印硬切（低透明度，圆角即可，无需边框）。 */}
      <Show when={enterprise()}>
        {(ent) => (
          <img
            src={ent().logo}
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute right-[-26px] top-1/2 z-0 size-[168px] -translate-y-1/2 rounded-[24px] object-contain opacity-[0.07]"
          />
        )}
      </Show>

      {/* 媒体（设计稿 .media 44px 圆角 13）：大客户白底 logo，否则 type 色图标 tile */}
      <Show
        when={enterprise()}
        fallback={
          <span
            class="relative z-[1] flex size-11 shrink-0 items-center justify-center rounded-[0.8125rem] border"
            style={{
              "background-color": `color-mix(in oklab, ${accent()} 14%, transparent)`,
              "border-color": `color-mix(in oklab, ${accent()} 26%, transparent)`,
              color: accent(),
              "view-transition-name": `vt-media-${item().id}`,
            }}
          >
            <StoreIcon name={typeIconName(item().itemType)} size={18} />
          </span>
        }
      >
        {(ent) => (
          // 白底 logo tile：圆角 11px + 1px 细边框 + 内边距 1.5（6px）让 logo 有呼吸、不顶边，
          // 避免方形无圆角带来的突兀感（贴合 .srow .media 44px 尺寸）。
          <span
            class="relative z-[1] flex size-11 shrink-0 items-center justify-center rounded-[11px] border border-[color:color-mix(in_srgb,var(--native-border)_60%,transparent)] bg-[#fff] p-1.5"
            style={{ "view-transition-name": `vt-media-${item().id}` }}
          >
            <img src={ent().logo} alt={ent().name} class="size-full rounded-[5px] object-contain" />
          </span>
        )}
      </Show>

      {/* 中部 .smid：标题 / 描述 / 元信息 */}
      <div class="relative z-[1] flex min-w-0 flex-1 flex-col">
        {/* 标题行 .stitle：名称（16px/900 加粗突出）+ 来源（大客户 .seal / 用户上传 .pill-soft）+ 插件徽标 + 风险 */}
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="truncate [font-family:var(--native-font-display)] text-[16px] font-black leading-5 text-[var(--native-foreground)]"
            style={{ "view-transition-name": `vt-name-${item().id}` }}
            title={item().name}
          >
            <HighlightText text={item().name} query={view.searchQuery} />
          </span>

          {/* 来源标识：官方不显示；大客户 → .seal 金色印章；用户上传 → .pill-soft */}
          <Show
            when={enterprise()}
            fallback={
              <Show when={item().createdBy !== "system"}>
                {/* .pill .pill-soft「用户上传」：设计稿 background:var(--pill-bg)/color:var(--fg-muted)，
                    淡中性底。浅色 #0000000a（淡黑）/ 深色 #ffffff0d（淡白），双主题靠
                    [data-color-scheme=dark] 祖先变体翻转；文字仍用 --native-muted（对齐 --fg-muted）。 */}
                <span class="inline-flex h-[1.375rem] shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--native-radius-full)] bg-[#0000000a] px-2 text-[12px] font-semibold text-[var(--native-muted)] [[data-color-scheme=dark]_&]:bg-[#ffffff0d]">
                  <StoreIcon name="upload" size={12} />
                  {props.language.t("store.item.userUploaded")}
                </span>
              </Show>
            }
          >
            {(ent) => (
              // .seal：改用 logo 抽出的品牌色 var(--bc) 做辨识度（招行行=红印章 / 建行行=蓝印章，
              // 肉眼可区分）。品牌色淡底 14% + 品牌色淡边 35% + 品牌色文字/circle-check，保持小巧精致
              // （尺寸/字重与原金色印章一致，不抢眼）。
              <span
                class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--native-radius-full)] border border-[color:color-mix(in_oklab,var(--bc)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--bc)_14%,transparent)] py-[2px] pl-[5px] pr-[7px] text-[10.5px] font-extrabold text-[var(--bc)]"
                title={ent().name}
              >
                <StoreIcon name="checkCircle" size={11} style={{ color: "var(--bc)" }} />
                {ent().name}
              </span>
            )}
          </Show>

          <FromPluginBadge name={item().parentPluginName} />
          <Show when={item().securityStatus}>
            <SecurityTag status={item().securityStatus} />
          </Show>
        </div>

        {/* 描述行 .sdesc（单行截断，max-width 35rem ≈ 560px） */}
        <Show when={description()}>
          <div class="mt-1.5 max-w-[35rem] truncate text-[12.5px] font-semibold text-[var(--native-muted)]" title={description()}>
            <HighlightText text={description()} query={view.searchQuery} />
          </div>
        </Show>

        {/* 元信息行 .sline：分类 · 标签 · 时钟更新（.d 分隔点 opacity .45） */}
        <div class="mt-1.5 flex flex-wrap items-center gap-[0.5625rem] text-[12px] font-semibold text-[var(--native-dim)]">
          {/* .catchip：layers 图标 + 分类名 */}
          <Show when={item().category}>
            <span class="inline-flex items-center gap-1 text-[11.5px] text-[var(--native-muted)]">
              <StoreIcon name="layers" size={12} />
              {view.categoryLabel(item().category) || item().category}
            </span>
          </Show>
          <Show when={item().category && tags().length > 0}>
            <span aria-hidden="true" class="opacity-45">
              ·
            </span>
          </Show>
          {/* .tag：#slug */}
          <Show when={tags().length > 0}>
            <span class="inline-flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--native-dim)]">
              <For each={tags()}>{(tag) => <span class="whitespace-nowrap">#{tag.slug}</span>}</For>
            </span>
          </Show>
          {/* clock 图标 + 更新时间 */}
          <Show when={item().updatedAt}>
            <span aria-hidden="true" class="opacity-45">
              ·
            </span>
            <span class="inline-flex items-center gap-1 [font-variant-numeric:tabular-nums]">
              <StoreIcon name="clock" size={12} />
              {view.formatDate(item().updatedAt)}
            </span>
          </Show>
        </div>
      </div>

      {/* 右侧 .smetrics（gap 15px）：评分 .score + 订阅按钮 */}
      <div class="relative z-[1] flex shrink-0 items-center gap-[0.9375rem]">
        <Show
          when={scoreText() !== "—"}
          fallback={<span class="text-[13.5px] font-semibold text-[var(--native-muted)]">—</span>}
        >
          {/* .score：金色 star（filled）+ 数值 */}
          <span class="inline-flex items-center gap-1 text-[13.5px] font-extrabold text-[#f0b542]">
            <StoreIcon name="star" size={15} filled style={{ color: "#f0b542" }} />
            {scoreText()}
          </span>
        </Show>
        <SubscribeButton
          item={item()}
          favorited={favState().favorited}
          favoriteCount={favState().favoriteCount}
          pending={view.favoriteActionItemId === item().id}
          authenticated={view.isAuthenticated}
          disabled={mcpListSubscribeBlocked(item(), favState().favorited)}
          onToggle={view.onToggleFavorite}
          labels={view.favoriteLabels}
        />
      </div>
    </div>
  )
}

export default StoreListView

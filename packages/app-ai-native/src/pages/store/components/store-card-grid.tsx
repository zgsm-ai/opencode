import { For, Show, createMemo, type JSX } from "solid-js"
import { type IconProps } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import type { CapabilityItem } from "../lib/api"
import { HighlightText, mcpListSubscribeBlocked } from "./store-capability-table"
import { pickItemDescription } from "../lib/item-description"
import SecurityTag from "./security-tag"
import FromPluginBadge from "./from-plugin-badge"
import { SubscribeButton } from "./subscribe-button"
import { matchEnterprise, matchEnterpriseByName, type EnterpriseInfo } from "../lib/enterprise"
import { useLogoColor } from "../lib/use-logo-color"
import { StoreIcon, type StoreIconName } from "../lib/store-icons"

// Gold accent (设计稿 --gold) used for the enterprise gold edge + score star.
const GOLD = "#E5B645"
const SCORE_GOLD = "#f0b542"

// 设计稿 type 集合（cardTpl 的 media 用 itemType 直接取 StoreIcon）。其余类型回退到通用 grid 图标。
const STORE_TYPE_ICONS = new Set<StoreIconName>(["skill", "mcp", "command", "subagent", "plugin"])
function typeIconName(itemType: string): StoreIconName {
  return STORE_TYPE_ICONS.has(itemType as StoreIconName) ? (itemType as StoreIconName) : "grid"
}

// Shared view props for the store list — injected by home.tsx and shared with the列式 (list)
// view component. The card grid and the list view consume the same contract so home can swap
// them behind a single `viewMode` signal without re-wiring data.
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

/**
 * Card grid view for the store list. 1:1 port of the design mock's `.list.card` / `.gcard`
 * layout (`cardTpl` in `.playwright-mcp/store-list-switch.html`): gradient type-color header
 * (`.ghead`) + logo watermark (`.wm`), a 38px media tile (`.media`), name + 2-line description
 * (`.gbody`), category/risk/plugin chips (`.gchips`), and a score + subscribe footer (`.gfoot`).
 * Enterprise ("大客户") items get the gold-edged treatment (`.gcard.ent`): a masked gold→brand
 * border, a logo watermark, an inline brand lock pill, and a brand-color header gradient
 * extracted from the logo via `useLogoColor`.
 *
 * Icons are the design mock's own `StoreIcon` set (not @opencode-ai/ui/icon or LocalIcon).
 * Each card carries a `view-transition-name` so the card ⇄ list switch animates as shared
 * elements (the media tile and title get their own names for finer cross-fades).
 */
export function StoreCardGrid(props: StoreItemViewProps): JSX.Element {
  return (
    <Show
      when={props.rows.length > 0}
      fallback={
        <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_24%,transparent)] px-6 py-16 text-center text-[0.875rem] text-[var(--native-muted)]">
          {props.emptyMessage}
        </div>
      }
    >
      {/* .list.card: grid repeat(auto-fill,minmax(290px,1fr)) gap 16px */}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
        <For each={props.rows}>{(item) => <StoreCard item={item} view={props} />}</For>
      </div>
    </Show>
  )
}

function StoreCard(props: { item: CapabilityItem; view: StoreItemViewProps }) {
  const language = useLanguage()
  const item = () => props.item
  const view = () => props.view

  const enterprise = createMemo<EnterpriseInfo | null>(
    () => matchEnterprise(item().createdBy) ?? matchEnterpriseByName(item().name),
  )
  // Theme color for branded cards: extracted from the enterprise logo (falls back to the brand
  // border color / primary until extraction resolves).
  const brandColor = useLogoColor(() => enterprise()?.logo)

  const typeColor = createMemo(() => view().typeColor(item().itemType) ?? "var(--native-primary)")
  const description = createMemo(() => pickItemDescription(item(), language.locale()))
  const categoryText = createMemo(() => (item().category ? view().categoryLabel(item().category) || item().category : ""))
  const scoreText = createMemo(() => view().formatSourceMetric(item().experienceScore, item().source))
  const pending = createMemo(() => view().favoriteActionItemId === item().id)
  // Favorite state from home's per-item store (reactive; decoupled from the item object so a
  // toggle flips `favorited` on the SAME SubscribeButton instance instead of remounting the row).
  const favState = createMemo(() => view().favoriteState(item()))

  return (
    <article
      role="button"
      tabindex="0"
      onClick={() => view().onRowClick(item())}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          view().onRowClick(item())
        }
      }}
      // .gcard: bg panel, 1px border, radius 18px, overflow hidden, hover lift + type-color border + shadow.
      // Hover uses a longer 260ms spring-ish ease so the lift / border / shadow glide in (and back
      // out) smoothly; will-change-transform promotes a compositor layer to avoid sub-pixel jitter.
      // PERF: scope will-change to :hover only — a *static* will-change on every card keeps a
      // compositor layer resident for all 15 cards permanently (extra GPU memory / composited
      // layers). hover:will-change-transform lets the browser promote on hover and release after.
      class={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border bg-[var(--native-panel)] transition-[transform,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:shadow-[var(--native-shadow-md)] hover:will-change-transform",
        enterprise()
          ? "border-[color:color-mix(in_oklab,var(--card-brand)_45%,var(--native-border))]"
          : "border-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] hover:border-[color:color-mix(in_oklab,var(--card-type)_55%,var(--native-border))]",
      )}
      style={{
        "view-transition-name": `vt-item-${item().id}`,
        "--card-type": typeColor(),
        ...(enterprise() ? { "--card-brand": brandColor() } : {}),
      }}
    >
      {/* Gold edge for enterprise cards (.gcard.ent::before: masked gold→brand gradient border). */}
      <Show when={enterprise()}>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-[2] rounded-[18px]"
          style={{
            padding: "1px",
            background: `linear-gradient(135deg, color-mix(in oklab, ${GOLD} 70%, transparent), transparent 40%, color-mix(in oklab, var(--card-brand) 55%, transparent))`,
            "-webkit-mask": "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            "-webkit-mask-composite": "xor",
            "mask-composite": "exclude",
          }}
        />
      </Show>

      {/* .ghead: height 62px, padding 11px 14px, type-color (or brand-color) gradient + watermark + media + lock. */}
      <div
        class="relative flex h-[62px] items-start justify-between overflow-hidden px-[14px] py-[11px]"
        style={{
          background: enterprise()
            ? "linear-gradient(135deg, color-mix(in oklab, var(--card-brand) 24%, var(--native-panel)), color-mix(in oklab, var(--card-brand) 6%, var(--native-panel)))"
            : "linear-gradient(135deg, color-mix(in oklab, var(--card-type) 28%, var(--native-panel)), color-mix(in oklab, var(--card-type) 7%, var(--native-panel)))",
        }}
      >
        {/* .ghead .wm: logo watermark for enterprise cards (104px, opacity .1, right -18px). */}
        <Show when={enterprise()}>
          {(info) => (
            <img
              src={info().logo}
              alt=""
              aria-hidden="true"
              class="pointer-events-none absolute right-[-18px] top-1/2 size-[104px] -translate-y-1/2 rounded-[18px] object-contain opacity-10"
            />
          )}
        </Show>

        {/* .media: 38px tile, radius 11px. .media.tic = white tile (type-color icon) / .media.logo = white (logo).
            White rounded square so the type icon reads crisply on the tinted header (both themes use
            bg-[#fff] per design ref); type color stays on the icon. Shared element for the view transition. */}
        <Show
          when={enterprise()}
          fallback={
            <span
              class="relative z-[1] flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-[color:color-mix(in_srgb,var(--native-border)_55%,transparent)] bg-[#fff] shadow-[var(--native-shadow-sm)]"
              style={{
                "view-transition-name": `vt-media-${item().id}`,
                color: typeColor(),
              }}
            >
              <StoreIcon name={typeIconName(item().itemType)} size={18} />
            </span>
          }
        >
          {(info) => (
            <span
              class="relative z-[1] flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[color:color-mix(in_srgb,var(--native-border)_60%,transparent)] bg-[#fff] p-[5px] shadow-[var(--native-shadow-sm)]"
              style={{ "view-transition-name": `vt-media-${item().id}` }}
            >
              <img src={info().logo} alt={info().name} class="size-full object-contain" />
            </span>
          )}
        </Show>

        {/* .lock: enterprise brand seal, or "用户上传" for non-system uploads (glass pill). */}
        <Show
          when={enterprise()}
          fallback={
            <Show when={item().createdBy !== "system"}>
              {/* .lock 玻璃 pill：设计稿 background:var(--glass)/border:var(--glass-bd)，偏白半透明玻璃。
                  浅色 #ffffffcc（实白玻璃）/ #00000012 边；深色 #ffffff14（淡白）/ #ffffff24 边——
                  双主题靠 [data-color-scheme=dark] 祖先变体翻转（项目无 dark: 变体，theme context 写
                  html[data-color-scheme]）。不可用 bg-white（v4 不生成），故用任意值十六进制带 alpha。 */}
              <span class="relative z-[1] inline-flex h-6 items-center gap-1.5 rounded-[var(--native-radius-full)] border border-[#00000012] bg-[#ffffffcc] px-[9px] py-[2px] text-[11.5px] font-bold text-[var(--native-foreground)] backdrop-blur-[6px] [[data-color-scheme=dark]_&]:border-[#ffffff24] [[data-color-scheme=dark]_&]:bg-[#ffffff14]">
                <StoreIcon name="upload" size={12} />
                {language.t("store.item.userUploaded")}
              </span>
            </Show>
          }
        >
          {(info) => (
            // 大客户企业名 pill：用 logo 抽出的品牌色 var(--card-brand) 做辨识度。
            // 文字 + circle-check + 边框都走品牌色（招行红/工行红/建行蓝），背景保留白玻璃为主
            // 并叠极淡品牌色（浅色 10% 于 #ffffffcc 上 / 深色 18% 于 #ffffff14 上），让 pill 微带品牌
            // 色调又不牺牲在 type 色渐变 header 上的可读性（白玻璃底 + 饱和品牌色字，对比足够）。
            <span class="relative z-[1] inline-flex h-6 items-center gap-1.5 rounded-[var(--native-radius-full)] border border-[color:color-mix(in_oklab,var(--card-brand)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--card-brand)_10%,#ffffffcc)] px-[9px] py-[2px] text-[11.5px] font-bold text-[var(--card-brand)] backdrop-blur-[6px] [[data-color-scheme=dark]_&]:bg-[color:color-mix(in_oklab,var(--card-brand)_18%,#ffffff14)]">
              {info().name}
              <StoreIcon name="checkCircle" size={11} style={{ color: "var(--card-brand)" }} />
            </span>
          )}
        </Show>
      </div>

      {/* .gbody: padding 12px 15px 0. .gname (shared element) + .gdesc (2-line clamp). */}
      <div class="px-[15px] pt-[12px]">
        <div
          class="truncate [font-family:var(--native-font-display)] text-[16px] font-black text-[var(--native-foreground)]"
          style={{ "view-transition-name": `vt-name-${item().id}` }}
          title={item().name}
        >
          <HighlightText text={item().name} query={view().searchQuery} />
        </div>
        <p
          class="mt-[5px] min-h-[2.6em] overflow-hidden text-[12.5px] font-semibold leading-[1.5] text-[var(--native-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
          title={description()}
        >
          <HighlightText text={description()} query={view().searchQuery} />
        </p>
      </div>

      {/* .gchips: gap 7px wrap, padding 10px 15px 0. category (.catchip) + risk + from-plugin (.chip). */}
      <div class="flex flex-wrap items-center gap-[7px] px-[15px] pt-[10px]">
        <Show when={categoryText()}>
          {/* .catchip: layers icon + muted 11.5px label */}
          <span class="inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-[var(--native-muted)]">
            <StoreIcon name="layers" size={12} />
            {categoryText()}
          </span>
        </Show>
        <Show when={item().securityStatus}>
          <SecurityTag status={item().securityStatus} />
        </Show>
        <FromPluginBadge name={item().parentPluginName} />
      </div>

      {/* .gfoot: gap 11px, padding 11px 15px 13px, margin-top 10px, top border. score + spacer + subscribe. */}
      <div class="mt-[10px] flex items-center gap-[11px] border-t border-[color:color-mix(in_oklab,var(--native-border)_18%,transparent)] px-[15px] pb-[13px] pt-[11px]">
        {/* .score: 13.5px 800 gold + filled star, or "—" when no source/score */}
        <Show
          when={scoreText() !== "—"}
          fallback={<span class="text-[13.5px] font-semibold text-[var(--native-muted)]">—</span>}
        >
          <span class="inline-flex items-center gap-1 text-[13.5px] font-extrabold" style={{ color: SCORE_GOLD }}>
            <StoreIcon name="star" size={15} filled style={{ color: SCORE_GOLD }} />
            {scoreText()}
          </span>
        </Show>
        {/* .sp spacer */}
        <div class="ml-auto" onClick={(e: MouseEvent) => e.stopPropagation()}>
          <SubscribeButton
            item={item()}
            favorited={favState().favorited}
            favoriteCount={favState().favoriteCount}
            pending={pending()}
            authenticated={view().isAuthenticated}
            disabled={mcpListSubscribeBlocked(item(), favState().favorited)}
            onToggle={view().onToggleFavorite}
            labels={view().favoriteLabels}
          />
        </div>
      </div>
    </article>
  )
}

export default StoreCardGrid

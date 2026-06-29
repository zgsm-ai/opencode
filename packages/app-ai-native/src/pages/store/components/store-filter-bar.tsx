import { createSignal, For, Show, type JSX } from "solid-js"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { StoreIcon } from "../lib/store-icons"

// ─────────────────────────────────────────────────────────────────────────────
// StoreFilterBar — 独立筛选条（P3）
//
// 一行布局（对应设计稿 .fbar）：
//   [分类 ▾] [风险 ▾] [来源 ▾]   <chips ×>   清除筛选        共 N 个(靠右)
//
// 每个下拉用 Kobalte Popover（components/ui/popover，自带 spring 出现动画），
// 多选 checkbox + 每项计数；选中态以下方 chips(× 删除) 呈现，并可一键清除全部。
//
// ── home.tsx 接线契约（按现有 signals 注入，尽量少改 home）──────────────────
//
//   <StoreFilterBar
//     category={{
//       options: categories().map((c) => ({
//         value: c.slug,
//         label: itemFilterOptions.categoryLabel(c.slug, c),
//         count: undefined,                      // 可选：每项命中数（无则不显示）
//       })),
//       appliedValues: appliedCategoryFilters(), // string[]
//       toggle: (v) => { /* 单值切换 + 立即生效（apply 语义合一）*/ },
//       reset: () => { /* 清空该组 */ },
//     }}
//     security={{
//       options: securityOptions().map((o) => ({
//         value: o.value,                         // SecurityRiskGroup: unknown|low|medium|high
//         label: itemFilterOptions.securityRiskGroupLabel(o.value, o),
//       })),
//       appliedValues: appliedSecurityFilters(),  // SecurityRiskGroup[]
//       toggle, reset,
//     }}
//     source={{
//       options: sourceOptions().map((s) => ({
//         value: s.value,
//         label: itemFilterOptions.sourceLabel(s.value, s) || s.value,
//       })),
//       appliedValues: appliedSourceFilters(),     // string[]
//       toggle, reset,
//     }}
//     totalItems={totalItems()}
//     onClearAll={() => { /* 清空三组 */ }}
//     labels={{
//       category: language.t("store.console.capabilities.category"),
//       security: language.t("store.security.riskLevel"),
//       source: language.t("store.home.table.source"),
//       clear: language.t("store.home.filters.clear"),       // 「清除筛选」
//       totalCount: (n) => language.t("store.home.filters.totalCount", { count: n }), // 「共 N 个」
//       riskGroup: language.t(...) (可选，仅用于风险下拉空态等)
//     }}
//   />
//
// 备注：`toggle` 这里采用「点选即生效」（无 pending/apply 两段式），与设计稿一致；
// 如需保留 home 现有 pending→apply 语义，可在 home 侧把 toggle 实现成 setApplied 直写。
// ─────────────────────────────────────────────────────────────────────────────

export type FilterOptionItem = {
  value: string
  label: string
  /** 可选命中计数；为 undefined 时不渲染角标。 */
  count?: number
}

export type FilterGroup<V extends string = string> = {
  options: FilterOptionItem[]
  appliedValues: V[]
  toggle: (value: V) => void
  reset: () => void
}

export type StoreFilterBarLabels = {
  /** 「类型」下拉（仅 manager 等需要 type 组时提供） */
  type?: string
  category: string
  security: string
  source: string
  /** 「标签」下拉（仅 manager 等需要 tag 组时提供） */
  tag?: string
  /** 「清除筛选」 */
  clear: string
  /** 「没有匹配项」下拉空态 */
  noOptions: string
  /** 「共 N 个」整串构造（i18n 插值由 home 负责） */
  totalCount: (count: number) => string
}

export type StoreFilterBarProps = {
  /** 可选：类型过滤组（home 不传，manager 传）。 */
  type?: FilterGroup
  category: FilterGroup
  security: FilterGroup
  source: FilterGroup
  /** 可选：标签过滤组（home 不传，manager 传）。 */
  tag?: FilterGroup
  totalItems: number
  onClearAll: () => void
  labels: StoreFilterBarLabels
}

// 风险粗分组 → 颜色点（与 security-tag.tsx 配色保持一致）。
const RISK_GROUP_DOT: Record<string, string> = {
  unknown: "rgb(156,163,175)",
  low: "rgb(22,163,74)",
  medium: "rgb(202,138,4)",
  high: "rgb(234,88,12)",
}

type GroupKind = "type" | "category" | "security" | "source" | "tag"

function FilterDropdown(props: {
  kind: GroupKind
  label: string
  group: FilterGroup
  noOptionsLabel: string
}) {
  const [open, setOpen] = createSignal(false)
  const count = () => props.group.appliedValues.length
  const active = () => count() > 0
  const isSelected = (value: string) => props.group.appliedValues.includes(value)

  return (
    <Popover modal={false} open={open()} onOpenChange={setOpen}>
      {/* .fbtn — height 34 / rounded-10 / border / bg-panel / fg-muted；激活态 .fbtn.active */}
      <PopoverTrigger
        as="button"
        class={cn(
          "inline-flex h-[2.125rem] cursor-pointer items-center gap-[7px] rounded-[10px] border px-3 text-[12.5px] font-bold transition-[color,border-color,background-color] duration-150",
          active()
            ? "border-[color:color-mix(in_oklab,var(--native-primary)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_10%,var(--native-panel))] text-[var(--native-primary)]"
            : "border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] text-[var(--native-muted)] hover:border-[var(--native-dim)] hover:text-[var(--native-foreground)]",
        )}
      >
        {/* .fc — 主色圆 badge（出现在 label 前，对应 #bi-* 注入位） */}
        <Show when={active()}>
          <span class="inline-flex h-4 min-w-4 items-center justify-center rounded-[99px] bg-[var(--native-primary)] px-1 text-[10.5px] font-extrabold leading-none text-[var(--native-primary-foreground)] [font-variant-numeric:tabular-nums]">
            {count()}
          </span>
        </Show>
        <span>{props.label}</span>
        {/* .car — 展开旋转 180°，transition .25s */}
        <StoreIcon
          name="caret"
          size={13}
          class={cn("shrink-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]", open() && "rotate-180")}
        />
      </PopoverTrigger>
      {/* .fdrop — min-width 188 / rounded-13 / border / shadow / padding 7 / spring 弹出 */}
      <PopoverContent class="min-w-[11.75rem] origin-[var(--kb-popover-content-transform-origin)] rounded-[13px] border border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] p-[7px] shadow-[var(--native-shadow-md)] data-[expanded]:animate-content-show data-[closed]:animate-content-hide">
        <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-0.5 overflow-y-auto">
          <For each={props.group.options}>
            {(option) => (
              // .fopt — padding 8/9 / rounded-9 / gap 9；hover bg panel-2
              <label
                class="flex cursor-pointer items-center gap-[9px] rounded-[9px] px-[9px] py-2 text-[13px] text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)]"
                onClick={(e) => {
                  e.preventDefault()
                  props.group.toggle(option.value)
                }}
              >
                {/* .ck — 勾选框 17×17 / rounded-5 / border 1.5；选中态 .fopt.sel .ck */}
                <span
                  class={cn(
                    "flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
                    isSelected(option.value)
                      ? "border-[var(--native-primary)] bg-[var(--native-primary)] text-[var(--native-primary-foreground)]"
                      : "border-[color:color-mix(in_oklab,var(--native-border)_64%,transparent)] text-transparent",
                  )}
                >
                  <StoreIcon name="check" size={12} />
                </span>
                {/* .rk — 风险色点 8×8 */}
                <Show when={props.kind === "security"}>
                  <span
                    class="size-2 shrink-0 rounded-[99px]"
                    style={{ "background-color": RISK_GROUP_DOT[option.value] ?? RISK_GROUP_DOT.unknown }}
                  />
                </Show>
                <span class="min-w-0 flex-1 truncate">{option.label}</span>
                {/* .ct — 计数靠右 */}
                <Show when={option.count != null}>
                  <span class="ml-auto shrink-0 text-[11px] text-[var(--native-dim)] [font-variant-numeric:tabular-nums]">
                    {option.count}
                  </span>
                </Show>
              </label>
            )}
          </For>
          <Show when={props.group.options.length === 0}>
            <div class="px-2.5 py-3 text-[13px] text-[var(--native-muted)]">{props.noOptionsLabel}</div>
          </Show>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterChip(props: { label: string; dotColor?: string; onRemove: () => void }) {
  // .fchip — chipIn 弹入（scale .8 → 1，spring）
  const chipIn: JSX.CSSProperties = {
    animation: "store-chip-in 0.26s cubic-bezier(0.34,1.56,0.64,1)",
  }
  return (
    <span
      // .fchip — height 30 / gap 6 / pl 11 pr 6 / rounded 99 / primary-bg / border primary 40% / color primary
      class="inline-flex h-[1.875rem] items-center gap-1.5 rounded-[99px] border border-[color:color-mix(in_oklab,var(--native-primary)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_10%,var(--native-panel))] pl-[11px] pr-1.5 text-[12px] font-bold text-[var(--native-primary)]"
      style={chipIn}
    >
      <Show when={props.dotColor}>
        <span class="size-2 shrink-0 rounded-[99px]" style={{ "background-color": props.dotColor }} />
      </Show>
      <span class="max-w-[12rem] truncate">{props.label}</span>
      {/* .fchip .x — 18×18 / rounded 99 / color primary 80% mix fg；hover bg primary 22% */}
      <button
        type="button"
        class="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[99px] text-[color:color-mix(in_oklab,var(--native-primary)_80%,var(--native-foreground))] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_22%,transparent)]"
        onClick={props.onRemove}
        aria-label="remove"
      >
        <StoreIcon name="x" size={11} />
      </button>
    </span>
  )
}

export function StoreFilterBar(props: StoreFilterBarProps) {
  const labelFor = (group: FilterGroup, value: string) =>
    group.options.find((option) => option.value === value)?.label ?? value

  type Chip = { key: string; label: string; dotColor?: string; onRemove: () => void }
  const chips = (): Chip[] => {
    const result: Chip[] = []
    const typeGroup = props.type
    if (typeGroup) {
      for (const value of typeGroup.appliedValues) {
        result.push({
          key: `type:${value}`,
          label: labelFor(typeGroup, value),
          onRemove: () => typeGroup.toggle(value),
        })
      }
    }
    for (const value of props.category.appliedValues) {
      result.push({
        key: `cat:${value}`,
        label: labelFor(props.category, value),
        onRemove: () => props.category.toggle(value),
      })
    }
    for (const value of props.security.appliedValues) {
      result.push({
        key: `risk:${value}`,
        label: labelFor(props.security, value),
        dotColor: RISK_GROUP_DOT[value] ?? RISK_GROUP_DOT.unknown,
        onRemove: () => props.security.toggle(value),
      })
    }
    for (const value of props.source.appliedValues) {
      result.push({
        key: `src:${value}`,
        label: labelFor(props.source, value),
        onRemove: () => props.source.toggle(value),
      })
    }
    const tagGroup = props.tag
    if (tagGroup) {
      for (const value of tagGroup.appliedValues) {
        result.push({
          key: `tag:${value}`,
          label: labelFor(tagGroup, value),
          onRemove: () => tagGroup.toggle(value),
        })
      }
    }
    return result
  }

  const hasAny = () => chips().length > 0

  return (
    // .fbar — flex / align center / gap 9 / wrap
    <div class="flex flex-wrap items-center gap-[9px]">
      {/* keyframe for chip pop-in (scoped via inline <style>, mirrors设计稿 chipIn) */}
      <style>{`@keyframes store-chip-in{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}`}</style>

      <Show when={props.type}>
        {(group) => (
          <FilterDropdown
            kind="type"
            label={props.labels.type ?? ""}
            group={group()}
            noOptionsLabel={props.labels.noOptions}
          />
        )}
      </Show>
      <FilterDropdown
        kind="category"
        label={props.labels.category}
        group={props.category}
        noOptionsLabel={props.labels.noOptions}
      />
      <FilterDropdown
        kind="security"
        label={props.labels.security}
        group={props.security}
        noOptionsLabel={props.labels.noOptions}
      />
      <FilterDropdown
        kind="source"
        label={props.labels.source}
        group={props.source}
        noOptionsLabel={props.labels.noOptions}
      />
      <Show when={props.tag}>
        {(group) => (
          <FilterDropdown
            kind="tag"
            label={props.labels.tag ?? ""}
            group={group()}
            noOptionsLabel={props.labels.noOptions}
          />
        )}
      </Show>

      <Show when={hasAny()}>
        {/* #chips — 内联 chip 组 */}
        <span class="inline-flex flex-wrap items-center gap-2">
          <For each={chips()}>
            {(chip) => <FilterChip label={chip.label} dotColor={chip.dotColor} onRemove={chip.onRemove} />}
          </For>
        </span>
        {/* .clr — 清除筛选：fg-weak / 700 / rounded-8；hover fg-strong + panel-2 */}
        <button
          type="button"
          class="cursor-pointer rounded-[8px] px-2 py-1.5 text-[12px] font-bold text-[var(--native-dim)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)]"
          onClick={props.onClearAll}
        >
          {props.labels.clear}
        </button>
      </Show>

      {/* .count — 共 N 个：靠右 / fg-weak / 600 / 12.5px */}
      <span class="ml-auto whitespace-nowrap text-[12.5px] font-semibold text-[var(--native-dim)] [font-variant-numeric:tabular-nums]">
        {props.labels.totalCount(props.totalItems)}
      </span>
    </div>
  )
}

export default StoreFilterBar

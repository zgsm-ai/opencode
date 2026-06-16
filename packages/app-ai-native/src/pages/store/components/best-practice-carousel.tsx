import { createResource, createSignal, createMemo, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { behaviorApi, itemApi, type CapabilityItem } from "../lib/api"
import { typeKey } from "../lib/constants"
import { pickItemDescription } from "../lib/item-description"
import { getInstallCommand } from "./item-detail-content"
import { useAuth } from "../hooks/use-auth"
import SecurityTag from "./security-tag"
import { sx } from "../lib/styles"

const TYPE_COLOR: Record<string, string> = {
  skill: "rgb(234,179,8)",
  subagent: "rgb(59,130,246)",
  command: "rgb(34,197,94)",
  mcp: "rgb(168,85,247)",
  plugin: "rgb(236,72,153)",
}

const TYPE_LABEL: Record<string, string> = {
  skill: "\u2726",
  subagent: "\u2B21",
  command: ">_",
  mcp: "\u2B22",
  plugin: "\u2B27",
}

const TYPE_ICON: Record<string, IconProps["name"]> = {
  skill: "sparkles",
  subagent: "brain",
  command: "console",
  mcp: "mcp",
  plugin: "configuration",
}

const CAROUSEL_SIZE = 5

interface BestPracticeCarouselProps {
  activeType: () => string
  onSelectItem: (id: string) => void
}

export default function BestPracticeCarousel(props: BestPracticeCarouselProps) {
  const language = useLanguage()
  const auth = useAuth()

  // ── Scroll state ──
  let trackRef: HTMLDivElement | undefined
  const [canScrollLeft, setCanScrollLeft] = createSignal(false)
  const [canScrollRight, setCanScrollRight] = createSignal(false)
  const [copiedId, setCopiedId] = createSignal<string | null>(null)

  // ── Per-card favorite state: Map<itemId, { favorited, count }> ──
  const [favMap, setFavMap] = createSignal<Record<string, { favorited: boolean; count: number }>>({})
  const [favPending, setFavPending] = createSignal<string | null>(null)

  function updateScrollState() {
    if (!trackRef) return
    setCanScrollLeft(trackRef.scrollLeft > 1)
    setCanScrollRight(trackRef.scrollLeft + trackRef.clientWidth < trackRef.scrollWidth - 1)
  }

  function scrollBy(direction: -1 | 1) {
    if (!trackRef) return
    const firstChild = trackRef.firstElementChild as HTMLElement | null
    const cardWidth = firstChild?.offsetWidth ?? 340
    const gap = 16
    trackRef.scrollBy({ left: direction * (cardWidth + gap), behavior: "smooth" })
  }

  onMount(() => {
    if (trackRef) {
      trackRef.addEventListener("scroll", updateScrollState, { passive: true })
      // initial check after layout
      requestAnimationFrame(updateScrollState)
    }
  })

  onCleanup(() => {
    trackRef?.removeEventListener("scroll", updateScrollState)
  })

  // ── Data ──
  const carouselParams = createMemo(() => ({
    type: props.activeType(),
    page: 1,
    pageSize: CAROUSEL_SIZE,
    sortBy: "installCount" as const,
    sortOrder: "desc" as const,
  }))

  const [recommended] = createResource(carouselParams, (params) => itemApi.list(params))

  // Keep previous data while loading to avoid flicker
  const [cachedItems, setCachedItems] = createSignal<CapabilityItem[]>([])

  const items = createMemo(() => {
    const data = recommended.latest?.items
    if (data) {
      setCachedItems(data)
      return data
    }
    return cachedItems()
  })

  // Re-check scroll state when items change or type switches
  createEffect(() => {
    items() // track dependency
    if (trackRef) {
      trackRef.scrollLeft = 0
    }
    requestAnimationFrame(updateScrollState)
  })

  // ── Actions ──
  const copyInstall = async (item: CapabilityItem, e: MouseEvent) => {
    e.stopPropagation()
    const cmd = getInstallCommand(item)
    if (!cmd) return
    try {
      await navigator.clipboard.writeText(cmd)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 2000)
    } catch {
      // ignore clipboard errors
    }
  }

  // Initialize favorite map from item data
  createEffect(() => {
    const map: Record<string, { favorited: boolean; count: number }> = {}
    for (const item of items()) {
      map[item.id] = {
        favorited: Boolean(item.favorited),
        count: item.favoriteCount ?? 0,
      }
    }
    setFavMap(map)
  })

  const toggleFavorite = async (item: CapabilityItem, e: MouseEvent) => {
    e.stopPropagation()
    if (!auth.user() || auth.loading() || favPending()) return

    setFavPending(item.id)
    try {
      const entry = favMap()[item.id]
      const result = entry?.favorited
        ? await behaviorApi.unfavorite(item.id)
        : await behaviorApi.favorite(item.id)
      setFavMap((prev) => ({
        ...prev,
        [item.id]: { favorited: result.favorited, count: result.favoriteCount },
      }))
    } finally {
      setFavPending(null)
    }
  }

  const isFavorited = (id: string) => favMap()[id]?.favorited ?? false
  const favCount = (id: string) => favMap()[id]?.count ?? 0

  return (
    <section class={sx.section}>
      <div class="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 class={sx.title}>{language.t("store.home.bestPractices.title")}</h2>
          <p class={sx.sub}>{language.t("store.home.bestPractices.description")}</p>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--native-panel)_80%,transparent)] text-[var(--native-muted)] transition-[background-color,color,opacity] hover:bg-[color-mix(in_srgb,var(--native-surface)_60%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!canScrollLeft()}
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
          >
            <Icon name="chevron-left" size="small" />
          </button>
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--native-panel)_80%,transparent)] text-[var(--native-muted)] transition-[background-color,color,opacity] hover:bg-[color-mix(in_srgb,var(--native-surface)_60%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!canScrollRight()}
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
          >
            <Icon name="chevron-right" size="small" />
          </button>
        </div>
      </div>

      <Show
        when={items().length > 0}
        fallback={
          <Show
            when={recommended.loading}
            fallback={<div class="flex min-h-40 items-center justify-center text-sm text-[var(--native-muted)]">{language.t("store.home.emptyCategory")}</div>}
          >
            <div class="flex gap-4">
              <For each={[0, 1, 2]}>
                {() => <div class="h-[17rem] min-w-[280px] flex-[0_0_calc((100%_-_2rem)/3)] rounded-[var(--native-radius-lg)] bg-[color-mix(in_srgb,var(--native-bg-subtle)_50%,transparent)] animate-pulse max-[1024px]:min-w-[260px] max-[1024px]:flex-[0_0_calc((100%_-_1rem)/2)] max-[720px]:min-w-[240px] max-[720px]:flex-[0_0_85%]" />}
              </For>
            </div>
          </Show>
        }
      >
        <div class="flex gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden" ref={trackRef}>
          <For each={items()}>
            {(item) => (
              <article
                class="flex min-w-[280px] flex-[0_0_calc((100%_-_2rem)/3)] snap-start flex-col overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--native-panel)_98%,transparent),color-mix(in_srgb,var(--native-bg-subtle)_96%,transparent))] shadow-[0_16px_40px_-32px_color-mix(in_srgb,var(--native-primary)_20%,transparent)] transition-[transform,box-shadow,border-color] hover:-translate-y-[3px] hover:border-[color:color-mix(in_srgb,var(--card-accent)_25%,transparent)] hover:shadow-[0_20px_48px_-28px_color-mix(in_srgb,var(--card-accent)_30%,transparent)] max-[1024px]:min-w-[260px] max-[1024px]:flex-[0_0_calc((100%_-_1rem)/2)] max-[720px]:min-w-[240px] max-[720px]:flex-[0_0_85%]"
                style={{ "--card-accent": TYPE_COLOR[item.itemType] ?? TYPE_COLOR.skill }}
                onClick={() => props.onSelectItem(item.id)}
              >
                <div class="relative flex h-[7.5rem] items-center justify-center overflow-hidden border-b border-[color:color-mix(in_srgb,var(--native-border)_8%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card-accent)_12%,var(--native-panel))_0%,color-mix(in_srgb,var(--card-accent)_4%,var(--native-panel))_60%,var(--native-panel)_100%)] max-[720px]:h-20">
                  <Icon
                    name={TYPE_ICON[item.itemType] ?? "sparkles"}
                    class="h-12 w-12 text-[var(--card-accent)] opacity-35"
                  />
                  <span class="pointer-events-none absolute right-4 bottom-1 text-[4rem] leading-none font-black text-[var(--card-accent)] opacity-[0.06] select-none">
                    {TYPE_LABEL[item.itemType] ?? "\u2726"}
                  </span>
                </div>

                <div class="flex flex-1 flex-col gap-1.5 px-[1.125rem] pt-[0.875rem] pb-4">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex items-center gap-1 rounded-[0.625rem] bg-[color-mix(in_srgb,var(--card-accent)_12%,transparent)] px-2 py-0.5 text-[12px] whitespace-nowrap text-[var(--card-accent)]">
                      {TYPE_LABEL[item.itemType] ?? "\u2726"}{" "}
                      {language.t(typeKey(item.itemType))}
                    </span>
                    <Show when={item.securityStatus}>
                      <SecurityTag status={item.securityStatus} />
                    </Show>
                  </div>

                  <h3 class="m-0 truncate text-[1rem] leading-[1.4] font-bold text-[var(--color-native-foreground)]">{item.name}</h3>
                  <p class="line-clamp-2 min-h-[2.5em] flex-1 text-[0.8125rem] leading-[1.55] text-[var(--native-muted)]">{pickItemDescription(item, language.locale())}</p>

                  <div class="mt-1 flex items-center justify-between">
                    <div class="flex gap-2.5 text-[12px] text-[var(--native-muted)]">
                      <span class="inline-flex items-center gap-[0.1875rem]" title={language.t("store.home.table.favoriteCount")}>
                        <LocalIcon name="subscribe" size="small" class="h-3 w-3 opacity-65" />
                        {favCount(item.id).toLocaleString()}
                      </span>
                      <span class="inline-flex items-center gap-[0.1875rem]" title={language.t("store.home.table.installCount")}>
                        <LocalIcon name="download" size="small" class="h-3 w-3 opacity-65" />
                        {(item.installCount ?? 0).toLocaleString()}
                      </span>
                      <span class="inline-flex items-center gap-[0.1875rem]" title={language.t("store.home.table.previewCount")}>
                        <LocalIcon name="view" size="small" class="h-3 w-3 opacity-65" />
                        {(item.previewCount ?? 0).toLocaleString()}
                      </span>
                    </div>

                    <div class="flex gap-1">
                      {/* 仅有真实安装命令（plugin）才显示复制按钮；skill 等靠订阅分发、无安装命令。 */}
                      <Show when={getInstallCommand(item)}>
                        <button
                          class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--native-muted)] transition-[background-color,color] hover:bg-[color-mix(in_srgb,var(--native-surface)_60%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
                          onClick={(e) => copyInstall(item, e)}
                          title={language.t("store.home.table.copyInstall")}
                        >
                          <Icon name={copiedId() === item.id ? "check-small" : "copy"} size="small" />
                        </button>
                      </Show>
                      <button
                        class={[
                          isFavorited(item.id)
                            ? "inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[rgb(234,179,8)] transition-[background-color,color] hover:bg-[color-mix(in_srgb,var(--native-surface)_60%,transparent)] hover:text-[rgb(234,179,8)] [&_[data-component=icon]]:text-[rgb(234,179,8)] [&_[data-slot=icon-svg]]:text-[rgb(234,179,8)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
                            : "inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--native-muted)] transition-[background-color,color] hover:bg-[color-mix(in_srgb,var(--native-surface)_60%,transparent)] hover:text-[var(--native-foreground)] [&_[data-component=icon]]:text-[var(--native-muted)] [&_[data-slot=icon-svg]]:text-[var(--native-muted)] hover:[&_[data-component=icon]]:text-[var(--native-foreground)] hover:[&_[data-slot=icon-svg]]:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]",
                        ].join(" ")}
                        onClick={(e) => toggleFavorite(item, e)}
                        title={isFavorited(item.id) ? language.t("store.detail.unfavoriteTooltip") : language.t("store.detail.favoriteTooltip")}
                        disabled={favPending() === item.id}
                      >
                        <LocalIcon name={isFavorited(item.id) ? "subscribe-filled" : "subscribe"} size="small" class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

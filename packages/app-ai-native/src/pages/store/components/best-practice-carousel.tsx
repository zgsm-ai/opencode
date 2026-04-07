import { createResource, createSignal, createMemo, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { behaviorApi, itemApi, type CapabilityItem } from "../lib/api"
import { categoryKey, typeKey } from "../lib/constants"
import { getInstallCommand } from "./item-detail-content"
import { useAuth } from "../hooks/use-auth"
import SecurityTag from "./security-tag"
import "./best-practice-carousel.css"

const TYPE_COLOR: Record<string, string> = {
  skill: "rgb(234,179,8)",
  subagent: "rgb(59,130,246)",
  command: "rgb(34,197,94)",
  mcp: "rgb(168,85,247)",
}

const TYPE_LABEL: Record<string, string> = {
  skill: "\u2726",
  subagent: "\u2B21",
  command: ">_",
  mcp: "\u2B22",
}

const TYPE_ICON: Record<string, IconProps["name"]> = {
  skill: "sparkles",
  subagent: "brain",
  command: "console",
  mcp: "mcp",
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
  }))

  const [recommended] = createResource(carouselParams, (params) => itemApi.list(params))

  // Keep previous data while loading to avoid flicker
  const [cachedItems, setCachedItems] = createSignal<CapabilityItem[]>([])

  // Client-side sort by installCount as a best-effort ranking
  const items = createMemo(() => {
    const data = recommended.latest?.items
    if (data) {
      const sorted = [...data].sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0))
      setCachedItems(sorted)
      return sorted
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
    try {
      await navigator.clipboard.writeText(getInstallCommand(item))
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
    <section class="store-section">
      <div class="bp-carousel-heading">
        <div>
          <h2 class="store-section-title">{language.t("store.home.bestPractices.title")}</h2>
          <p class="store-section-subtitle">{language.t("store.home.bestPractices.description")}</p>
        </div>
        <div class="bp-carousel-nav">
          <button
            class="bp-carousel-arrow"
            disabled={!canScrollLeft()}
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
          >
            <Icon name="chevron-left" size="small" />
          </button>
          <button
            class="bp-carousel-arrow"
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
            fallback={<div class="bp-carousel-empty">{language.t("store.home.emptyCategory")}</div>}
          >
            <div class="bp-carousel-skeleton">
              <For each={[0, 1, 2]}>{() => <div class="bp-card-skeleton" />}</For>
            </div>
          </Show>
        }
      >
          <div class="bp-carousel-track" ref={trackRef}>
            <For each={items()}>
              {(item) => (
                <article
                  class="bp-card"
                  style={{ "--card-accent": TYPE_COLOR[item.itemType] ?? TYPE_COLOR.skill }}
                  onClick={() => props.onSelectItem(item.id)}
                >
                  {/* Visual area */}
                  <div class="bp-card-visual">
                    <Icon
                      name={TYPE_ICON[item.itemType] ?? "sparkles"}
                      class="bp-card-visual-icon"
                    />
                    <span class="bp-card-visual-symbol">
                      {TYPE_LABEL[item.itemType] ?? "\u2726"}
                    </span>
                  </div>

                  {/* Card body */}
                  <div class="bp-card-body">
                    <div class="bp-card-badges">
                      <span class="bp-card-type-badge">
                        {TYPE_LABEL[item.itemType] ?? "\u2726"}{" "}
                        {language.t(typeKey(item.itemType))}
                      </span>
                      <Show when={item.category?.trim()}>
                        <span class="bp-card-category-badge">
                          {language.t(categoryKey(item.category))}
                        </span>
                      </Show>
                      <Show when={item.securityStatus}>
                        <SecurityTag status={item.securityStatus} />
                      </Show>
                    </div>

                    <h3 class="bp-card-name">{item.name}</h3>
                    <p class="bp-card-description">{item.description}</p>

                    <div class="bp-card-footer">
                      <div class="bp-card-stats">
                        <span class="bp-card-stat" title={language.t("store.home.table.favoriteCount")}>
                          <LocalIcon name="star" size="small" class="bp-card-stat-icon" />
                          {favCount(item.id).toLocaleString()}
                        </span>
                        <span class="bp-card-stat" title={language.t("store.home.table.installCount")}>
                          <LocalIcon name="download" size="small" class="bp-card-stat-icon" />
                          {(item.installCount ?? 0).toLocaleString()}
                        </span>
                        <span class="bp-card-stat" title={language.t("store.home.table.previewCount")}>
                          <LocalIcon name="view" size="small" class="bp-card-stat-icon" />
                          {(item.previewCount ?? 0).toLocaleString()}
                        </span>
                      </div>

                      <div class="bp-card-actions">
                        <button
                          class="bp-card-action-btn"
                          onClick={(e) => copyInstall(item, e)}
                          title={language.t("store.home.table.copyInstall")}
                        >
                          <Icon name={copiedId() === item.id ? "check-small" : "copy"} size="small" />
                        </button>
                        <button
                          class={`bp-card-action-btn ${isFavorited(item.id) ? "bp-card-action-btn-active" : ""}`}
                          onClick={(e) => toggleFavorite(item, e)}
                          title={isFavorited(item.id) ? language.t("store.detail.unfavorite") : language.t("store.detail.favorite")}
                          disabled={favPending() === item.id}
                        >
                          <LocalIcon name={isFavorited(item.id) ? "star-filled" : "star"} size="small" class="bp-card-fav-icon" />
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

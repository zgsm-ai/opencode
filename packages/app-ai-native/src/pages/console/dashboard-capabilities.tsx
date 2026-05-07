import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { createEffect, createMemo, createSignal, For, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "@/pages/store/hooks/use-auth"
import { getLoginUrl } from "@/pages/store/lib/auth"
import ItemDetailContent from "@/pages/store/components/item-detail-content"
import { behaviorApi, itemApi, repoApi, type CapabilityItem, type Repository } from "@/pages/store/lib/api"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { MoveCapabilityDialog } from "@/pages/store/components/move-capability-dialog"
import { TYPE_COLORS, typeKey } from "@/pages/store/lib/constants"
import { cn } from "@/lib/utils"
import { st, sx } from "@/pages/store/lib/styles"
import { Button } from "@/components/ui/button"
import { useNavigate } from "@solidjs/router"

const PAGE_SIZE = 10

const SUB = {
  "font-size": "0.8125rem",
  color: "var(--native-muted)",
  "margin-bottom": "0.75rem",
}


export default function DashboardCapabilities() {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [detailRenderItemId, setDetailRenderItemId] = createSignal<string | null>(null)
  const [detailItem, setDetailItem] = createSignal<CapabilityItem | null>(null)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [previewCount, setPreviewCount] = createSignal(0)
  const [installCount, setInstallCount] = createSignal(0)
  const [trackedItemId, setTrackedItemId] = createSignal<string | null>(null)
  const [state, setState] = createStore({
    items: [] as CapabilityItem[],
    totalItems: 0,
    loadingItems: false,
    itemTypeFilter: "all",
    itemPage: 1,
    filtersShown: false,
    repos: [] as Repository[],
  })
  const [favState, setFavState] = createStore({
    items: [] as CapabilityItem[],
    total: 0,
    loading: false,
    page: 1,
  })

  const userId = createMemo(() => user()?.id ?? user()?.subjectId ?? user()?.sub ?? "")
  const username = createMemo(() => user()?.preferred_username || user()?.name || "")

  const loadItems = async (page = state.itemPage, type = state.itemTypeFilter) => {
    if (!userId()) return
    if (state.loadingItems) return
    setState("loadingItems", true)
    try {
      const res = await itemApi.listMy({
        type: type === "all" ? undefined : type,
        page,
        pageSize: PAGE_SIZE,
      })
      setState("items", res.items ?? [])
      setState("totalItems", res.total ?? 0)
    } catch (error) {
      showToast({
        title: language.t("store.console.capabilities.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setState("loadingItems", false)
    }
  }

  const loadFavorited = async (page = favState.page) => {
    if (favState.loading) return
    setFavState("loading", true)
    try {
      const res = await itemApi.list({ favorited: true, page, pageSize: PAGE_SIZE })
      setFavState("items", res.items ?? [])
      setFavState("total", res.total ?? 0)
    } catch {
      // silently ignore
    } finally {
      setFavState("loading", false)
    }
  }

  let loaded = false
  createEffect(() => {
    if (!userId() || loaded) return
    loaded = true
    void loadItems()
    void loadFavorited()
    void repoApi.listMy().then((res) => setState("repos", res.repositories ?? []))
  })

  const totalPages = createMemo(() => Math.max(1, Math.ceil(state.totalItems / PAGE_SIZE)))
  const favTotalPages = createMemo(() => Math.max(1, Math.ceil(favState.total / PAGE_SIZE)))
  const detailOpen = createMemo(() => !!selectedItemId())
  const [detailContentReady, setDetailContentReady] = createSignal(false)
  let detailContentTimer: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const itemId = selectedItemId()
    clearTimeout(detailContentTimer)
    if (!itemId) {
      setDetailContentReady(false)
      setDetailRenderItemId(null)
      return
    }
    setDetailContentReady(false)
    detailContentTimer = setTimeout(() => {
      setDetailRenderItemId(itemId)
      setDetailContentReady(true)
    }, 180)
  })

  const buildPages = (total: number, cur: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const set = new Set([1, 2, cur - 1, cur, cur + 1, total - 1, total])
    const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
    const result: (number | "...")[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...")
      result.push(sorted[i])
    }
    return result
  }

  const pages = createMemo(() => buildPages(totalPages(), state.itemPage))
  const favPages = createMemo(() => buildPages(favTotalPages(), favState.page))

  const openCreateCapability = () => {
    if (!userId()) return
    navigate("/capabilities/new")
  }

  const openEditCapability = (item: CapabilityItem) => {
    navigate(`/capabilities/${item.id}/edit`)
  }

  const openMoveCapability = (item: CapabilityItem) => {
    dialog.show(() => <MoveCapabilityDialog item={item} repositories={state.repos} onMoved={() => void loadItems()} />)
  }

  const handleDeleteItem = (id: string) => {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.console.capabilities.delete")}
        description={language.t("store.console.confirmDeleteCapability")}
        confirm={language.t("common.delete")}
        onConfirm={async () => {
          await itemApi.delete(id)
          showToast({ title: language.t("store.console.capabilities.toast.deleteSuccess") })
          void loadItems()
        }}
      />
    ))
  }

  const unfavoriteItem = async (id: string) => {
    await behaviorApi.unfavorite(id)
    void loadFavorited(favState.page)
  }

  onCleanup(() => {
    clearTimeout(detailContentTimer)
  })

  const toggleFavorite = async () => {
    const data = detailItem()
    if (!data || !user() || loading() || favoritePending()) return

    setFavoritePending(true)
    try {
      if (favorited()) {
        const result = await behaviorApi.unfavorite(data.id)
        setFavorited(result.favorited)
        setFavoriteCount(result.favoriteCount)
        void loadFavorited(favState.page)
        return
      }

      const result = await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
      void loadFavorited(favState.page)
    } finally {
      setFavoritePending(false)
    }
  }

  const typeLabel = (type: string) => language.t(typeKey(type))

  const visColor = (vis?: string | null) => {
    if (vis === "public") return { bg: "color-mix(in srgb, #22c55e 12%, transparent)", c: "#22c55e" }
    if (vis === "private") return { bg: "color-mix(in srgb, #f59e0b 12%, transparent)", c: "#f59e0b" }
    return { bg: "rgba(156,163,175,0.12)", c: "var(--native-muted)" }
  }

  createEffect(() => {
    const data = detailItem()
    if (!data) return
    setPreviewCount(data.previewCount ?? 0)
    setInstallCount(data.installCount ?? 0)
    setFavorited(Boolean(data.favorited))
    setFavoriteCount(data.favoriteCount ?? 0)
  })

  createEffect(() => {
    const data = detailItem()
    if (!data) return
    if (trackedItemId() === data.id) return

    setTrackedItemId(data.id)
    void behaviorApi
      .log(data.id, {
        actionType: "view",
        context: "drawer",
        metadata: {
          source: "app-ai-native",
          route: "dashboard-capabilities",
        },
      })
      .then(() => setPreviewCount((count) => count + 1))
      .catch(() => undefined)
  })

  const Pagination = (props: {
    page: number
    totalPages: number
    pages: (number | "...")[]
    onPage: (p: number) => void
    total: number
  }) => (
    <Show when={props.totalPages > 1}>
      <div class={sx.pager}>
        <p class={sx.pagerSum}>
          {language.t("store.console.capabilities.showing", {
            from: (props.page - 1) * PAGE_SIZE + 1,
            to: Math.min(props.page * PAGE_SIZE, props.total),
            total: props.total,
          })}
        </p>
        <div class={sx.pagerActs}>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={props.page <= 1}
            onClick={() => props.onPage(props.page - 1)}
          >
            <Icon name="chevron-left" size="small" />
          </Button>
          <For each={props.pages}>
            {(p) => (
              <Show
                when={p !== "..."}
                fallback={<span class={cn(sx.page, "cursor-default hover:bg-transparent hover:text-[var(--native-muted)]")}>...</span>}
              >
                <Button
                  variant={props.page === p ? "default" : "ghost"}
                  size="sm"
                  type="button"
                  onClick={() => props.onPage(p as number)}
                >
                  {p}
                </Button>
              </Show>
            )}
          </For>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={props.page >= props.totalPages}
            onClick={() => props.onPage(props.page + 1)}
          >
            <Icon name="chevron-right" size="small" />
          </Button>
        </div>
      </div>
    </Show>
  )

  return (
    <Show
      when={!loading()}
      fallback={<div class={sx.empty}>{language.t("store.loading")}</div>}
    >
      <Show
        when={user()}
        fallback={
          <div class={cn(sx.empty, "flex min-h-[40vh] items-center justify-center")}>
            <div style={{ "text-align": "center" }}>
              <h1 class={sx.toolbarTitle}>{language.t("store.console")}</h1>
              <p class={cn(sx.toolbarSub, "mb-3")}>{language.t("store.console.authDescription")}</p>
              <Button
                type="button"
                size="sm"
                  onClick={() => { window.location.href = getLoginUrl("/store/manager") }}
                >
                  {language.t("store.console.login")}
                </Button>
            </div>
          </div>
        }
      >
        <div class={sx.toolbar}>
          <div>
            <h2 class={sx.toolbarTitle}>{language.t("store.console.capabilities.title")}</h2>
            <p class={sx.toolbarSub}>{language.t("store.console.capabilities.description")}</p>
          </div>
        </div>

        {/* My Created */}
        <section class={cn(sx.cshell, "mb-4")}>
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p style={{ ...SUB, "margin-bottom": 0 }}>{language.t("store.console.capabilities.myCreated")}</p>
            <Button
              type="button"
              size="sm"
              onClick={openCreateCapability}
            >
              {language.t("store.console.newCapability")}
            </Button>
          </div>

          <Show when={state.filtersShown || state.items.length > 0 || state.totalItems > 0}>
            <div class={sx.filterBar}>
              <For each={["all", "skill", "subagent", "command", "mcp"]}>
                {(type) => (
                  <Button
                    variant={state.itemTypeFilter === type ? "default" : "outline"}
                    size="sm"
                    type="button"
                    onClick={() => {
                      setState("itemTypeFilter", type)
                      setState("itemPage", 1)
                      setState("filtersShown", true)
                      void loadItems(1, type)
                    }}
                  >
                    {type === "all" ? language.t("store.console.filters.all") : typeLabel(type)}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <Show
            when={!state.loadingItems}
            fallback={<div class={sx.empty}>{language.t("store.console.capabilities.loading")}</div>}
          >
            <Show
              when={state.totalItems > 0 || state.items.length > 0}
              fallback={<div class={sx.empty}>{language.t("store.console.capabilities.empty")}</div>}
            >
              <div class={sx.tshell}>
                <table class={sx.dt}>
                  <thead>
                    <tr>
                      <th>{language.t("store.console.capabilities.name")}</th>
                      <th>{language.t("store.console.capabilities.type")}</th>
                      <th>{language.t("store.console.capabilities.visibility")}</th>
                      <th>{language.t("store.console.capabilities.source")}</th>
                      <th style={{ "text-align": "right" }}>{language.t("common.operation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={state.items}>
                      {(item) => {
                        const tc = () => TYPE_COLORS[item.itemType] || "#8B5CF6"
                        const vc = () => visColor(item.repoVisibility)
                        return (
                          <tr onClick={() => setSelectedItemId(item.id)}>
                            <td>
                              <span style={{ color: "var(--native-foreground)" }}>{item.name}</span>
                            </td>
                            <td>
                              <span
                                class={sx.pill}
                                style={{
                                  background: `color-mix(in srgb, ${tc()} 12%, transparent)`,
                                  color: tc(),
                                }}
                              >
                                {typeLabel(item.itemType)}
                              </span>
                            </td>
                            <td>
                              <span
                                class={sx.pill}
                                style={{ background: vc().bg, color: vc().c }}
                              >
                                {item.repoVisibility === "public"
                                  ? language.t("store.capabilityDialog.visibility.public")
                                  : item.repoVisibility === "private"
                                    ? language.t("store.capabilityDialog.visibility.private")
                                    : "-"}
                              </span>
                            </td>
                            <td class={sx.mut}>{item.repoName || "—"}</td>
                            <td style={{ "text-align": "right" }}>
                              <div class="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  aria-label={language.t("common.open")}
                                  title={language.t("common.open")}
                                  onClick={() => setSelectedItemId(item.id)}
                                >
                                  <Icon name="arrow-right" size="small" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  aria-label={language.t("store.console.capabilities.move")}
                                  title={language.t("store.console.capabilities.move")}
                                  onClick={() => openMoveCapability(item)}
                                >
                                  <Icon name="share" size="small" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  aria-label={language.t("store.console.capabilities.edit")}
                                  title={language.t("store.console.capabilities.edit")}
                                  onClick={() => openEditCapability(item)}
                                >
                                  <Icon name="edit" size="small" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  class="text-destructive hover:text-destructive"
                                  aria-label={language.t("store.console.capabilities.delete")}
                                  title={language.t("store.console.capabilities.delete")}
                                  onClick={() => handleDeleteItem(item.id)}
                                >
                                  <Icon name="trash" size="small" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      }}
                    </For>
                  </tbody>
                </table>
              </div>

              <Pagination
                page={state.itemPage}
                totalPages={totalPages()}
                pages={pages()}
                total={state.totalItems}
                onPage={(p) => {
                  setState("itemPage", p)
                  void loadItems(p)
                }}
              />
            </Show>
          </Show>
        </section>

        {/* My Favorited */}
        <section class={sx.cshell}>
          <p style={SUB}>{language.t("store.console.capabilities.myFavorited")}</p>

          <Show
            when={!favState.loading}
            fallback={<div class={sx.empty}>{language.t("store.console.capabilities.favorited.loading")}</div>}
          >
            <Show
              when={favState.total > 0 || favState.items.length > 0}
              fallback={<div class={sx.empty}>{language.t("store.console.capabilities.favorited.empty")}</div>}
            >
              <div class={sx.tshell}>
                <table class={sx.dt}>
                  <thead>
                    <tr>
                      <th>{language.t("store.console.capabilities.name")}</th>
                      <th>{language.t("store.console.capabilities.type")}</th>
                      <th>{language.t("store.console.capabilities.source")}</th>
                      <th style={{ "text-align": "right" }}>{language.t("common.operation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={favState.items}>
                      {(item) => {
                        const tc = () => TYPE_COLORS[item.itemType] || "#8B5CF6"
                        return (
                          <tr onClick={() => setSelectedItemId(item.id)}>
                            <td>
                              <span style={{ color: "var(--native-foreground)" }}>{item.name}</span>
                            </td>
                            <td>
                              <span
                                class={sx.pill}
                                style={{
                                  background: `color-mix(in srgb, ${tc()} 12%, transparent)`,
                                  color: tc(),
                                }}
                              >
                                {typeLabel(item.itemType)}
                              </span>
                            </td>
                            <td class={sx.mut}>{item.repoName || "—"}</td>
                            <td style={{ "text-align": "right" }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                class="text-[rgb(202,138,4)] hover:text-[rgb(161,98,7)]"
                                aria-label={language.t("store.detail.unfavorite")}
                                title={language.t("store.detail.unfavorite")}
                                onClick={(e) => { e.stopPropagation(); void unfavoriteItem(item.id) }}
                              >
                                <LocalIcon name="star-filled" size="small" style={{ color: "currentColor" }} />
                              </Button>
                            </td>
                          </tr>
                        )
                      }}
                    </For>
                  </tbody>
                </table>
              </div>

              <Pagination
                page={favState.page}
                totalPages={favTotalPages()}
                pages={favPages()}
                total={favState.total}
                onPage={(p) => {
                  setFavState("page", p)
                  void loadFavorited(p)
                }}
              />
            </Show>
          </Show>
        </section>

        <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId(null)} modal={false}>
          <SheetContent position="right" class={cn(sx.sheet, "w-[min(68rem,94vw)] sm:max-w-none")} style={{ "background-color": "var(--st-surface-lowest, #ffffff)" }}>
            <SheetHeader class="sr-only">
              <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
              <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
            </SheetHeader>
            <Show when={detailRenderItemId()}>
              {(itemId) => (
                <Show
                  when={detailContentReady()}
                  fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}
                >
                  <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                    <ItemDetailContent
                      itemId={itemId()}
                      class={cn(sx.sheetBody, "thin-scrollbar")}
                      onItemLoaded={setDetailItem}
                      favorited={favorited()}
                      favoriteCount={favoriteCount()}
                      previewCount={previewCount()}
                      installCount={installCount()}
                      onToggleFavorite={toggleFavorite}
                      favoritePending={favoritePending()}
                      isAuthenticated={!!user() && !loading()}
                    />
                  </Suspense>
                </Show>
              )}
            </Show>
          </SheetContent>
        </Sheet>
      </Show>
    </Show>
  )
}

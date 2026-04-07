import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { createEffect, createMemo, createSignal, For, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "../hooks/use-auth"
import { getLoginUrl } from "../lib/auth"
import ItemDetailContent from "../components/item-detail-content"
import { behaviorApi, itemApi, repoApi, type CapabilityItem, type Repository } from "../lib/api"
import { ConfirmDialog } from "../components/confirm-dialog"
import { CreateCapabilityDialog } from "../components/create-capability-dialog"
import { EditCapabilityDialog } from "../components/edit-capability-dialog"
import { MoveCapabilityDialog } from "../components/move-capability-dialog"
import { typeKey } from "../lib/constants"

const PAGE_SIZE = 10

const TYPE_COLORS: Record<string, string> = {
  skill: "#F59E0B",
  subagent: "#3b82f6",
  command: "#10B981",
  mcp: "#8B5CF6",
}

export default function DashboardCapabilities() {
  const dialog = useDialog()
  const language = useLanguage()
  const { user, loading } = useAuth()
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
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

  const userId = createMemo(() => user()?.sub ?? "")
  const username = createMemo(() => user()?.preferred_username || user()?.name || "")

  const loadItems = async (page = state.itemPage, type = state.itemTypeFilter) => {
    if (!userId()) return
    if (state.loadingItems) return
    setState("loadingItems", true)
    try {
      const res = await itemApi.listMy(userId(), {
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

  let loaded = false
  createEffect(() => {
    if (!userId() || loaded) return
    loaded = true
    void loadItems()
    void repoApi.listMy(userId()).then((res) => setState("repos", res.repositories ?? []))
  })

  const totalPages = createMemo(() => Math.max(1, Math.ceil(state.totalItems / PAGE_SIZE)))
  const detailOpen = createMemo(() => !!selectedItemId())

  const pages = createMemo(() => {
    const total = totalPages()
    const cur = state.itemPage
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const set = new Set([1, 2, cur - 1, cur, cur + 1, total - 1, total])
    const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
    const result: (number | "...")[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...")
      result.push(sorted[i])
    }
    return result
  })

  const openCreateCapability = () => {
    if (!userId()) return
    dialog.show(() => (
      <CreateCapabilityDialog
        userId={userId()}
        username={username()}
        repositories={state.repos}
        onCreated={() => void loadItems()}
      />
    ))
  }

  const openEditCapability = (item: CapabilityItem) => {
    dialog.show(() => <EditCapabilityDialog item={item} onSaved={() => void loadItems()} />)
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

  const toggleFavorite = async () => {
    const data = detailItem()
    if (!data || !user() || loading() || favoritePending()) return

    setFavoritePending(true)
    try {
      if (favorited()) {
        const result = await behaviorApi.unfavorite(data.id)
        setFavorited(result.favorited)
        setFavoriteCount(result.favoriteCount)
        return
      }

      const result = await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
    } finally {
      setFavoritePending(false)
    }
  }

  const typeLabel = (type: string) => language.t(typeKey(type))

  const visColor = (vis?: string | null) => {
    if (vis === "public") return { bg: "color-mix(in srgb, #22c55e 12%, transparent)", c: "#22c55e" }
    if (vis === "private") return { bg: "color-mix(in srgb, #f59e0b 12%, transparent)", c: "#f59e0b" }
    return { bg: "rgba(156,163,175,0.12)", c: "var(--st-text-secondary)" }
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

  return (
    <Show
      when={!loading()}
      fallback={<div class="store-dash-empty">{language.t("store.loading")}</div>}
    >
      <Show
        when={user()}
        fallback={
          <div class="store-dash-empty" style={{ "min-height": "40vh", display: "flex", "align-items": "center", "justify-content": "center" }}>
            <div style={{ "text-align": "center" }}>
              <h1 class="store-tbar-title">{language.t("store.console")}</h1>
              <p class="store-tbar-sub" style={{ "margin-bottom": "0.75rem" }}>{language.t("store.console.authDescription")}</p>
              <button
                class="store-fbtn store-fbtn-primary"
                onClick={() => { window.location.href = getLoginUrl("/store/dashboard/capabilities") }}
              >
                {language.t("store.console.login")}
              </button>
            </div>
          </div>
        }
      >
        <section class="store-cshell">
          <div class="store-tbar">
            <div>
              <h2 class="store-tbar-title">{language.t("store.console.capabilities.title")}</h2>
              <p class="store-tbar-sub">{language.t("store.console.capabilities.description")}</p>
            </div>
            <button class="store-fbtn store-fbtn-primary" onClick={openCreateCapability}>
              <Icon name="plus" size="small" />
              {language.t("store.console.newCapability")}
            </button>
          </div>

          <Show when={state.filtersShown || state.items.length > 0 || state.totalItems > 0}>
            <div class="store-dash-filter-bar">
              <For each={["all", "skill", "subagent", "command", "mcp"]}>
                {(type) => (
                  <button
                    class={`store-dash-filter-btn${state.itemTypeFilter === type ? " store-dash-filter-btn-on" : ""}`}
                    onClick={() => {
                      setState("itemTypeFilter", type)
                      setState("itemPage", 1)
                      setState("filtersShown", true)
                      void loadItems(1, type)
                    }}
                  >
                    {type === "all" ? language.t("store.console.filters.all") : typeLabel(type)}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show
            when={!state.loadingItems}
            fallback={<div class="store-dash-empty">{language.t("store.console.capabilities.loading")}</div>}
          >
            <Show
              when={state.totalItems > 0 || state.items.length > 0}
              fallback={
                <div class="store-dash-empty">
                  {language.t("store.console.capabilities.empty")}
                </div>
              }
            >
              <div class="store-tshell">
                <table class="store-dt">
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
                              <span class="store-iname">{item.name}</span>
                              <div style={{ "font-size": "0.625rem", color: "var(--st-text-secondary)", "margin-top": "2px" }}>
                                {item.slug}
                              </div>
                            </td>
                            <td>
                              <span
                                class="store-dash-pill"
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
                                class="store-dash-pill"
                                style={{ background: vc().bg, color: vc().c }}
                              >
                                {item.repoVisibility === "public"
                                  ? language.t("store.capabilityDialog.visibility.public")
                                  : item.repoVisibility === "private"
                                    ? language.t("store.capabilityDialog.visibility.private")
                                    : "-"}
                              </span>
                            </td>
                            <td class="store-mut">{item.repoName || "—"}</td>
                            <td style={{ "text-align": "right" }}>
                              <div style={{ display: "flex", gap: "1px", "justify-content": "flex-end" }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  class="store-abtn"
                                  title={language.t("common.open")}
                                  onClick={() => setSelectedItemId(item.id)}
                                >
                                  <Icon name="arrow-right" size="small" />
                                </button>
                                <button
                                  class="store-abtn"
                                  title={language.t("store.console.capabilities.move")}
                                  onClick={() => openMoveCapability(item)}
                                >
                                  <Icon name="share" size="small" />
                                </button>
                                <button
                                  class="store-abtn"
                                  title={language.t("store.console.capabilities.edit")}
                                  onClick={() => openEditCapability(item)}
                                >
                                  <Icon name="edit" size="small" />
                                </button>
                                <button
                                  class="store-abtn"
                                  title={language.t("store.console.capabilities.delete")}
                                  onClick={() => handleDeleteItem(item.id)}
                                >
                                  <Icon name="trash" size="small" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }}
                    </For>
                  </tbody>
                </table>
              </div>

              <Show when={totalPages() > 1}>
                <div class="store-pag">
                  <p class="store-pag-sum">
                    {language.t("store.console.capabilities.showing", {
                      from: (state.itemPage - 1) * PAGE_SIZE + 1,
                      to: Math.min(state.itemPage * PAGE_SIZE, state.totalItems),
                      total: state.totalItems,
                    })}
                  </p>
                  <div class="store-pag-acts">
                    <button
                      class="store-pbtn"
                      disabled={state.itemPage <= 1}
                      onClick={() => {
                        const p = Math.max(1, state.itemPage - 1)
                        setState("itemPage", p)
                        void loadItems(p)
                      }}
                    >
                      <Icon name="chevron-left" size="small" />
                    </button>
                    <For each={pages()}>
                      {(p) => (
                        <Show
                          when={p !== "..."}
                          fallback={<span class="store-pbtn" style={{ cursor: "default" }}>...</span>}
                        >
                          <button
                            class={`store-pbtn${state.itemPage === p ? " store-pbtn-on" : ""}`}
                            onClick={() => {
                              setState("itemPage", p as number)
                              void loadItems(p as number)
                            }}
                          >
                            {p}
                          </button>
                        </Show>
                      )}
                    </For>
                    <button
                      class="store-pbtn"
                      disabled={state.itemPage >= totalPages()}
                      onClick={() => {
                        const p = Math.min(totalPages(), state.itemPage + 1)
                        setState("itemPage", p)
                        void loadItems(p)
                      }}
                    >
                      <Icon name="chevron-right" size="small" />
                    </button>
                  </div>
                </div>
              </Show>
            </Show>
          </Show>
        </section>

        <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId(null)} modal={false}>
          <SheetContent position="right" class="store-detail-sheet w-[min(48rem,92vw)] sm:max-w-none">
            <SheetHeader class="sr-only">
              <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
              <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
            </SheetHeader>
            <Show when={selectedItemId()}>
              {(itemId) => (
                <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                  <ItemDetailContent
                    itemId={itemId()}
                    class="store-detail-content custom-scrollbar"
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
              )}
            </Show>
          </SheetContent>
        </Sheet>
      </Show>
    </Show>
  )
}

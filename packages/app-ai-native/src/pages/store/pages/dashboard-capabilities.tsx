import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "../hooks/use-auth"
import { getLoginUrl } from "../lib/auth"
import { itemApi, repoApi, type CapabilityItem, type Repository } from "../lib/api"
import { ConfirmDialog } from "../components/confirm-dialog"
import { CreateCapabilityDialog } from "../components/create-capability-dialog"
import { EditCapabilityDialog } from "../components/edit-capability-dialog"
import { MoveCapabilityDialog } from "../components/move-capability-dialog"
import { typeKey } from "../lib/constants"

const PAGE_SIZE = 10

export default function DashboardCapabilities() {
  const navigate = useNavigate()
  const dialog = useDialog()
  const language = useLanguage()
  const { user, loading } = useAuth()
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

  const typeLabel = (type: string) => language.t(typeKey(type))

  return (
    <div class="min-h-full px-6 py-6">
      <Show
        when={!loading()}
        fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}
      >
        <Show
          when={user()}
          fallback={
            <div class="flex min-h-[60vh] items-center justify-center">
              <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-8 py-10 text-center">
                <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-info-base/20 text-text-strong">
                  <Icon name="console" />
                </div>
                <h1 class="text-lg font-semibold text-text-strong">{language.t("store.console")}</h1>
                <p class="mt-2 text-sm text-text-weak">{language.t("store.console.authDescription")}</p>
                <Button
                  class="mt-4"
                  onClick={() => {
                    window.location.href = getLoginUrl("/store/dashboard/capabilities")
                  }}
                >
                  {language.t("store.console.login")}
                </Button>
              </div>
            </div>
          }
        >
          <section class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
            <div class="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-text-strong">{language.t("store.console.capabilities.title")}</h2>
                <p class="mt-1 text-sm text-text-weak">{language.t("store.console.capabilities.description")}</p>
              </div>
              <Button
                size="small"
                variant="ghost"
                class="border border-border-weak-base cursor-pointer"
                onClick={openCreateCapability}
              >
                <Icon name="plus" class="size-4" />
                {language.t("store.console.newCapability")}
              </Button>
            </div>

            <Show when={state.filtersShown || state.items.length > 0 || state.totalItems > 0}>
              <div class="mb-4 flex flex-wrap gap-2">
                <For each={["all", "skill", "subagent", "command", "mcp"]}>
                  {(type) => (
                    <button
                      class="cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors"
                      classList={{
                        "border-border-strong bg-surface-info-base/20 text-text-strong": state.itemTypeFilter === type,
                        "border-border-weak-base text-text-weak hover:text-text-strong": state.itemTypeFilter !== type,
                      }}
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
              fallback={<div class="text-sm text-text-weak">{language.t("store.console.capabilities.loading")}</div>}
            >
              <Show
                when={state.totalItems > 0 || state.items.length > 0}
                fallback={
                  <div class="rounded-xl border border-dashed border-border-weak-base px-8 py-10 text-center text-sm text-text-weak">
                    {language.t("store.console.capabilities.empty")}
                  </div>
                }
              >
                <div class="overflow-hidden rounded-xl border border-border-weak-base bg-surface-base">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-border-weak-base bg-surface-base">
                        <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                          {language.t("store.console.capabilities.name")}
                        </th>
                        <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                          {language.t("store.console.capabilities.type")}
                        </th>
                        <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                          {language.t("store.console.capabilities.visibility")}
                        </th>
                        <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                          {language.t("store.console.capabilities.source")}
                        </th>
                        <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                          {language.t("common.operation")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={state.items}>
                        {(item) => (
                          <tr
                            class="border-b border-border-weak-base last:border-0 cursor-pointer hover:bg-surface-secondary/50"
                            onClick={() =>
                              navigate(
                                `/store/items/${item.id}?type=${item.itemType}&from=/store/dashboard/capabilities`,
                              )
                            }
                          >
                            <td class="px-4 py-3">
                              <div class="text-13-medium text-text-strong">{item.name}</div>
                              <div class="mt-1 text-12-regular text-text-weak">{item.slug}</div>
                            </td>
                            <td class="px-4 py-3">
                              <span
                                class="inline-flex items-center rounded-[10px] px-2.5 py-[3px] text-xs font-medium"
                                style={{
                                  "background-color": `color-mix(in srgb, ${
                                    item.itemType === "skill"
                                      ? "rgb(234,179,8)"
                                      : item.itemType === "subagent"
                                        ? "rgb(59,130,246)"
                                        : item.itemType === "command"
                                          ? "rgb(34,197,94)"
                                          : "rgb(168,85,247)"
                                  } 12%, transparent)`,
                                  color:
                                    item.itemType === "skill"
                                      ? "rgb(234,179,8)"
                                      : item.itemType === "subagent"
                                        ? "rgb(59,130,246)"
                                        : item.itemType === "command"
                                          ? "rgb(34,197,94)"
                                          : "rgb(168,85,247)",
                                }}
                              >
                                {typeLabel(item.itemType)}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <span
                                class="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-[3px] text-xs font-medium"
                                style={{
                                  "background-color":
                                    item.repoVisibility === "public"
                                      ? "color-mix(in srgb, #22c55e 12%, transparent)"
                                      : item.repoVisibility === "private"
                                        ? "color-mix(in srgb, #f59e0b 12%, transparent)"
                                        : "rgba(156,163,175,0.12)",
                                  color:
                                    item.repoVisibility === "public"
                                      ? "#22c55e"
                                      : item.repoVisibility === "private"
                                        ? "#f59e0b"
                                        : "var(--color-text-weak)",
                                }}
                              >
                                {item.repoVisibility === "public"
                                  ? language.t("store.capabilityDialog.visibility.public")
                                  : item.repoVisibility === "private"
                                    ? language.t("store.capabilityDialog.visibility.private")
                                    : "-"}
                              </span>
                            </td>
                            <td class="px-4 py-3 text-12-regular text-text-weak">{item.repoName || "—"}</td>
                            <td class="px-4 py-3">
                              <div class="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="h-8 w-8 p-0 cursor-pointer"
                                  onClick={() => openMoveCapability(item)}
                                  title={language.t("store.console.capabilities.move")}
                                >
                                  <Icon name="share" size="small" />
                                </Button>
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="h-8 w-8 p-0 cursor-pointer"
                                  onClick={() => openEditCapability(item)}
                                  title={language.t("store.console.capabilities.edit")}
                                >
                                  <Icon name="edit" size="small" />
                                </Button>
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="h-8 w-8 p-0 cursor-pointer"
                                  onClick={() => handleDeleteItem(item.id)}
                                  title={language.t("store.console.capabilities.delete")}
                                >
                                  <Icon name="trash" size="small" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>

                <Show when={totalPages() > 1}>
                  <div class="mt-4 flex items-center justify-between">
                    <p class="text-xs text-text-weak">
                      {language.t("store.console.capabilities.showing", {
                        from: (state.itemPage - 1) * PAGE_SIZE + 1,
                        to: Math.min(state.itemPage * PAGE_SIZE, state.totalItems),
                        total: state.totalItems,
                      })}
                    </p>
                    <div class="flex items-center gap-1">
                      <Button
                        size="small"
                        variant="ghost"
                        class="h-8 px-2 text-xs"
                        disabled={state.itemPage <= 1}
                        onClick={() => {
                          const p = Math.max(1, state.itemPage - 1)
                          setState("itemPage", p)
                          void loadItems(p)
                        }}
                      >
                        <Icon name="chevron-left" size="small" />
                      </Button>
                      <For each={pages()}>
                        {(p) => (
                          <Show
                            when={p !== "..."}
                            fallback={
                              <span class="flex h-8 min-w-8 items-center justify-center text-xs text-text-weak">
                                ...
                              </span>
                            }
                          >
                            <button
                              class="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-xs transition-colors"
                              classList={{
                                "bg-bg-muted text-text-strong font-medium": state.itemPage === p,
                                "text-text-weak hover:text-text-strong hover:bg-bg-muted": state.itemPage !== p,
                              }}
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
                      <Button
                        size="small"
                        variant="ghost"
                        class="h-8 px-2 text-xs"
                        disabled={state.itemPage >= totalPages()}
                        onClick={() => {
                          const p = Math.min(totalPages(), state.itemPage + 1)
                          setState("itemPage", p)
                          void loadItems(p)
                        }}
                      >
                        <Icon name="chevron-right" size="small" />
                      </Button>
                    </div>
                  </div>
                </Show>
              </Show>
            </Show>
          </section>
        </Show>
      </Show>
    </div>
  )
}

import { Component, createMemo, createSignal, onMount, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Switch } from "@opencode-ai/ui/switch"
import { useLanguage } from "@/context/language"
import { useConversationAdapter } from "@/context/device-adapter"
import { useSync } from "@/context/sync"
import { showToast } from "@opencode-ai/ui/toast"

type FavoriteItem = {
  slug: string
  name: string
  description?: string
  itemType: "skill" | "agent" | "command" | "mcp"
  status: "Cloud" | "Downloaded" | "Active" | "Unloaded"
}

const TYPE_LABEL: Record<string, string> = {
  skill: "Skill",
  agent: "Agent",
  command: "Command",
  mcp: "MCP",
}

function StatusBadge(props: { status: FavoriteItem["status"] }) {
  const language = useLanguage()
  switch (props.status) {
    case "Active":
      return (
        <span class="text-11-regular text-text-success px-1.5 py-0.5 bg-surface-success rounded">
          {language.t("command.favorites.status.active")}
        </span>
      )
    case "Downloaded":
      return (
        <span class="text-11-regular text-text-info px-1.5 py-0.5 bg-surface-info rounded">
          {language.t("command.favorites.status.downloaded")}
        </span>
      )
    case "Unloaded":
      return (
        <span class="text-11-regular text-text-weak px-1.5 py-0.5 bg-surface-raised-base rounded">
          {language.t("command.favorites.status.unloaded")}
        </span>
      )
    case "Cloud":
      return (
        <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
          {language.t("command.favorites.status.cloud")}
        </span>
      )
    default:
      return null
  }
}

export const DialogFavorites: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const api = useConversationAdapter()
  const sync = useSync()

  const [items, setItems] = createSignal<FavoriteItem[]>([])
  const [loading, setLoading] = createSignal(false)
  const [loadingSlug, setLoadingSlug] = createSignal<string | null>(null)

  const fetchFavorites = async () => {
    setLoading(true)
    try {
      const res = await api.favoriteList()
      const list = (res.data ?? []) as FavoriteItem[]
      setItems(list)
    } catch (e) {
      showToast({
        title: language.t("command.favorites.fetchError"),
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  const runAction = async (slug: string, action: "load" | "unload") => {
    if (loadingSlug() !== null) return
    setLoadingSlug(slug)
    try {
      const fn = action === "load" ? api.favoriteLoad : api.favoriteUnload
      await fn(slug)
      showToast({
        title: language.t(action === "load" ? "command.favorites.enabled" : "command.favorites.disabled", { name: slug }),
        variant: "success",
      })
      setItems((prev) =>
        prev.map((item) =>
          item.slug === slug ? { ...item, status: action === "load" ? "Active" : "Unloaded" } : item,
        ),
      )
      sync.set("command", [])
      await sync.command.load()
      await fetchFavorites()
    } catch (e) {
      showToast({
        title: language.t("command.favorites.toggleError"),
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      })
    } finally {
      setLoadingSlug(null)
    }
  }

  const favorites = createMemo(() => items())

  onMount(() => {
    void fetchFavorites()
  })

  return (
    <Dialog
      title={language.t("command.favorites.title")}
      description={language.t("command.favorites.description")}
    >
      <Show
        when={!loading() || favorites().length > 0}
        fallback={
          <div class="text-text-weak px-2 py-4 text-center">
            {language.t("command.favorites.loading")}
          </div>
        }
      >
        <Show
          when={favorites().length > 0}
          fallback={
            <div class="text-text-weak px-2 py-4 text-center">
              {language.t("command.favorites.empty")}
            </div>
          }
        >
          <List
            items={favorites()}
            key={(f) => f.slug}
            onSelect={() => dialog.close()}
          >
            {(f) => {
              const isLoading = loadingSlug() === f.slug
              const isActive = f.status === "Active"
              return (
                <div class="flex items-center justify-between w-full gap-4 py-1">
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-text-strong">{f.name}</span>
                      <StatusBadge status={f.status} />
                      <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                        {TYPE_LABEL[f.itemType] ?? f.itemType}
                      </span>
                    </div>
                    {f.description && (
                      <span class="text-xs text-foreground-muted truncate max-w-full">{f.description}</span>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={isActive}
                      disabled={isLoading}
                      onChange={() => void runAction(f.slug, isActive ? "unload" : "load")}
                    />
                  </div>
                </div>
              )
            }}
          </List>
        </Show>
      </Show>
    </Dialog>
  )
}

import { createMemo, createSignal, onMount } from "solid-js"
import { DialogSelect, type DialogSelectOption, type DialogSelectRef } from "@tui/ui/dialog-select"
import { useTheme } from "../context/theme"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "../ui/toast"
import { Keybind } from "@/util/keybind"
import { TextAttributes } from "@opentui/core"

type FavoriteItem = {
  id: string
  slug: string
  name: string
  description: string
  status: "Cloud" | "Downloaded" | "Active" | "Unloaded"
  localPath?: string
}

function Status(props: { status: FavoriteItem["status"]; loading: boolean }) {
  const { theme } = useTheme()
  if (props.loading) {
    return <span style={{ fg: theme.textMuted }}>... Loading</span>
  }
  switch (props.status) {
    case "Active":
      return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Active</span>
    case "Downloaded":
      return <span style={{ fg: theme.info }}>↓ Downloaded</span>
    case "Unloaded":
      return <span style={{ fg: theme.textMuted }}>○ Unloaded</span>
    case "Cloud":
      return <span style={{ fg: theme.textMuted }}>☁ Cloud</span>
  }
}

export function DialogFavorite() {
  const sdk = useSDK()
  const toast = useToast()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<string | null>(null)
  const [items, setItems] = createSignal<FavoriteItem[]>([])
  const [fetching, setFetching] = createSignal(true)

  async function fetchFavorites() {
    try {
      const res = await sdk.fetch(`${sdk.url}/global/favorite/skills`)
      if (!res.ok) throw new Error("Failed to fetch favorites")
      setItems((await res.json()) as FavoriteItem[])
    } catch (e) {
      toast.show({
        variant: "error",
        message: e instanceof Error ? e.message : "Failed to fetch favorites",
        duration: 5000,
      })
    } finally {
      setFetching(false)
    }
  }

  async function runAction(slug: string, action: string) {
    if (loading() !== null) return
    setLoading(slug)
    try {
      const res = await sdk.fetch(`${sdk.url}/global/favorite/skills/${slug}/${action}`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error((body as { error?: string }).error || "Request failed")
      }
      toast.show({
        variant: "success",
        message: `${action} ${slug} successfully`,
        duration: 3000,
      })
      await fetchFavorites()
    } catch (e) {
      toast.show({
        variant: "error",
        message: e instanceof Error ? e.message : `Failed to ${action} skill`,
        duration: 5000,
      })
    } finally {
      setLoading(null)
    }
  }

  onMount(() => {
    fetchFavorites()
  })

  const options = createMemo(() => {
    const loadingSlug = loading()
    if (fetching() && items().length === 0) {
      return [
        {
          value: "__loading__",
          title: "Loading favorites...",
          disabled: true,
        },
      ]
    }
    if (items().length === 0) {
      return [
        {
          value: "__empty__",
          title: "No cloud favorites found",
          disabled: true,
        },
      ]
    }
    return items().map((item) => ({
      value: item.slug,
      title: item.name,
      description: item.description,
      footer: <Status status={item.status} loading={loadingSlug === item.slug} />,
    }))
  })

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (option.disabled) return
        const item = items().find((i) => i.slug === option.value)
        if (!item) return
        const action = item.status === "Active" ? "unload" : "load"
        await runAction(item.slug, action)
      },
    },
    {
      keybind: Keybind.parse("x")[0],
      title: "uninstall",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (option.disabled) return
        const item = items().find((i) => i.slug === option.value)
        if (!item || item.status === "Cloud") return
        await runAction(item.slug, "uninstall")
      },
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title="Favorite Skills"
      options={options()}
      keybind={keybinds()}
      onSelect={() => {
        // Don't close on select, only on escape
      }}
    />
  )
}

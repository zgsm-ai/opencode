import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import type { WecomChannel } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { AddWecomChannelDialog } from "./add-wecom-channel-dialog"
import { EditWecomChannelDialog } from "./edit-wecom-channel-dialog"
import { WecomChannelCard } from "./wecom-channel-card"
import { notificationChannelService } from "../lib/notification-channel-service"
import { ConfirmDialog } from "./confirm-dialog"

type NotificationChannelsSectionProps = {
  channels?: () => WecomChannel[] | undefined
  loading?: () => boolean
  setChannels?: (fn: (items: WecomChannel[] | undefined) => WecomChannel[] | undefined) => void
}

export function NotificationChannelsSection(props: NotificationChannelsSectionProps = {}) {
  const dialog = useDialog()
  const language = useLanguage()
  const local = !props.channels
    ? createResource(async () => notificationChannelService.listWecom())
    : undefined

  const channels = () => props.channels?.() ?? local?.[0]()
  const loading = () => props.loading?.() ?? local?.[0].loading ?? false
  const mutate = props.setChannels ?? local?.[1].mutate ?? (() => undefined)

  const wecomChannels = createMemo(() => channels() ?? [])

  const openAddDialog = () => {
    dialog.show(() => (
      <AddWecomChannelDialog
        onCreated={async (payload) => {
          try {
            const created = await notificationChannelService.createWecom(payload)
            mutate((list) => [created, ...(list ?? [])])
            showToast({
              variant: "success",
              icon: "circle-check",
              title: language.t("store.notificationChannels.toast.created"),
            })
          } catch (error) {
            showToast({
              variant: "error",
              icon: "circle-x",
              title: language.t("store.notificationChannels.toast.createFailed"),
              description: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        }}
      />
    ))
  }

  const openEditDialog = (channel: WecomChannel) => {
    dialog.show(() => <EditWecomChannelDialog channel={channel} onSaved={handleUpdate} />)
  }

  const handleUpdate = async (id: string, patch: Partial<WecomChannel>) => {
    const current = wecomChannels()
    const target = current.find((item) => item.id === id)
    if (!target) return
    const optimistic: WecomChannel = {
      ...target,
      ...patch,
      events: {
        ...target.events,
        ...(patch.events ?? {}),
      },
    }
    mutate((list) => (list ?? []).map((item) => (item.id === id ? optimistic : item)))
    try {
      const updated = await notificationChannelService.updateWecom(id, patch)
      mutate((list) => (list ?? []).map((item) => (item.id === id ? updated : item)))
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.notificationChannels.toast.updated"),
      })
    } catch (error) {
      mutate(() => current)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.notificationChannels.toast.updateFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleRemove = (id: string) => {
    const target = wecomChannels().find((item) => item.id === id)
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("common.delete")}
        description={language.t("store.notificationChannels.confirmDelete", { name: target?.name ?? "" })}
        onConfirm={async () => {
          const current = wecomChannels()
          mutate((list) => (list ?? []).filter((item) => item.id !== id))
          try {
            await notificationChannelService.removeWecom(id)
            showToast({
              variant: "success",
              icon: "circle-check",
              title: language.t("store.notificationChannels.toast.deleted"),
            })
          } catch (error) {
            mutate(() => current)
            showToast({
              variant: "error",
              icon: "circle-x",
              title: language.t("store.notificationChannels.toast.deleteFailed"),
              description: error instanceof Error ? error.message : String(error),
            })
          }
        }}
      />
    ))
  }

  const handleTest = async (id: string) => {
    try {
      const res = await notificationChannelService.testWecom(id)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.notificationChannels.toast.testSent"),
        description: res.message || language.t("store.notificationChannels.toast.testSentDescription"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.notificationChannels.toast.testFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <section class="store-cshell">
      <div class="store-tbar">
        <div>
          <h2 class="store-tbar-title">{language.t("store.notificationChannels.title")}</h2>
          <p class="store-tbar-sub">{language.t("store.notificationChannels.description")}</p>
        </div>
        <button class="store-fbtn store-fbtn-primary" onClick={openAddDialog}>
          <Icon name="plus" size="small" />
          {language.t("store.notificationChannels.add")}
        </button>
      </div>

      <Show
        when={!loading()}
        fallback={<div class="store-dash-empty">{language.t("store.notificationChannels.loading")}</div>}
      >
        <Show
          when={wecomChannels().length > 0}
          fallback={
            <div class="store-dash-empty">
              {language.t("store.notificationChannels.empty")}
            </div>
          }
        >
          <div class="store-dash-grid store-dash-grid-3">
            <For each={wecomChannels()}>
              {(channel) => (
                <WecomChannelCard
                  channel={channel}
                  onEdit={openEditDialog}
                  onUpdate={handleUpdate}
                  onRemove={handleRemove}
                  onTest={handleTest}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import type { WecomChannel } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { AddWecomChannelDialog } from "./add-wecom-channel-dialog"
import { EditWecomChannelDialog } from "./edit-wecom-channel-dialog"
import { WecomChannelCard } from "./wecom-channel-card"
import { notificationChannelService } from "../lib/notification-channel-service"
import { ConfirmDialog } from "./confirm-dialog"

export function NotificationChannelsSection() {
  const dialog = useDialog()
  const language = useLanguage()
  const [channels, { mutate, refetch }] = createResource(async () => notificationChannelService.listWecom())

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
      mutate(current)
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
            mutate(current)
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
    <section class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-text-strong">{language.t("store.notificationChannels.title")}</h2>
          <p class="mt-1 text-sm text-text-weak">{language.t("store.notificationChannels.description")}</p>
        </div>
        <Button size="small" variant="ghost" class="border border-border-weak-base" onClick={openAddDialog}>
          {language.t("store.notificationChannels.add")}
        </Button>
      </div>

      <Show
        when={!channels.loading}
        fallback={<div class="text-sm text-text-weak">{language.t("store.notificationChannels.loading")}</div>}
      >
        <Show
          when={wecomChannels().length > 0}
          fallback={
            <div class="rounded-xl border border-dashed border-border-weak-base px-8 py-10 text-center text-sm text-text-weak">
              {language.t("store.notificationChannels.empty")}
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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

import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import type { WecomChannel } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { AddWecomChannelDialog } from "./add-wecom-channel-dialog"
import { EditWecomChannelDialog } from "./edit-wecom-channel-dialog"
import { WecomChannelCard } from "./wecom-channel-card"
import { notificationChannelService } from "../lib/notification-channel-service"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { sx } from "@/pages/store/lib/styles"

export function NotificationChannelsSection() {
  const dialog = useDialog()
  const language = useLanguage()
  const [channels, acts] = createResource(async () => notificationChannelService.listWecom())

  const wecomChannels = createMemo(() => channels() ?? [])

  const openAddDialog = () => {
    dialog.show(() => (
      <AddWecomChannelDialog
        onCreated={async (payload) => {
          try {
            const created = await notificationChannelService.createWecom(payload)
            acts.mutate((list) => [created, ...(list ?? [])])
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
    acts.mutate((list) => (list ?? []).map((item) => (item.id === id ? optimistic : item)))
    try {
      const updated = await notificationChannelService.updateWecom(id, patch)
      acts.mutate((list) => (list ?? []).map((item) => (item.id === id ? updated : item)))
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.notificationChannels.toast.updated"),
      })
    } catch (error) {
      acts.mutate(() => current)
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
          acts.mutate((list) => (list ?? []).filter((item) => item.id !== id))
          try {
            await notificationChannelService.removeWecom(id)
            showToast({
              variant: "success",
              icon: "circle-check",
              title: language.t("store.notificationChannels.toast.deleted"),
            })
          } catch (error) {
            acts.mutate(() => current)
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
    <section class={sx.cshell}>
      <div class={sx.toolbar}>
        <div>
          <h2 class={sx.toolbarTitle}>{language.t("store.notificationChannels.title")}</h2>
          <p class={sx.toolbarSub}>{language.t("store.notificationChannels.description")}</p>
        </div>
        <button
          class="inline-flex min-h-9 items-center justify-center rounded-[var(--native-radius-full)] bg-[var(--native-primary)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--native-primary-foreground)] shadow-[0_1px_4px_color-mix(in_srgb,var(--native-primary)_25%,transparent)] transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--native-primary)_88%,white)] hover:shadow-[var(--native-shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--native-panel)]"
          onClick={openAddDialog}
        >
          {language.t("store.notificationChannels.add")}
        </button>
      </div>

      <Show
        when={!channels.loading}
        fallback={<div class={sx.empty}>{language.t("store.notificationChannels.loading")}</div>}
      >
        <Show
          when={wecomChannels().length > 0}
          fallback={
            <div class={sx.empty}>
              {language.t("store.notificationChannels.empty")}
            </div>
          }
        >
          <div class={sx.dashGrid2}>
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
